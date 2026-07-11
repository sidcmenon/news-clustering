import numpy as np
from sentence_transformers import SentenceTransformer

import db

_model: SentenceTransformer | None = None

def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print("Loading BAAI/bge-base-en-v1.5...")
        _model = SentenceTransformer("BAAI/bge-base-en-v1.5")
    return _model

def embed_pending() -> int:
    articles = db.get_unembedded()
    if not articles:
        return 0

    model = _get_model()

    texts = [f"{a['title']}. {a['summary']}" for a in articles]

    embeddings = model.encode(
        texts,
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )

    pairs = [(a["url"], emb) for a, emb in zip(articles, embeddings)]
    db.upsert_embeddings(pairs)

    return len(articles)