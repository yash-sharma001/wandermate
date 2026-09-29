-- Geo index for activities. Runs on fresh installs (after 02-logic.sql) and is idempotent, so on an
-- existing database run it once by hand:  docker compose exec -T postgres psql -U wandermate -d wandermate < db/05-geo-index.sql
--
-- `geog` is a generated column: Postgres backfills existing rows now and keeps it in sync with
-- latitude/longitude forever, so no code path (Hasura inserts, seed, SQL) can forget to set it.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS geog geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED;

CREATE INDEX IF NOT EXISTS idx_activities_geog ON activities USING gist (geog);

-- Replaces the version in 02-logic.sql: ST_DWithin on the indexed column instead of haversine() per row
CREATE OR REPLACE FUNCTION nearby_activities(p_lat float8, p_lng float8, p_radius int DEFAULT 10000, p_gender text DEFAULT NULL)
RETURNS SETOF activity_details LANGUAGE sql STABLE AS $$
  SELECT d.* FROM activities a
  JOIN activity_details d ON d.id = a.id
  WHERE a.start_time > now() AND a.start_time < now() + interval '24 hours'
    AND ST_DWithin(a.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius)
    AND (p_gender IS NULL OR p_gender = 'all' OR d.gender_filter IN (p_gender, 'all'))
  ORDER BY d.start_time LIMIT 100
$$;
