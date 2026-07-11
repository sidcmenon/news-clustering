import json
import os
from datetime import datetime, timezone
import joblib
import numpy as np
import umap
import db

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pacmap_model.joblib")
META_PATH  = os.path.join(os.path.dirname(__file__), "pacmap_meta.json")

def _load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        return joblib.load(MODEL_PATH)
    except Exception as e:
        print(f"Failed to load PaCMAP model: {e}")
        return None
    
def _read_model_version() -> int:
    if not os.path.exists(META_PATH):
        return 0
    with open(META_PATH) as f:
        return json.load(f).get("model_version", 0)
    
def _fit_model(embeddings: np.ndarray):
    print(f"Fitting PaCMAP on {len(embeddings)} articles...")

    model = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.1,
    metric="cosine",
    random_state=42,
    )

    xy = model.fit_transform(embeddings)

    joblib.dump(model, MODEL_PATH)

    version = _read_model_version() + 1
    with open(META_PATH, "w") as f:
        json.dump({
            "model_version": version,
            "fitted_at": datetime.now(timezone.utc).isoformat(),
            "n_articles": len(embeddings),
        }, f)

    print(f"PaCMAP model saved (version {version})")
    return model, xy

def ensure_model(refit: bool):
    if not refit:
        model = _load_model()
        if model is not None:
            return model
        print("No model found — fitting from scratch")

    articles = db.get_window(hours=72)
    if not articles:
        raise RuntimeError("No articles in DB to fit PaCMAP on")

    embeddings = np.stack([a["embedding"] for a in articles])
    model, xy  = _fit_model(embeddings)

    triples = [(a["url"], float(x), float(y)) for a, (x, y) in zip(articles, xy)]
    db.upsert_coordinates(triples)
    print(f"Updated coordinates for {len(triples)} articles")

    return model

def project_pending(model) -> int:
    articles = db.get_unprojected()
    if not articles:
        return 0

    all_articles = db.get_window(hours=72)
    embeddings = np.stack([a["embedding"] for a in articles])
    xy = model.transform(embeddings)

    triples = [(a["url"], float(x), float(y)) for a, (x, y) in zip(articles, xy)]
    db.upsert_coordinates(triples)

    return len(articles)
