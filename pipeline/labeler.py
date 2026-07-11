from collections import defaultdict
from sklearn.feature_extraction.text import TfidfVectorizer
import db

def _build_class_documents(
    thread_ids: list[int],
    all_articles: list[dict],
) -> dict[int, str]:
    by_thread = defaultdict(list)
    for a in all_articles:
        if a["thread_id"] in thread_ids:
            by_thread[a["thread_id"]].append(f"{a['title']}. {a['summary']}")

    return {
        thread_id: " ".join(texts)
        for thread_id, texts in by_thread.items()
    }

def _extract_labels(
    class_docs: dict[int, str],
    top_n: int = 3,
) -> dict[int, str]:
    thread_ids = list(class_docs.keys())
    documents  = [class_docs[tid] for tid in thread_ids]

    if len(documents) == 1:
        # IDF is meaningless with one class — fall back to raw term frequency
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=10_000,
            use_idf=False,
        )
    else:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=10_000,
            sublinear_tf=True,
        )

    matrix = vectorizer.fit_transform(documents)  # (n_threads, n_terms)
    terms  = vectorizer.get_feature_names_out()

    labels = {}
    for i, thread_id in enumerate(thread_ids):
        row     = matrix[i].toarray().flatten()
        top_idx = row.argsort()[-top_n:][::-1]
        top_terms = [terms[j] for j in top_idx if row[j] > 0]

        if top_terms:
            labels[thread_id] = " · ".join(top_terms)
        else:
            labels[thread_id] = f"thread {thread_id}"

    return labels

def generate_labels(thread_ids: list[int]) -> dict[int, str]:
    all_articles = db.get_window(hours=72)
    class_docs   = _build_class_documents(thread_ids, all_articles)

    if not class_docs:
        return {}

    return _extract_labels(class_docs)

