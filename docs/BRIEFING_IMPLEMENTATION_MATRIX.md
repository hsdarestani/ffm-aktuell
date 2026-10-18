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

## Phase 2: User community, ratings, real media
- Moderated photos/video upload with object storage and ownership / license checks, copyright consent, takedown workflow
- Star reviews, brief tips, public replies, reporting, filtering, abuse control; verified visit proof rules require explicit approval
- Likes, comments, follow, activity privacy, 24h stories and rights-managed business highlights with expiry/revocation
- Real location-based post feed with authentic photos (no invented venue images)

## Phase 3: Real-life discovery and tours
- Category taxonomy with multiple categories per venue and dynamic admin categories
- Price, verified opening status, accessibility, occasion, city district, geodistance, indoor/outdoor filters only from actual corroborated data
- Event save/reminder, external booking, push preferences
- Curated and private tours, ordered stops and shareable route plan
- Personalization / optional natural-language assistant with source grounding and approval for weather/data sources

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
