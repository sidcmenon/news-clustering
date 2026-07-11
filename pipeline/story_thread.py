from collections import Counter, defaultdict
from datetime import datetime, timezone
import numpy as np
import scipy.sparse
import scipy.sparse.csgraph
import db

# Cosine-similarity threshold for linking two articles into the same story.
# Lowering this below ~0.62 causes single-linkage chaining that collapses
# unrelated stories into one giant component; 0.65 keeps threads distinct.
SIM_THRESHOLD = 0.65

# Max publish-time gap (hours) between two linked articles. A story develops
# over more than a few hours, so a narrow window fragments it across time;
# 36h keeps a story together as outlets pick it up over a day and a half.
MAX_GAP_HOURS = 36.0


def _article_time(a: dict) -> float:
    """Epoch seconds for an article, preferring published_at over fetched_at."""
    for key in ("published_at", "fetched_at"):
        try:
            return datetime.fromisoformat(a[key]).timestamp()
        except (TypeError, ValueError, KeyError):
            continue
    return 0.0


def cluster_articles(
    articles: list[dict],
    sim_threshold: float = SIM_THRESHOLD,
    max_gap_hours: float = MAX_GAP_HOURS,
) -> np.ndarray:
    """Cluster articles into stories by embedding similarity + time proximity.

    Pure function (no DB / wall-clock): returns per-article component labels.
    """
    n = len(articles)
    if n == 0:
        return np.array([], dtype=int)
    if n == 1:
        return np.zeros(1, dtype=int)

    embeddings = np.stack([a["embedding"] for a in articles])
    sim = embeddings @ embeddings.T

    times = np.array([_article_time(a) for a in articles])
    time_diff_hours = np.abs(times[:, None] - times[None, :]) / 3600

    adj = (sim >= sim_threshold) & (time_diff_hours <= max_gap_hours)
    np.fill_diagonal(adj, False)

    _, labels = scipy.sparse.csgraph.connected_components(
        scipy.sparse.csr_matrix(adj),
        directed=False,
        return_labels=True,
    )
    return labels

def _reconcile_thread_ids(
    articles: list[dict],
    component_labels: np.ndarray,
) -> dict[str, int]:

    comp_to_articles = defaultdict(list)
    for i, art in enumerate(articles):
        comp_to_articles[int(component_labels[i])].append(art)

    existing_ids = {a["thread_id"] for a in articles if a["thread_id"] is not None}
    next_id = max(existing_ids, default=0) + 1

    comp_to_thread_id = {}
    for comp_label, comp_articles in comp_to_articles.items():
        existing = [a["thread_id"] for a in comp_articles if a["thread_id"] is not None]

        if existing:
            most_common, count = Counter(existing).most_common(1)[0]
            if count / len(comp_articles) >= 0.5:
                comp_to_thread_id[comp_label] = most_common
                continue

        comp_to_thread_id[comp_label] = next_id
        next_id += 1

    return {
        art["url"]: comp_to_thread_id[int(component_labels[i])]
        for i, art in enumerate(articles)
    }

def build_threads() -> list[int]:
    articles = db.get_window(hours=72)

    if len(articles) < 2:
        return []

    component_labels = cluster_articles(articles)
    n_components = len(set(component_labels.tolist()))

    print(f"Found {n_components} components across {len(articles)} articles")

    url_to_thread_id = _reconcile_thread_ids(articles, component_labels)

    db.upsert_thread_ids(list(url_to_thread_id.items()))

    current_hour = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00+00:00")
    counts = Counter(url_to_thread_id.values())
    db.upsert_thread_history([
        (thread_id, current_hour, count)
        for thread_id, count in counts.items()
    ])

    return list(counts.keys())