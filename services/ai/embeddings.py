"""Embedding model + the item_embeddings table (activities and packages)."""
import os

import psycopg
from fastembed import TextEmbedding
from psycopg.rows import dict_row

MODEL_NAME = "BAAI/bge-small-en-v1.5"  # 384 dims, must match db/06-embeddings.sql
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "  # bge convention for queries

_model = None


def model() -> TextEmbedding:
    global _model
    if _model is None:
        _model = TextEmbedding(MODEL_NAME, cache_dir=os.environ.get("MODEL_CACHE", "/models"))
    return _model


def embed(text: str) -> list[float]:
    return next(iter(model().embed([text]))).tolist()


def vec(v: list[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in v) + "]"


def connect():
    # ponytail: one connection per call, fine at this volume; add a pool if events get hot
    return psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row)


def describe(kind: str, row: dict) -> str:
    """The text we embed for a row (an activities or travel_packages record)."""
    if kind == "activity":
        parts = [row["title"], row.get("activity_type"), row.get("description"), row.get("location_name")]
    else:
        parts = [row["title"], row.get("category"), row.get("description"), row.get("destination"), f"{row.get('duration_days', 1)} days"]
    return ". ".join(str(p) for p in parts if p)


def upsert(conn, kind: str, row: dict) -> bool:
    """Embed and store one row. Returns False when the text hasn't changed (nothing to do)."""
    content = describe(kind, row)
    old = conn.execute("SELECT content FROM item_embeddings WHERE kind = %s AND item_id = %s", (kind, row["id"])).fetchone()
    if old and old["content"] == content:
        return False
    conn.execute(
        """INSERT INTO item_embeddings (kind, item_id, content, embedding) VALUES (%s, %s, %s, %s::vector)
           ON CONFLICT (kind, item_id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding, updated_at = now()""",
        (kind, row["id"], content, vec(embed(content))),
    )
    return True


def delete(conn, kind: str, item_id: int) -> None:
    conn.execute("DELETE FROM item_embeddings WHERE kind = %s AND item_id = %s", (kind, item_id))


def backfill(conn) -> int:
    """Catch up on rows created before this service existed (or while it was down). Cheap when nothing changed."""
    n = 0
    for kind, table in (("activity", "activities"), ("package", "travel_packages")):
        for row in conn.execute(f"SELECT * FROM {table}").fetchall():
            n += upsert(conn, kind, row)
    return n


def search(conn, query: str, limit: int, max_dist: float) -> list[dict]:
    """Nearest upcoming activities and active packages to the query, closest first."""
    qv = vec(embed(QUERY_PREFIX + query))
    return conn.execute(
        """SELECT e.kind, e.item_id, e.embedding <=> %s::vector AS dist,
                  COALESCE(a.title, p.title) AS title,
                  COALESCE(a.location_name, p.destination) AS place,
                  a.start_time, p.price, p.duration_days
           FROM item_embeddings e
           LEFT JOIN activities a ON e.kind = 'activity' AND a.id = e.item_id
           LEFT JOIN travel_packages p ON e.kind = 'package' AND p.id = e.item_id
           WHERE ((a.id IS NOT NULL AND a.is_active = 1 AND a.start_time > now()) OR (p.id IS NOT NULL AND p.is_active = 1))
             AND e.embedding <=> %s::vector <= %s
           ORDER BY dist LIMIT %s""",
        (qv, qv, max_dist, limit),
    ).fetchall()
