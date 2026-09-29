-- Embeddings for semantic search (itinerary retrieval). Written only by the AI service, so this table is
-- deliberately NOT tracked in Hasura. Idempotent: on an existing database run it once by hand
-- (docker compose exec -T postgres psql -U wandermate -d wandermate < db/06-embeddings.sql); the AI service
-- backfills existing activities and packages on its next start.
CREATE TABLE IF NOT EXISTS item_embeddings (
  kind TEXT NOT NULL CHECK (kind IN ('activity', 'package')),
  item_id INT NOT NULL,
  content TEXT NOT NULL,            -- the text that was embedded; unchanged text is not re-embedded
  embedding vector(384) NOT NULL,   -- BAAI/bge-small-en-v1.5
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_item_embeddings_vec ON item_embeddings USING hnsw (embedding vector_cosine_ops);
