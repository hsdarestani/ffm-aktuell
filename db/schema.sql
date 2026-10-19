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
-- One-time admin activation. Only the SHA256 token hash is stored.
CREATE TABLE IF NOT EXISTS admin_invites (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_invites(token_hash,expires_at)
VALUES('849c629b5c494299a28d26beabef49e3261c71707887fbcccff8152d00156a5e','2026-10-19T23:00:00Z')
ON CONFLICT(token_hash) DO NOTHING;
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
ALTER TABLE posts ADD COLUMN IF NOT EXISTS candidate_osm_id text REFERENCES discovery_candidates(osm_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_candidate_idx ON posts(candidate_osm_id) WHERE candidate_osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posts_status_time_idx ON posts(status,created_at DESC);
-- Likes and moderated replies belong only to actual published user posts.
-- Demo posts are frontend-only and can never be liked or replied to.
CREATE TABLE IF NOT EXISTS post_likes (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,post_id)
);
CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes(post_id);
CREATE TABLE IF NOT EXISTS post_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK(char_length(body) BETWEEN 3 AND 800),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS post_comments_review_idx ON post_comments(status,created_at);
-- Phase 2c: private follow relationships. No public personal profile pages.
-- A follow never gives access to unpublished posts or private activities.
CREATE TABLE IF NOT EXISTS user_follows (
 follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 followed_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(follower_id,followed_id),
 CHECK(follower_id<>followed_id)
);
CREATE INDEX IF NOT EXISTS user_follows_followed_idx ON user_follows(followed_id);
CREATE TABLE IF NOT EXISTS business_follows (
 follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(follower_id,business_id)
);
CREATE INDEX IF NOT EXISTS business_follows_business_idx ON business_follows(business_id);
-- Phase 3a: private tours and revocable share-only links.
CREATE TABLE IF NOT EXISTS user_tours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 2 AND 100),
 share_token text UNIQUE,
 shared_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_tours_owner_idx ON user_tours(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS tour_stops (
 tour_id uuid NOT NULL REFERENCES user_tours(id) ON DELETE CASCADE,
 position smallint NOT NULL CHECK(position BETWEEN 1 AND 8),
 place_id uuid REFERENCES places(id) ON DELETE CASCADE,
 osm_id text REFERENCES discovery_candidates(osm_id) ON DELETE CASCADE,
 planned_time text CHECK(planned_time IS NULL OR planned_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 PRIMARY KEY(tour_id,position),
 CHECK ((place_id IS NOT NULL)::int+(osm_id IS NOT NULL)::int=1)
);
CREATE UNIQUE INDEX IF NOT EXISTS tour_stop_unique_place ON tour_stops(tour_id,place_id) WHERE place_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tour_stop_unique_osm ON tour_stops(tour_id,osm_id) WHERE osm_id IS NOT NULL;
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
-- User bookmarks for raw OSM candidates are private and never verification.
-- Separate table keeps the existing favorites foreign key and its legacy PK intact.
CREATE TABLE IF NOT EXISTS candidate_favorites (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 osm_id text NOT NULL REFERENCES discovery_candidates(osm_id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,osm_id)
);
CREATE INDEX IF NOT EXISTS candidate_favorites_osm_idx ON candidate_favorites(osm_id);
-- Feedback appears in the existing editorial review queue; submitting a report
-- must never automatically hide a venue or assert it is permanently closed.
CREATE TABLE IF NOT EXISTS place_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 place_id uuid REFERENCES places(id) ON DELETE CASCADE,
 osm_id text REFERENCES discovery_candidates(osm_id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('closed','address','details','other')),
 message text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 CHECK ((place_id IS NOT NULL)::int + (osm_id IS NOT NULL)::int = 1)
);
CREATE INDEX IF NOT EXISTS place_reports_queue_idx ON place_reports(status,created_at);
CREATE INDEX IF NOT EXISTS place_reports_user_idx ON place_reports(user_id,created_at);
-- Reviews belong to a verified/published catalogue record or a raw OSM
-- candidate. Publishing a user's opinion is NEVER verification of operation.
CREATE TABLE IF NOT EXISTS venue_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 place_id uuid REFERENCES places(id) ON DELETE CASCADE,
 osm_id text REFERENCES discovery_candidates(osm_id) ON DELETE CASCADE,
 rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
 body text NOT NULL CHECK (char_length(body) BETWEEN 20 AND 1000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 CHECK ((place_id IS NOT NULL)::int + (osm_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_reviews_user_place_unique ON venue_reviews(user_id,place_id) WHERE place_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS venue_reviews_user_osm_unique ON venue_reviews(user_id,osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS venue_reviews_published_place ON venue_reviews(place_id,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS venue_reviews_published_osm ON venue_reviews(osm_id,created_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS venue_reviews_moderation ON venue_reviews(status,created_at);
-- Abuse reports enter a human queue and cannot automatically unpublish content.
CREATE TABLE IF NOT EXISTS venue_review_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL REFERENCES venue_reviews(id) ON DELETE CASCADE,
 reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason text NOT NULL CHECK(reason IN ('spam','abuse','privacy','incorrect','other')),
 message text NOT NULL DEFAULT '' CHECK(char_length(message)<=500),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(review_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS venue_review_reports_pending ON venue_review_reports(status,created_at);
CREATE TABLE IF NOT EXISTS audit_log (
 id bigserial PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
