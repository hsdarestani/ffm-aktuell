BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, display_name text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 language text NOT NULL DEFAULT 'de' CHECK(language IN ('de','en')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS businesses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, registry_reference text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses(owner_id);
CREATE TABLE IF NOT EXISTS places (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
 name text NOT NULL, category text NOT NULL DEFAULT 'Entdecken', district text NOT NULL DEFAULT '',
 description_de text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '',
 address text NOT NULL DEFAULT '', latitude double precision CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision CHECK(longitude BETWEEN -180 AND 180), website text, image_url text,
 source_url text, updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected'))
);
-- Bestandskompatible Prüffelder; keine Veröffentlichung als "geprüft" ohne Quelle.
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';
ALTER TABLE places ADD COLUMN IF NOT EXISTS activity_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE places ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_source text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS editorial_rank smallint NOT NULL DEFAULT 0;
ALTER TABLE places ADD COLUMN IF NOT EXISTS opening_hours_text text;
-- Redaktionelle Beweiskette: OSM-ID dient nur der Identität, nie als Betriebsnachweis.
ALTER TABLE places ADD COLUMN IF NOT EXISTS osm_id text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_method text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_note text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS places_osm_id_unique ON places(osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS places_recheck_idx ON places(status, verified_at) WHERE status='published';
CREATE INDEX IF NOT EXISTS places_status_category_idx ON places(status,category);
CREATE INDEX IF NOT EXISTS places_name_idx ON places USING gin(to_tsvector('simple',name||' '||description_de||' '||district));
-- Separate crowd-sourced discovery index. Raw OSM candidates are never
-- published/verified places, cannot receive favorites and never imply openNow.
CREATE TABLE IF NOT EXISTS discovery_candidates (
 osm_id text PRIMARY KEY,
 name text NOT NULL,
 category text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN 49.7 AND 50.4),
 longitude double precision NOT NULL CHECK(longitude BETWEEN 8.2 AND 9.1),
 address text NOT NULL DEFAULT '',
 website text, phone text,
 opening_hours text, last_osm_check text,
 osm_url text NOT NULL,
 source text NOT NULL DEFAULT 'OpenStreetMap · ODbL',
 activity_status text NOT NULL DEFAULT 'unknown'
  CHECK(activity_status IN ('unknown','temporarily_closed','permanently_closed')),
 reviewed_status text NOT NULL DEFAULT 'unverified'
  CHECK(reviewed_status IN ('unverified','hidden','needs_review')),
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discovery_category_name_idx ON discovery_candidates(category,name);
CREATE INDEX IF NOT EXISTS discovery_geo_idx ON discovery_candidates(latitude,longitude);
CREATE INDEX IF NOT EXISTS discovery_search_idx ON discovery_candidates USING gin
 (to_tsvector('simple',name||' '||coalesce(address,'')));
-- Survey tile cache stored separately from place records, surviving rebuilds.
CREATE TABLE IF NOT EXISTS lod2_tiles (
 tile_id text PRIMARY KEY,
 data jsonb NOT NULL,
 fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lod2_tiles_fetched_idx ON lod2_tiles(fetched_at);
CREATE TABLE IF NOT EXISTS events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
 description_de text NOT NULL DEFAULT '', description_en text NOT NULL DEFAULT '',
 venue text NOT NULL DEFAULT '', starts_at timestamptz NOT NULL,
 ticket_url text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_date_idx ON events(status,starts_at);
CREATE TABLE IF NOT EXISTS news (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
 body_de text NOT NULL DEFAULT '', body_en text NOT NULL DEFAULT '',
 source_url text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 place_id uuid REFERENCES places(id) ON DELETE SET NULL, body text NOT NULL, media_url text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_status_time_idx ON posts(status,created_at DESC);
CREATE TABLE IF NOT EXISTS favorites (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,place_id)
);
CREATE TABLE IF NOT EXISTS claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,place_id)
);
CREATE TABLE IF NOT EXISTS deals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 place_id uuid REFERENCES places(id) ON DELETE SET NULL, title text NOT NULL, details text NOT NULL DEFAULT '',
 valid_until timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_status_idx ON deals(status);
CREATE TABLE IF NOT EXISTS audit_log (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
