-- One-off upgrade for a database created BEFORE the pgvector/PostGIS image (fresh volumes don't need this).
-- 1. docker compose up -d --build postgres
-- 2. docker compose exec -T postgres psql -U wandermate -d wandermate < scripts/upgrade-existing-db.sql
-- Safe to run more than once. Back up first: docker compose exec -T postgres pg_dump -U wandermate wandermate > backup.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- Same signature as before, so every view/function that calls it keeps working
-- Great-circle distance in metres, computed by PostGIS (spherical earth, same model as the old hand-written formula)
CREATE OR REPLACE FUNCTION haversine(lat1 float8, lng1 float8, lat2 float8, lng2 float8) RETURNS float8
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_DistanceSphere(ST_MakePoint(lng1, lat1), ST_MakePoint(lng2, lat2))
$$;

-- The old image was Alpine (musl), the new one is Debian (glibc): text sort order can differ,
-- so rebuild every index (unique email/username included).
REINDEX DATABASE wandermate;
