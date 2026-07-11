import json
import os
from datetime import datetime, timezone
from pathlib import Path
import db

PIPELINE_DIR   = Path(__file__).parent
DATA_DIR       = PIPELINE_DIR.parent / "public" / "data"
SNAPSHOTS_DIR  = DATA_DIR / "snapshots"
INDEX_PATH     = DATA_DIR / "index.json"
MAX_SNAPSHOTS  = 48

def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H00Z")

def _build_article_records(
    articles: list[dict],
    velocity_flags: dict[int, str],
) -> list[dict]:
    records = []
    for a in articles:
        if a["x"] is None or a["thread_id"] is None:
            continue
        records.append({
            "id":           a["url"],
            "title":        a["title"],
            "source":       a["source"],
            "url":          a["url"],
            "published_at": a["published_at"],
            "x":            round(a["x"], 4),
            "y":            round(a["y"], 4),
            "thread_id":    a["thread_id"],
            "velocity_flag": velocity_flags.get(a["thread_id"], "stable"),
        })
    return records

def _build_thread_records(
    articles: list[dict],
    velocity_flags: dict[int, str],
    divergence_data: dict[int, dict],
    labels: dict[int, str],
) -> list[dict]:
    from collections import defaultdict

    by_thread = defaultdict(list)
    for a in articles:
        if a["thread_id"] is not None:
            by_thread[a["thread_id"]].append(a)

    records = []
    for thread_id, thread_articles in by_thread.items():
        div = divergence_data.get(thread_id, {})
        records.append({
            "id":              thread_id,
            "label":           labels.get(thread_id, f"thread {thread_id}"),
            "article_count":   len(thread_articles),
            "velocity_flag":   velocity_flags.get(thread_id, "stable"),
            "divergence_score": round(div.get("divergence_score", 0.0), 4),
            "n_outlets":       div.get("n_outlets", 1),
            "outlets":         list(div.get("outlet_distances", {}).keys()),
            "outlet_distances": {
                source: round(dist, 4)
                for source, dist in div.get("outlet_distances", {}).items()
            },
            "article_ids": [a["url"] for a in
                            sorted(thread_articles, key=lambda a: a["fetched_at"] or "", reverse=True)],
        })

    return sorted(records, key=lambda r: r["article_count"], reverse=True)

def _update_index(ts: str, dry_run: bool) -> None:
    if INDEX_PATH.exists() and INDEX_PATH.stat().st_size > 0:
        with open(INDEX_PATH) as f:
            index = json.load(f)
    else:
        index = {"model_version": 1, "snapshots": []}

    meta_path = PIPELINE_DIR / "pacmap_meta.json"
    if meta_path.exists():
        with open(meta_path) as f:
            index["model_version"] = json.load(f).get("model_version", 1)

    # Snapshots are stored oldest-first so the frontend scrubber and playback
    # advance forward in time (left→right, index 0→N).
    if ts not in index["snapshots"]:
        index["snapshots"].append(ts)

    index["snapshots"] = sorted(set(index["snapshots"]))[-MAX_SNAPSHOTS:]
    index["latest"] = index["snapshots"][-1]

    if dry_run:
        print("index.json would be updated:", json.dumps(index, indent=2))
        return

    with open(INDEX_PATH, "w") as f:
        json.dump(index, f, indent=2)

def _prune_old_snapshots(current_snapshots: list[str], dry_run: bool) -> None:
    keep = set()
    for ts in current_snapshots:
        keep.add(f"snapshot_{ts}.json")
        keep.add(f"threads_{ts}.json")

    for path in SNAPSHOTS_DIR.glob("*.json"):
        if path.name not in keep:
            if dry_run:
                print(f"Would delete: {path.name}")
            else:
                path.unlink()
                print(f"Pruned: {path.name}")

def write_snapshot(
    velocity_flags: dict[int, str],
    divergence_data: dict[int, dict],
    labels: dict[int, str],
    dry_run: bool = False,
) -> None:
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    articles       = db.get_window(hours=72)
    ts             = _timestamp()
    article_records = _build_article_records(articles, velocity_flags)
    thread_records  = _build_thread_records(articles, velocity_flags, divergence_data, labels)

    snapshot_path = SNAPSHOTS_DIR / f"snapshot_{ts}.json"
    threads_path  = SNAPSHOTS_DIR / f"threads_{ts}.json"

    if dry_run:
        print(f"Would write {len(article_records)} articles to {snapshot_path.name}")
        print(f"Would write {len(thread_records)} threads to {threads_path.name}")
    else:
        with open(snapshot_path, "w") as f:
            json.dump(article_records, f, separators=(",", ":"))
        with open(threads_path, "w") as f:
            json.dump(thread_records, f, separators=(",", ":"))
        print(f"Wrote {len(article_records)} articles, {len(thread_records)} threads ({ts})")

    _update_index(ts, dry_run)

    if INDEX_PATH.exists():
        with open(INDEX_PATH) as f:
            current_snapshots = json.load(f)["snapshots"]
        _prune_old_snapshots(current_snapshots, dry_run)

