from collections import defaultdict
from itertools import combinations
import numpy as np
import db

def _normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    if norm == 0:
        return v
    return v / norm

def _cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(1.0 - np.dot(_normalize(a), _normalize(b)))

def _compute_thread_divergence(articles: list[dict]) -> dict | None:
    by_source = defaultdict(list)
    for a in articles:
        by_source[a["source"]].append(a["embedding"])

    if len(by_source) < 2:
        return None

    outlet_centroids = {
        source: _normalize(np.mean(np.stack(embs), axis=0))
        for source, embs in by_source.items()
    }

    all_embeddings = np.stack([a["embedding"] for a in articles])
    thread_centroid = _normalize(np.mean(all_embeddings, axis=0))

    outlet_distances = {
        source: _cosine_distance(centroid, thread_centroid)
        for source, centroid in outlet_centroids.items()
    }

    pairs = list(combinations(outlet_centroids.values(), 2))
    divergence_score = float(np.mean([
        _cosine_distance(a, b) for a, b in pairs
    ]))

    return {
        "divergence_score": divergence_score,
        "outlet_distances": outlet_distances,
        "n_outlets": len(by_source),
    }
def compute_divergence(thread_ids: list[int]) -> dict[int, dict]:
    all_articles = db.get_window(hours=72)

    by_thread = defaultdict(list)
    for a in all_articles:
        if a["thread_id"] in thread_ids:
            by_thread[a["thread_id"]].append(a)

    results = {}
    for thread_id in thread_ids:
        articles = by_thread.get(thread_id, [])
        result = _compute_thread_divergence(articles)
        if result is not None:
            results[thread_id] = result

    return results