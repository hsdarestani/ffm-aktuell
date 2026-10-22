BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, display_name text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 language text NOT NULL DEFAULT 'de' CHECK(language IN ('de','en')),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Email/password registrations remain unverified until an out-of-band proof.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS email_verification_tokens (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verification_user_idx ON email_verification_tokens(user_id,created_at DESC);
-- Only the owner can read or update onboarding/personalization preferences.
CREATE TABLE IF NOT EXISTS user_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 interests text[] NOT NULL DEFAULT '{}',
 districts text[] NOT NULL DEFAULT '{}',
 share_activity boolean NOT NULL DEFAULT false,
 notify_events boolean NOT NULL DEFAULT false,
 notify_news boolean NOT NULL DEFAULT false,
 notify_offers boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Identity mappings use immutable provider subjects, never email-only linking.
CREATE TABLE IF NOT EXISTS social_identities (
 provider text NOT NULL CHECK(provider IN ('google','apple')),
 provider_subject text NOT NULL,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email_at_link text NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,provider_subject),
 UNIQUE(provider,user_id)
);
CREATE INDEX IF NOT EXISTS social_identities_user ON social_identities(user_id);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS authenticated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expires_at);
-- One-time admin activation. Only the SHA256 token hash is stored.
CREATE TABLE IF NOT EXISTS admin_invites (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Generate one-time administrative invitations out of band only; never seed fixed tokens.
CREATE TABLE IF NOT EXISTS businesses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL, registry_reference text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses(owner_id);
-- Business team access is gated by explicit administrative seat allocation.
-- The default is ZERO; unapproved subscription/staff tiers cannot grant seats.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS team_seat_limit integer NOT NULL DEFAULT 0 CHECK(team_seat_limit BETWEEN 0 AND 50);
CREATE TABLE IF NOT EXISTS business_team_members (
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('viewer','editor')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,user_id)
);
CREATE INDEX IF NOT EXISTS business_team_members_user_idx ON business_team_members(user_id);
CREATE TABLE IF NOT EXISTS business_team_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 invite_email text NOT NULL,
 role text NOT NULL CHECK(role IN ('viewer','editor')),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 redeemed_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS business_team_invites_by_business ON business_team_invites(business_id,created_at DESC);

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
ALTER TABLE places ADD COLUMN IF NOT EXISTS phone text;
-- Redaktionelle Beweiskette: OSM-ID dient nur der Identität, nie als Betriebsnachweis.
ALTER TABLE places ADD COLUMN IF NOT EXISTS osm_id text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_method text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verification_note text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS places_osm_id_unique ON places(osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS places_recheck_idx ON places(status, verified_at) WHERE status='published';
CREATE INDEX IF NOT EXISTS places_status_category_idx ON places(status,category);
CREATE INDEX IF NOT EXISTS places_name_idx ON places USING gin(to_tsvector('simple',name||' '||description_de||' '||district));
-- Source-backed facts are *not* a statement that a venue is operating now.
-- Record provenance per field without silently granting the 'verified' badge.
CREATE TABLE IF NOT EXISTS place_field_evidence (
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 field text NOT NULL CHECK(field IN ('identity','opening_hours','address')),
 source_url text NOT NULL CHECK(source_url ~ '^https://'),
 source_type text NOT NULL DEFAULT 'official' CHECK(source_type IN ('official','tourism_office')),
 checked_at timestamptz NOT NULL,
 statement text NOT NULL CHECK(char_length(statement) BETWEEN 4 AND 500),
 PRIMARY KEY(place_id,field)
);
CREATE INDEX IF NOT EXISTS place_field_evidence_checked_idx ON place_field_evidence(checked_at);
-- Separate crowd-sourced discovery index. Raw OSM candidates are never
-- published/verified places, cannot receive favorites and never imply openNow.
-- Dynamic editorial taxonomy: no auto-promotion of OSM tags to certified facts.
CREATE TABLE IF NOT EXISTS catalog_categories (
 slug text PRIMARY KEY CHECK(char_length(slug) BETWEEN 2 AND 70),
 label_de text NOT NULL CHECK(char_length(label_de) BETWEEN 2 AND 100),
 label_en text NOT NULL CHECK(char_length(label_en) BETWEEN 2 AND 100),
 parent_slug text REFERENCES catalog_categories(slug) ON DELETE SET NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(parent_slug IS DISTINCT FROM slug)
);
-- Seed accepted existing taxonomy; do not delete or overwrite editorial edits.
INSERT INTO catalog_categories(slug,label_de,label_en) VALUES
 ('Apotheken','Apotheken','Pharmacies'),
 ('Cafés','Cafés','Cafés'),
 ('Bars','Bars','Bars'),
 ('Clubs','Nachtclubs','Nightclubs'),
 ('Shisha Bars','Shishabars','Shisha bars'),
 ('Restaurants','Restaurants','Restaurants'),
 ('Imbiss','Imbiss','Fast food'),
 ('Brunch','Frühstück & Brunch','Breakfast & Brunch'),
 ('Museen','Museen','Museums'),
 ('Kultur','Kultur','Culture'),
 ('Sehenswürdigkeiten','Sehenswertes','Landmarks'),
 ('Natur','Parks & Natur','Parks & Nature'),
 ('Fußball','Fußball','Football'),
 ('Padel','Padel','Padel'),
 ('Sport','Weitere Sportarten','Sports'),
 ('Laufgruppen','Laufgruppen','Running clubs'),
 ('Spaziergruppen','Spaziergruppen','Walking clubs'),
 ('Lesegruppen','Lesegruppen','Reading clubs'),
 ('Freizeit','Freizeit','Activities'),
 ('Wellness','Entspannung','Wellness'),
 ('Shopping','Einkaufen','Shopping'),
 ('Familie','Familie','Family'),
 ('Kostenlos','Kostenlos','Free activities'),
 ('Fitness','Fitness','Fitness'),
 ('Beauty','Beauty','Beauty'),
 ('Hotels','Hotels','Hotels'),
 ('Neueröffnungen','Neueröffnungen','New openings'),
 ('Geheimtipps','Geheimtipps','Hidden gems')
ON CONFLICT(slug) DO NOTHING;
CREATE TABLE IF NOT EXISTS place_categories (
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 category_slug text NOT NULL REFERENCES catalog_categories(slug) ON DELETE RESTRICT,
 PRIMARY KEY(place_id,category_slug)
);
CREATE INDEX IF NOT EXISTS place_categories_slug_idx ON place_categories(category_slug,place_id);
-- Back-fill canonical existing primary categories without altering editorial statuses.
INSERT INTO place_categories(place_id,category_slug)
 SELECT p.id,p.category FROM places p JOIN catalog_categories c ON c.slug=p.category
 ON CONFLICT DO NOTHING;

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
-- Event/source details and scheduled news; unknown prices stay NULL.
ALTER TABLE events ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Weitere';
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_cents integer CHECK(price_cents>=0);
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_source_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;
CREATE INDEX IF NOT EXISTS events_date_idx ON events(status,starts_at);
-- User event bookmarks and calendar reminder preferences are private.
-- Calendar reminders are delivered only via explicit .ics export, no silent push.
CREATE TABLE IF NOT EXISTS event_favorites (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,event_id)
);
CREATE INDEX IF NOT EXISTS event_favorites_event_idx ON event_favorites(event_id);

CREATE TABLE IF NOT EXISTS news (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
 body_de text NOT NULL DEFAULT '', body_en text NOT NULL DEFAULT '',
 source_url text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 published_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE news ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Stadtleben';
CREATE INDEX IF NOT EXISTS news_release_date_idx ON news(status,published_at);
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
-- Pending branch changes must be reviewed by the editorial team before
-- publication. A claimed OSM candidate never becomes a verified business.
CREATE TABLE IF NOT EXISTS place_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 submitted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 150),
 address text NOT NULL CHECK(char_length(address)<=200),
 website text CHECK(website IS NULL OR char_length(website)<=1000),
 phone text CHECK(phone IS NULL OR char_length(phone)<=40),
 opening_hours_text text CHECK(opening_hours_text IS NULL OR char_length(opening_hours_text)<=300),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 editor_note text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS place_change_one_pending ON place_change_requests(place_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS place_change_status_time ON place_change_requests(status,submitted_at);
CREATE TABLE IF NOT EXISTS deals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 place_id uuid REFERENCES places(id) ON DELETE SET NULL, title text NOT NULL, details text NOT NULL DEFAULT '',
 valid_until timestamptz, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_status_idx ON deals(status);
-- Pilot coupons are free of charge and never count as payment, ticket or proof
-- of visiting a venue. Codes are 144-bit random and redeemable only once.
-- Commercial entitlements are catalogue definitions only. No subscription is
-- activated or billed without an approved payment provider and store policy.
CREATE TABLE IF NOT EXISTS subscription_plans (
 code text PRIMARY KEY CHECK(code IN ('user_premium','business_premium_1','business_premium_2')),
 audience text NOT NULL CHECK(audience IN ('user','business')),
 title_de text NOT NULL CHECK(char_length(title_de) BETWEEN 2 AND 100),
 title_en text NOT NULL CHECK(char_length(title_en) BETWEEN 2 AND 100),
 features text[] NOT NULL DEFAULT '{}',
 monthly_price_cents integer CHECK(monthly_price_cents>0),
 annual_price_cents integer CHECK(annual_price_cents>0),
 trial_days integer NOT NULL DEFAULT 0 CHECK(trial_days BETWEEN 0 AND 30),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved_for_display')),
 legal_terms_url text,
 approval_note text,
 approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='draft') OR (monthly_price_cents IS NOT NULL AND legal_terms_url IS NOT NULL AND approval_note IS NOT NULL AND approved_at IS NOT NULL))
);
INSERT INTO subscription_plans(code,audience,title_de,title_en,trial_days) VALUES
 ('user_premium','user','Premium für Privatpersonen','Personal Premium',7),
 ('business_premium_1','business','Business Premium 1','Business Premium 1',0),
 ('business_premium_2','business','Business Premium 2','Business Premium 2',0)
ON CONFLICT(code) DO NOTHING;

-- Advertising proposal lifecycle. Until official pricing and an authorized
-- payment flow are configured, campaigns NEVER enter a public/live state.
CREATE TABLE IF NOT EXISTS ad_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 4 AND 150),
 copy_de text NOT NULL CHECK(char_length(copy_de) BETWEEN 10 AND 1500),
 placement text NOT NULL CHECK(placement IN ('search','home','feed','stories','events','district','category')),
 start_date date NOT NULL,
 end_date date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','rejected','awaiting_commercial_setup','cancelled')),
 quoted_price_cents integer CHECK(quoted_price_cents>0),
 payment_status text NOT NULL DEFAULT 'not_configured' CHECK(payment_status IN ('not_configured','unpaid','paid','refunded')),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 rejection_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>=start_date AND end_date-start_date<=90)
);
CREATE INDEX IF NOT EXISTS ad_campaigns_owner_status ON ad_campaigns(business_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS ad_campaigns_review_idx ON ad_campaigns(status,created_at) WHERE status='pending_review';
CREATE TABLE IF NOT EXISTS coupon_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deal_id uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code text UNIQUE NOT NULL CHECK(char_length(code) BETWEEN 22 AND 40),
 created_at timestamptz NOT NULL DEFAULT now(),
 redeemed_at timestamptz,
 redeemed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 UNIQUE(deal_id,user_id)
);
CREATE INDEX IF NOT EXISTS coupon_claims_redemption_idx ON coupon_claims(deal_id,redeemed_at);

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
-- Uploaded media: quarantined on disk until anti-malware scanning and editorial review.
CREATE TABLE IF NOT EXISTS user_media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 media_type text NOT NULL CHECK(media_type IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 size_bytes integer NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 25165824),
 storage_key text NOT NULL UNIQUE,
 sha256 text NOT NULL,
 license_confirmed boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_media_review_idx ON user_media(status,created_at);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES user_media(id) ON DELETE SET NULL;
-- Stories disappear automatically after 24h even if housekeeping has not run.
CREATE TABLE IF NOT EXISTS stories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 media_id uuid NOT NULL REFERENCES user_media(id) ON DELETE CASCADE,
 caption text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 CHECK(expires_at <= created_at+interval '24 hours')
);
CREATE INDEX IF NOT EXISTS stories_visible_idx ON stories(status,expires_at);
-- Explicit, revocable, time-bounded grants; a business can never reuse media without consent.
CREATE TABLE IF NOT EXISTS media_right_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 media_id uuid NOT NULL REFERENCES user_media(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,business_id,media_id),
 CHECK(expires_at>created_at)
);
CREATE TABLE IF NOT EXISTS business_highlights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES media_right_grants(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 UNIQUE(business_id,grant_id)
);
CREATE INDEX IF NOT EXISTS highlights_visible_idx ON business_highlights(status,created_at);
-- Web push requires separate browser consent and category preferences.
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('event','news')),
 source_id uuid NOT NULL, source_version text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 claimed_at timestamptz, sent_at timestamptz,
 UNIQUE(subscription_id,kind,source_id,source_version)
);
CREATE INDEX IF NOT EXISTS push_deliveries_pending_idx ON push_deliveries(available_at) WHERE state='pending';
-- Source-backed search facts; unknown is represented by absence, never false.
CREATE TABLE IF NOT EXISTS place_attributes (
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 field text NOT NULL CHECK(field IN ('price_level','indoor','outdoor','family_friendly','wheelchair_accessible')),
 value text NOT NULL,
 source_url text NOT NULL CHECK(source_url ~ '^https://'),
 checked_at timestamptz NOT NULL, note text NOT NULL CHECK(char_length(note) BETWEEN 10 AND 500),
 checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(place_id,field),
 CHECK((field='price_level' AND value IN ('1','2','3','4')) OR
       (field<>'price_level' AND value IN ('yes','no')))
);
CREATE INDEX IF NOT EXISTS place_attributes_filter_idx ON place_attributes(field,value,checked_at);
CREATE TABLE IF NOT EXISTS place_attribute_history (
 id bigserial PRIMARY KEY, place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, field text NOT NULL,
 before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
-- Delegation never changes users.role: existing administrators remain the root authority.
CREATE TABLE IF NOT EXISTS admin_roles (
 code text PRIMARY KEY, label text NOT NULL, permissions text[] NOT NULL,
 CHECK(permissions <@ ARRAY['editorial','moderation','business','marketing','finance','operations']::text[])
);
INSERT INTO admin_roles(code,label,permissions) VALUES
 ('editorial','Redaktion',ARRAY['editorial']),('moderation','Moderation',ARRAY['moderation']),
 ('marketing','Marketing',ARRAY['marketing']),('support','Support',ARRAY['business']),
 ('finance','Finanzen',ARRAY['finance']),('operations','Betrieb',ARRAY['operations'])
ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS admin_role_assignments (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role_code text NOT NULL REFERENCES admin_roles(code),
 granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,role_code)
);
ALTER TABLE business_team_members ADD COLUMN IF NOT EXISTS all_places boolean NOT NULL DEFAULT true;
ALTER TABLE business_team_members ADD COLUMN IF NOT EXISTS place_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE business_team_invites ADD COLUMN IF NOT EXISTS all_places boolean NOT NULL DEFAULT true;
ALTER TABLE business_team_invites ADD COLUMN IF NOT EXISTS place_ids uuid[] NOT NULL DEFAULT '{}';
-- Editable initial commercial assumptions; never fabricate legal approval or payment.
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS staff_seats integer NOT NULL DEFAULT 0 CHECK(staff_seats BETWEEN 0 AND 50);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS branch_limit integer NOT NULL DEFAULT 1 CHECK(branch_limit BETWEEN 1 AND 100);
CREATE TABLE IF NOT EXISTS product_defaults_versions(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM product_defaults_versions WHERE version='web-tariffs-20261021') THEN
  UPDATE subscription_plans SET monthly_price_cents=490,annual_price_cents=4900,
   features=ARRAY['exclusive_deals','personalized_discovery','saved_tours'],trial_days=7 WHERE code='user_premium' AND status='draft' AND monthly_price_cents IS NULL;
  UPDATE subscription_plans SET monthly_price_cents=1990,annual_price_cents=19900,staff_seats=3,branch_limit=3,
   features=ARRAY['extended_profile','stories','analytics','additional_staff'] WHERE code='business_premium_1' AND status='draft' AND monthly_price_cents IS NULL;
  UPDATE subscription_plans SET monthly_price_cents=3990,annual_price_cents=39900,staff_seats=10,branch_limit=20,
   features=ARRAY['extended_profile','stories','analytics','additional_staff','campaign_tools','priority_support'] WHERE code='business_premium_2' AND status='draft' AND monthly_price_cents IS NULL;
  INSERT INTO product_defaults_versions(version) VALUES('web-tariffs-20261021');
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS billing_customers (
 user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
 stripe_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_prices (
 id text PRIMARY KEY,product_id text NOT NULL,snapshot_hash text NOT NULL UNIQUE,
 snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,scope_key text NOT NULL,
 price_id text NOT NULL REFERENCES billing_prices(id),snapshot jsonb NOT NULL,
 provider_session_id text UNIQUE,provider_url text,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','expired')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '35 minutes',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_one_pending_checkout ON billing_checkouts(scope_key) WHERE state='pending';
CREATE TABLE IF NOT EXISTS billing_subscriptions (
 id text PRIMARY KEY,user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,customer_id text NOT NULL,
 scope_key text NOT NULL,price_id text NOT NULL REFERENCES billing_prices(id),snapshot jsonb NOT NULL,
 status text NOT NULL,current_period_end timestamptz,cancel_at_period_end boolean NOT NULL DEFAULT false,
 latest_invoice_id text,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_subscription_scope_idx ON billing_subscriptions(scope_key,status);
CREATE TABLE IF NOT EXISTS billing_webhook_events (id text PRIMARY KEY,type text NOT NULL,processed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS billing_invoices (
 id text PRIMARY KEY,customer_id text NOT NULL,subscription_id text,user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 status text NOT NULL,amount_due integer NOT NULL,amount_paid integer NOT NULL,currency text NOT NULL,
 hosted_invoice_url text,invoice_pdf text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_credit_notes (
 id text PRIMARY KEY,invoice_id text NOT NULL,customer_id text NOT NULL,amount integer NOT NULL,
 currency text NOT NULL,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION business_seat_capacity(bid uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT greatest(b.team_seat_limit,coalesce((SELECT max((s.snapshot->>'staff_seats')::int) FROM billing_subscriptions s
 WHERE s.business_id=b.id AND s.status IN ('active','trialing') AND s.current_period_end>now()
 AND s.snapshot->'features' ? 'additional_staff'),0)) FROM businesses b WHERE b.id=bid
$$;
CREATE OR REPLACE FUNCTION business_staff_allowed(bid uuid,uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM business_team_members m WHERE m.business_id=bid AND m.user_id=uid
 AND (SELECT count(*) FROM business_team_members x WHERE x.business_id=bid AND (x.joined_at,x.user_id)<=(m.joined_at,m.user_id))<=business_seat_capacity(bid))
$$;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS payment_intent_id text;
CREATE INDEX IF NOT EXISTS billing_invoice_payment_idx ON billing_invoices(payment_intent_id);
CREATE TABLE IF NOT EXISTS billing_refunds (
 charge_id text PRIMARY KEY,customer_id text NOT NULL,payment_intent_id text,
 amount integer NOT NULL,amount_refunded integer NOT NULL,currency text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION business_branch_capacity(bid uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT greatest(1,coalesce((SELECT max((s.snapshot->>'branch_limit')::int) FROM billing_subscriptions s
 WHERE s.business_id=bid AND s.status IN ('active','trialing') AND s.current_period_end>now()),1))
$$;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS notify_following boolean NOT NULL DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS notify_tips boolean NOT NULL DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE OR REPLACE FUNCTION record_content_publication() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN NEW.published_at=now(); END IF;
  RETURN NEW;
 END $$;
DROP TRIGGER IF EXISTS deals_publication_time ON deals;
CREATE TRIGGER deals_publication_time BEFORE INSERT OR UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION record_content_publication();
DROP TRIGGER IF EXISTS posts_publication_time ON posts;
CREATE TRIGGER posts_publication_time BEFORE INSERT OR UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION record_content_publication();
CREATE TABLE IF NOT EXISTS discovery_tips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 4 AND 150),
 body text NOT NULL CHECK(char_length(body) BETWEEN 10 AND 500),
 publish_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 published boolean NOT NULL DEFAULT true,created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(expires_at>publish_at)
);
ALTER TABLE push_deliveries DROP CONSTRAINT IF EXISTS push_deliveries_kind_check;
ALTER TABLE push_deliveries ADD CONSTRAINT push_deliveries_kind_check CHECK(kind IN ('event','news','offer','following','tip'));
-- Visit evidence is an explicit business confirmation, never inferred from GPS or a click.
CREATE TABLE IF NOT EXISTS loyalty_programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
 goal integer NOT NULL DEFAULT 5 CHECK(goal BETWEEN 2 AND 50),
 minimum_hours integer NOT NULL DEFAULT 24 CHECK(minimum_hours BETWEEN 1 AND 168),
 reward text NOT NULL CHECK(char_length(reward) BETWEEN 10 AND 500),terms_url text NOT NULL CHECK(terms_url ~ '^https://'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('draft','pending','published','rejected')),
 first_active_at timestamptz,updated_at timestamptz NOT NULL DEFAULT now(),review_note text
);
CREATE TABLE IF NOT EXISTS confirmed_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS confirmed_visits_customer_idx ON confirmed_visits(user_id,business_id,confirmed_at DESC);
CREATE TABLE IF NOT EXISTS loyalty_cards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),program_id uuid NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 goal integer NOT NULL CHECK(goal BETWEEN 2 AND 50),minimum_hours integer NOT NULL DEFAULT 24 CHECK(minimum_hours BETWEEN 1 AND 168),reward text NOT NULL,terms_url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),redeemed_at timestamptz,redeemed_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_current_card ON loyalty_cards(user_id,program_id) WHERE redeemed_at IS NULL;
CREATE TABLE IF NOT EXISTS loyalty_card_visits (
 card_id uuid NOT NULL REFERENCES loyalty_cards(id) ON DELETE CASCADE,
 visit_id uuid NOT NULL UNIQUE REFERENCES confirmed_visits(id) ON DELETE CASCADE,PRIMARY KEY(card_id,visit_id)
);
CREATE TABLE IF NOT EXISTS visit_confirmation_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text NOT NULL UNIQUE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('visit','reward')),card_id uuid REFERENCES loyalty_cards(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',used_at timestamptz
);
CREATE INDEX IF NOT EXISTS visit_confirmation_rate_idx ON visit_confirmation_requests(user_id,created_at DESC);
COMMIT;


-- Phone login is explicitly linked from an existing recently authenticated account.
CREATE TABLE IF NOT EXISTS phone_identities (
 phone text PRIMARY KEY CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),
 user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS phone_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token_hash text UNIQUE NOT NULL,
 phone text NOT NULL,user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 purpose text NOT NULL CHECK(purpose IN ('login','link')),ip_hash text NOT NULL,
 provider_sid text,attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',used_at timestamptz
);
CREATE INDEX IF NOT EXISTS phone_challenges_rate ON phone_challenges(created_at,phone);
ALTER TABLE place_attributes DROP CONSTRAINT IF EXISTS place_attributes_field_check;
ALTER TABLE place_attributes ADD CONSTRAINT place_attributes_field_check CHECK(field IN ('price_level','indoor','outdoor','family_friendly','wheelchair_accessible','date_friendly','group_friendly','quiet'));
CREATE TABLE IF NOT EXISTS text_service_usage (
 id bigserial PRIMARY KEY,user_id uuid REFERENCES users(id) ON DELETE SET NULL,kind text NOT NULL CHECK(kind IN ('translation','ranking')),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS text_service_usage_time ON text_service_usage(created_at);
CREATE TABLE IF NOT EXISTS post_translations (
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,language text NOT NULL CHECK(language IN ('de','en')),source_hash text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,language)
);

-- Flat daily advertisement rates. Draft defaults are editable and never self-approved.
CREATE TABLE IF NOT EXISTS ad_rates (
 placement text PRIMARY KEY CHECK(placement IN ('search','home','feed','stories','events','district','category')),
 daily_cents integer NOT NULL CHECK(daily_cents BETWEEN 1 AND 1000000),terms_url text,
 approved boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ad_rates(placement,daily_cents) VALUES('search',1500),('home',2500),('feed',1500),('stories',1000),('events',1500),('district',1000),('category',1000) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS ad_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,customer_id text NOT NULL REFERENCES billing_customers(stripe_id),
 snapshot jsonb NOT NULL,amount integer NOT NULL CHECK(amount>0),currency text NOT NULL DEFAULT 'eur',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','paid','expired','refunded','failed')),
 provider_session_id text UNIQUE,provider_url text,payment_intent_id text,invoice_url text,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '35 minutes',paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_orders_pending ON ad_orders(campaign_id) WHERE state IN ('pending','processing');
CREATE UNIQUE INDEX IF NOT EXISTS ad_orders_paid ON ad_orders(campaign_id) WHERE state='paid';
CREATE TABLE IF NOT EXISTS ad_webhook_events(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS ad_charge_refunds(charge_id text PRIMARY KEY,payment_intent_id text NOT NULL,amount_refunded integer NOT NULL);
CREATE TABLE IF NOT EXISTS ad_exposures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES ad_orders(id) ON DELETE CASCADE,
 token_hash text UNIQUE NOT NULL,ip_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '20 minutes',impression_at timestamptz,click_at timestamptz
);
CREATE INDEX IF NOT EXISTS ad_exposures_rate ON ad_exposures(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS ad_daily_stats (
 campaign_id uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,day date NOT NULL,
 impressions integer NOT NULL DEFAULT 0,clicks integer NOT NULL DEFAULT 0,PRIMARY KEY(campaign_id,day)
);

CREATE TABLE IF NOT EXISTS place_opening_days (
 place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,day date NOT NULL,
 state text NOT NULL CHECK(state IN ('open','closed')),periods jsonb NOT NULL CHECK(jsonb_typeof(periods)='array' AND jsonb_array_length(periods)<=6),
 source_url text NOT NULL CHECK(source_url ~ '^https://'),checked_at timestamptz NOT NULL,
 note text NOT NULL CHECK(char_length(note) BETWEEN 10 AND 500),checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(place_id,day)
);
CREATE INDEX IF NOT EXISTS place_opening_days_current ON place_opening_days(day,checked_at);
CREATE TABLE IF NOT EXISTS home_layout (
 id integer PRIMARY KEY CHECK(id=1),modules jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO home_layout(id,modules) VALUES(1,'[{"code":"choices","enabled":true},{"code":"highlights","enabled":true},{"code":"tips","enabled":true},{"code":"assistant","enabled":true},{"code":"community","enabled":true},{"code":"news","enabled":true}]') ON CONFLICT DO NOTHING;
