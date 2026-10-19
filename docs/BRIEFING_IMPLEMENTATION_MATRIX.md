# FFM Aktuell — milestone plan from the 17 October 2026 IT Briefing

This is an implementation ledger, **not** a claim of complete product delivery. The brief's 7-page specification requires native clients, media rights, subscriptions and other services not present in the initial vertical slice. Track all milestones separately; never mislabel unverified OSM locations as operating.

## Phase 1: Location actions (this PR)
- Route: external directions from real GPS coords, with a textual fallback when location has no reliable coordinate
- Merken: private persisted bookmarks for verified/published locations and separately for unverified raw OSM candidates; the latter must never be silently promoted to the main catalogue
- Teilen: canonical place deep links, fetched by ID when opened so pagination doesn't break them
- Anrufen and Website only when real phone / safe HTTP URL exists
- Moderated text tip tied to an OSM or published location, without user photo-upload claims
- Fehler melden: user report, human editorial queue, and audit. Reports never automatically change business status
- MapLibre selection → in-app details for OSM and published venues
- QA before production release: logged-in/logged-out actions, 390px viewport, CTA open/close, share-link import, save/remove, reporter/admin review, XSS URL validation

## Phase 2a: Authenticated, moderated ratings (this PR)
- 1–5 stars and 20–1000 character opinions per real venue, one review per user per location
- Separate OSM and published venue references, no reviews for fake demo locations
- Independent admin approval is required before a user rating enters public average or review list
- Abuse reports are private and deduplicated; human moderation and explicit review removal only
- User display initials, not full names; no unverified visitor badge
- **Still open:** end-to-end browser interaction and moderate/reject tests on STRATO after deploy
- No arbitrary image URLs or public upload until storage, content scanning, rights/takedown process and retention are approved

## Phase 2b: Community interaction (this PR)
- Real published posts can be liked/unliked once per signed-in account; persistent visible counts
- Comments require sign-in and editorial approval before public display or counting
- No writes or social engagement controls on any imaginary demo profile or post
- Minimal inline like/reply controls keep the public page easy to navigate
- Real API + disposable PostgreSQL tests cover moderation and user-scoped likes

## Phase 2c: Private follows and followed activity feed (2026-10-19)
- Private user-to-author follow controls from approved posts; no public personal profile pages or public follower counters
- Private follow of approved businesses only where a published, visible venue exists; no following pending claims or unverified OSM entities as business owners
- Community filter 'Alle Beiträge / Folge ich' returns only already published posts from followed authors or publicly verified businesses associated with published venues
- Guest users may read public posts but cannot follow, and cannot access anyone's followed list
- Repeated follow/unfollow is idempotent; attempts to follow yourself or unapproved entities are rejected; accounts/relationships cascade on deletion
- Data gates verified by disposable PostgreSQL + real API CI tests
- **Still open:** uploading real photos/videos needs approved EU storage, malware/content scanning, licensing and erasure procedures. 24h stories/highlights, rights grants/expiry/revocation, and configurable activity privacy remain pending.
- This milestone is not the complete phase 2, and does not imply native app release.

## Phase 2: User community, ratings, real media
- Moderated photos/video upload with object storage and ownership / license checks, copyright consent, takedown workflow
- Star reviews, brief tips, public replies, reporting, filtering, abuse control; verified visit proof rules require explicit approval
- Likes, comments, follow, activity privacy, 24h stories and rights-managed business highlights with expiry/revocation
- Real location-based post feed with authentic photos (no invented venue images)

## Phase 3a: Private tours and external navigation (2026-10-19)
- Registered users can create private tours with 2–8 real, geo-located stops selected from saved places, reorder their stops, and optionally schedule HH:mm stop times
- Public published venues and visibly labelled unverified OSM candidates remain separate; locations without coordinates cannot enter a navigation route
- Users can open ordered walking, cycling or driving navigation in an external maps provider
- Explicit high-entropy shared link contains only tour title/stops, no author account or personal saved-list data; link can be revoked immediately
- Full CRUD plus private authorization, order, source visibility, share and revocation covered by database-backed CI tests
- UX lives behind `Meine Orte → Tour planen`, not another permanent navigation tab
- **Still open:** editorially curated tour catalog, trip availability and accurate travel time estimates; cross-platform deep link test, provider/localization policy; native offline maps

## Phase 3: Real-life discovery and tours
- Category taxonomy with multiple categories per venue and dynamic admin categories
- Price, verified opening status, accessibility, occasion, city district, geodistance, indoor/outdoor filters only from actual corroborated data
- Event save/reminder, external booking, push preferences
- Curated and private tours, ordered stops and shareable route plan
- Personalization / optional natural-language assistant with source grounding and approval for weather/data sources

## Phase 3b: Event bookmarking and private account controls (2026-10-19)
- One click event bookmark for actual published future events, private and idempotent; never applies to fake preview events
- Download a genuine ICS calendar entry with an optional 60-minute calendar alert, with calendar duration explicitly labelled as a placeholder because the source has no end time. No claim of configured FCM/APNs push delivery.
- `Mein Profil` from the existing account button, covering editable interests and favorite neighborhoods, opt-in preference capture and consent-first activity visibility (default OFF; no public activity pages)
- User-owned JSON data export and password + exact confirmation account deletion; prevent admin or owner of approved business from irreversible deletion before handover
- Disposable PostgreSQL + actual API tests cover event ownership, preferences, export, deletion
- **Still open:** native push-provider delivery and consent management, real event image licensing/category/prices, provider confirmed event end-times, Google/Apple/phone SSO and legal retention details

## Phase 4a: Owner controlled branch corrections, editorial signoff (2026-10-19)
- Approved business owners can submit and update base business location details (name, address, phone, website and opening hours) from a collapsible mobile panel without confusing campaign/advertisement settings
- A pending change is NOT public. Requests are tied to an approved business ownership and visible to that business in its private dashboard
- Admin moderation sits inside existing `Freigaben` with approve/reject, audit and a single active request per branch
- Approved edits cause previous operating/existence verification to expire, leaving the location transparently *Ungeprüft* and its operational state unknown until independently reverified
- Real PostgreSQL + API CI proves outsider denial, pending isolation, editor approval/rejection, contact propagation and review-status reset
- **Still open:** multiple staff accounts and role limits, ownership document upload and independent verification, pricing, payments and ads/coupons, analytics disclosure and full business billing functionality

## Phase 4: Business & payments
- Staff/subaccounts, editable multi-branch businesses and ownership verification documents
- Tier entitlements, cancellation/invoices/SEPA/card provider choice, free and paid trials only after pricing approval
- Sponsored listings/ad slots with fixed pricing, billing, review and trustworthy analytics
- Redeemable codes, coupons, anti-replay security and loyalty cards after abuse/legal rules approved

## Phase 5: Native clients, operational compliance & launch
- iOS and Android delivery, Apple/Google auth and approved telephone flow
- User account deletion/data export, DSGVO/DSA operation, accessibility, rights/audit/retention
- Multi-city-ready API permissions, localization, backups/recovery and real-client release acceptance

## Explicitly excluded from mandatory v1 by the brief
Global point earning/rewards, in-app restaurant bookings, direct ticket checkout, private user DMs, unsolicited company messaging, public personal user pages, user-published public recommendations.

## Decisions the team must obtain
Name/trademark, prices & trial rules, billing/tax/PSP, operator verification, verified-visit methods, license/consent terms for photos/OSM, moderation policy and appeal process, default language, public privacy and release signoff.
