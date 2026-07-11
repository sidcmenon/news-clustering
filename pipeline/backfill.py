"""Replay the article DB hour-by-hour to build a snapshot time series.

The live pipeline emits one snapshot per run. To visualize how stories *develop*
over time, this script reconstructs what each hourly snapshot would have looked
like using each article's real `published_at` — clustering, velocity flags,
divergence and labels are all recomputed "as of" that hour, with thread IDs kept
stable across hours so a story keeps its identity (and colour) as it grows.

Read-only w.r.t. the database: it only writes JSON into public/data/.

Usage:
    python backfill.py [--hours 36] [--retention 72] [--min-articles 3]
"""
import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import db
import divergence
import exporter
import labeler
import scorer
import story_thread


def _effective_dt(a: dict) -> datetime | None:
    for key in ("published_at", "fetched_at"):
        try:
            return datetime.fromisoformat(a[key])
        except (TypeError, ValueError, KeyError):
            continue
    return None


def _load_articles() -> list[dict]:
    """All embedded + projected articles, with an effective timestamp attached."""
    articles = db.get_window(hours=10**7)  # effectively unbounded
    out = []
    for a in articles:
        if a["x"] is None or a["y"] is None:
            continue
        dt = _effective_dt(a)
        if dt is None:
            continue
        a["_dt"] = dt
        out.append(a)
    out.sort(key=lambda a: a["_dt"])
    return out


def _reconcile_ids(
    subset: list[dict],
    labels,
    prev_url_to_tid: dict[str, int],
    next_id: list[int],
) -> dict[str, int]:
    """Map this hour's local components to stable global thread IDs.

    A component inherits the global ID that the plurality of its members carried
    in the previous hour (largest component wins ties for a shared ID), so a
    growing story keeps one identity across snapshots. New components get fresh
    IDs.
    """
    comp_to_idx: dict[int, list[int]] = defaultdict(list)
    for i, lbl in enumerate(labels):
        comp_to_idx[int(lbl)].append(i)

    assignment: dict[int, int] = {}
    used: set[int] = set()

    # Largest components first so the main body of a story keeps the old ID.
    for comp in sorted(comp_to_idx, key=lambda c: -len(comp_to_idx[c])):
        prev_ids = [
            prev_url_to_tid[subset[i]["url"]]
            for i in comp_to_idx[comp]
            if subset[i]["url"] in prev_url_to_tid
        ]
        chosen = None
        for tid, _count in Counter(prev_ids).most_common():
            if tid not in used:
                chosen = tid
                break
        if chosen is None:
            chosen = next_id[0]
            next_id[0] += 1
        used.add(chosen)
        assignment[comp] = chosen

    return {subset[i]["url"]: assignment[int(lbl)] for i, lbl in enumerate(labels)}


def _clear_snapshots() -> None:
    for path in exporter.SNAPSHOTS_DIR.glob("*.json"):
        path.unlink()


def run(hours: int, retention: int, min_articles: int) -> None:
    articles = _load_articles()
    if len(articles) < min_articles:
        raise SystemExit(f"Not enough projected articles ({len(articles)}) to backfill.")

    end = articles[-1]["_dt"].replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(hours=hours)

    exporter.SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    _clear_snapshots()

    prev_url_to_tid: dict[str, int] = {}
    next_id = [1]
    history: dict[int, dict[str, int]] = defaultdict(dict)
    written_ts: list[str] = []

    step = start
    while step <= end:
        as_of = step
        step = step + timedelta(hours=1)

        hour_str = as_of.strftime("%Y-%m-%dT%H:00:00+00:00")
        ts = as_of.strftime("%Y%m%dT%H00Z")
        retention_start = as_of - timedelta(hours=retention)

        subset = [
            a for a in articles
            if retention_start < a["_dt"] <= as_of
        ]
        if len(subset) < min_articles:
            continue

        labels = story_thread.cluster_articles(subset)
        url_to_tid = _reconcile_ids(subset, labels, prev_url_to_tid, next_id)
        prev_url_to_tid = url_to_tid

        for a in subset:
            a["thread_id"] = url_to_tid[a["url"]]

        counts = Counter(url_to_tid.values())
        for tid, cnt in counts.items():
            history[tid][hour_str] = cnt
        thread_ids = list(counts.keys())

        flags = {
            tid: scorer._classify(history[tid], hour_str, now=as_of)
            for tid in thread_ids
        }

        by_thread: dict[int, list[dict]] = defaultdict(list)
        for a in subset:
            by_thread[a["thread_id"]].append(a)
        div_data = {}
        for tid, arts in by_thread.items():
            d = divergence._compute_thread_divergence(arts)
            if d is not None:
                div_data[tid] = d

        class_docs = labeler._build_class_documents(thread_ids, subset)
        labels_map = labeler._extract_labels(class_docs) if class_docs else {}

        article_records = exporter._build_article_records(subset, flags)
        thread_records = exporter._build_thread_records(subset, flags, div_data, labels_map)

        with open(exporter.SNAPSHOTS_DIR / f"snapshot_{ts}.json", "w") as f:
            json.dump(article_records, f, separators=(",", ":"))
        with open(exporter.SNAPSHOTS_DIR / f"threads_{ts}.json", "w") as f:
            json.dump(thread_records, f, separators=(",", ":"))

        written_ts.append(ts)
        n_multi = sum(1 for c in counts.values() if c >= 2)
        breaking = sum(1 for v in flags.values() if v == "breaking")
        print(f"{ts}: {len(article_records):3d} articles, {len(thread_records):3d} threads "
              f"({n_multi} multi-outlet, {breaking} breaking)")

    if not written_ts:
        raise SystemExit("No snapshots written — check --min-articles / data window.")

    model_version = 1
    meta_path = Path(exporter.PIPELINE_DIR) / "pacmap_meta.json"
    if meta_path.exists():
        with open(meta_path) as f:
            model_version = json.load(f).get("model_version", 1)

    index = {
        "model_version": model_version,
        "snapshots": written_ts,       # oldest-first
        "latest": written_ts[-1],
    }
    with open(exporter.INDEX_PATH, "w") as f:
        json.dump(index, f, indent=2)

    print(f"\nWrote {len(written_ts)} snapshots — {written_ts[0]} → {written_ts[-1]}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Backfill an hourly snapshot time series.")
    p.add_argument("--hours", type=int, default=36, help="Hours of history to replay.")
    p.add_argument("--retention", type=int, default=72, help="Hours each snapshot looks back.")
    p.add_argument("--min-articles", type=int, default=3, help="Skip hours with fewer articles.")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(hours=args.hours, retention=args.retention, min_articles=args.min_articles)
