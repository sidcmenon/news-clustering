import sqlite3, os
import numpy as np
from datetime import datetime, timezone, timedelta

DB_PATH = os.environ.get("DB_PATH", "news_drift.db")
def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
            url          TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            summary      TEXT DEFAULT '',
            source       TEXT NOT NULL,
            published_at TEXT,
            fetched_at   TEXT NOT NULL,
            embedding    BLOB,
            x            REAL,
            y            REAL,
            thread_id    INTEGER
        );

        CREATE TABLE IF NOT EXISTS thread_history (
            thread_id     INTEGER NOT NULL,
            hour          TEXT NOT NULL,
            article_count INTEGER NOT NULL,
            PRIMARY KEY (thread_id, hour)
        );
    """)
    conn.commit()
    conn.close()

def insert_articles(articles: list[dict])-> int:
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    result = conn.executemany(
        """
        INSERT OR IGNORE INTO articles (url, title, summary, source, published_at, fetched_at)
        VALUES (:url, :title, :summary, :source, :published_at, :fetched_at)
        """,
        [{**a, "fetched_at": now} for a in articles],
    )
    conn.commit()
    n = result.rowcount
    conn.close()
    return n

def get_unembedded() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT url, title, summary FROM articles WHERE embedding IS NULL"
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

def upsert_embeddings(pairs: list[tuple[str, np.ndarray]]) -> None:
    conn = get_connection()
    conn.executemany(
        "UPDATE articles SET embedding = ? WHERE url = ?",
        [(arr.astype(np.float32).tobytes(), url) for url, arr in pairs],
    )
    conn.commit()
    conn.close()

def get_window(hours: int = 72) -> list[dict]:
    conn = get_connection()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = conn.execute(
        "SELECT * FROM articles WHERE fetched_at >= ? AND embedding IS NOT NULL",
        (cutoff.isoformat(),),
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        d = dict(row)
        if d["embedding"]:
            d["embedding"] = np.frombuffer(d["embedding"], dtype = np.float32).copy()
        result.append(d)
    return result

def get_unprojected() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT url, embedding FROM articles
        WHERE embedding IS NOT NULL AND x IS NULL
        """
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        d["embedding"] = np.frombuffer(d["embedding"], dtype=np.float32).copy()
        result.append(d)
    return result

def upsert_coordinates(triples: list[tuple[str, float, float]]) -> None:
    conn = get_connection()
    conn.executemany(
        "UPDATE articles SET x = ?, y = ? WHERE url = ?",
        [(x, y, url) for url, x, y in triples],
    )
    conn.commit()
    conn.close()

def upsert_thread_ids(pairs: list[tuple[str, int]]) -> None:
    conn = get_connection()
    conn.executemany(
        "UPDATE articles SET thread_id = ? WHERE url = ?",
        [(thread_id, url) for url, thread_id in pairs],
    )
    conn.commit()
    conn.close()

def get_thread_history(thread_ids: list[int]) -> dict[int, dict[str, int]]:
    conn = get_connection()
    placeholders = ",".join("?" * len(thread_ids))
    rows = conn.execute(
        f"SELECT thread_id, hour, article_count FROM thread_history WHERE thread_id IN ({placeholders})",
        thread_ids,
    ).fetchall()
    conn.close()

    history: dict[int, dict[str, int]] = {}
    for row in rows:
        history.setdefault(row["thread_id"], {})[row["hour"]] = row["article_count"]
    return history

def upsert_thread_history(entries: list[tuple[int, str, int]]) -> None:
    conn = get_connection()
    conn.executemany(
        """
        INSERT INTO thread_history (thread_id, hour, article_count)
        VALUES (?, ?, ?)
        ON CONFLICT (thread_id, hour) DO UPDATE SET article_count = excluded.article_count
        """,
        entries,
    )
    conn.commit()
    conn.close()