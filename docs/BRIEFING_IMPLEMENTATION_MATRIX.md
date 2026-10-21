# FFM Aktuell — milestone plan from the 17 October 2026 IT Briefing

The dated phases below retain milestone history. Later sections supersede earlier open-item statements. The current backlog is maintained in [technical handover](TECHNICAL_HANDOVER.md).

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

## Phase 4b: Zero-cost one-use coupon pilot (2026-10-19)
- Uses the existing admin-approved real `deals`; no purchase, payments, loyalty-point claims or unverifiable visit status
- Logged-in users may claim one code per real published offer from an approved business; each 144-bit random code remains private in `Mein Profil → Meine Gutscheine`
- Approved business owner redeems a customer's presented code in their dashboard; a database atomic update prevents code reuse, and another business cannot redeem it
- Account export/deletion cascades private coupon records; admin-approved deal review and expiry can disable further claims
- Tests include guest denial, an unapproved deal, owner self-claim denial, per-user uniqueness, private wallet, false code, successful redemption and replay rejection
- **Still open:** discount economics/legal terms confirmed per merchant, refund or exception handling, in-person fraud/identity verification, venue visit evidence, business staff permission model, quota limits and comprehensive analytics
- This is a no-payment pilot, not the finalized commercial tariff/ad workflow.

## Phase 5: Native clients, operational compliance & launch
- iOS and Android delivery, Apple/Google auth and approved telephone flow
- User account deletion/data export, DSGVO/DSA operation, accessibility, rights/audit/retention
- Multi-city-ready API permissions, localization, backups/recovery and real-client release acceptance

## Explicitly excluded from mandatory v1 by the brief
Global point earning/rewards, in-app restaurant bookings, direct ticket checkout, private user DMs, unsolicited company messaging, public personal user pages, user-published public recommendations.

## Decisions the team must obtain
Name/trademark, prices & trial rules, billing/tax/PSP, operator verification, verified-visit methods, license/consent terms for photos/OSM, moderation policy and appeal process, default language, public privacy and release signoff.

## Phase 3c: Admin-managed taxonomy, real multi-category assignment (2026-10-19)
- A new `catalog_categories` table provides German and English labels, optional one-level parent category, active state and audit records.
- Existing standard categories are seeded but never silently overwritten during schema reruns.
- A real `place_categories` relationship gives each published place up to eight categories while preserving its canonical category.
- `GET /api/places` and `GET /api/location` expose the assigned tags; publication filters match secondary categories.
- Admin `Kategorien` screen manages labels, subcategories, activation and multi-tag assignment; all writes require an admin session.
- Public discovery combines the installed static catalog and dynamic active categories, and falls back cleanly if the API is unavailable.
- **Open:** OSM data importer still emits source-native primary tags and does not infer custom editorial subcategories, public result comparisons and multi-filter UI not yet complete.

## Phase 4c: Non-publishing advertisement proposals and editorial approvals (2026-10-19)
- Approved business owners can create structured ad proposal drafts for search, homepage, feed, Stories, events, districts or categories, selecting a real owned published branch and requested dates.
- Submission is explicit and rate-limited; only the business owner sees their records.
- Admin reviews proposals, with reasons on rejection and audit records.
- Approval advances to `awaiting_commercial_setup`, **never** `live`, billable or public. No arbitrary tariffs, discount prices, or fake payments.
- Actual ad placement, approved price lists, SEPA/cards, subscription entitlements, impressions/click data, invoicing and customer-facing publication remain pending the documented commercial decisions.
- End-to-end tests exercise the real disposable PostgreSQL database, read/write permission gates, approval transition, no-checkout contract and cancellation.

## Cross-cutting release gate
- All current draft-PR code requires merge, DB migration, safe publication and real mobile/browser acceptance. CI passing is not proof of STRATO production readiness.
- OAuth client keys, ClamAV scanner and owner/copyright policies remain external prerequisites; Apple/Google app store clients are not included.

## Phase 4d: Verifiable company staffing and restricted delegated edit (2026-10-19)
- `business_team_members` and hashed seven-day `business_team_invites`, scoped by business. Unverified email/password accounts cannot redeem a third-party invite. Sign-in with Google/Apple marks email verified only when cryptographically validated; optional transactional email verification is otherwise needed.
- Business owner may invite, revoke, promote/demote and remove staff, but only when the business is approved, staff seats were explicitly allocated by admin, and an independent trusted sender can deliver the invitation. Default capacity is zero.
- Admin seat changes require recorded reason and explicit terms approval; cannot reduce below existing active + unexpired reserved seats. Staff viewers can read company listings and aggregated metrics, staff editors can submit scoped venue corrections, never self-approve or publish.
- **Open:** full commercial staff entitlements/tariff integration, multiple independent team owners/admin organizational roles, proof of registration/ownership documents, and a configured live email sender.

## Phase 4e: Honest merchant analytics (2026-10-19)
- Real Postgres aggregations for published places, active deal records, last-30-day coupon claims/redemptions, moderated posts and ad proposals. No per-user identities in analytics, follower count withheld under five.
- There are **no fabricated impression, click, revenue or verified-visit counts**. Actual ad delivery is not active.

## Phase 4f: Premium tariff configuration without subscription activation (2026-10-19)
- Draft, bilingual, auditable pricing/feature catalogue for personal and two business Premium plans. No real price values are seeded or approved. The user's brief identifies seven-day personal trial but full terms remain subject to approval.
- Admin can store proposed pricing/features and explicitly sign off a price for *display* only, with approval note and HTTPS terms link; withdraw immediately. Every change logs an audit record. Checkout stays disabled.
- **Open:** app-store-approved user IAP, card and SEPA PSP onboarding, entitlement checks, subscription ledgers, tax/legal invoicing, cancellation, refunds, failed payment handling, receipt verification and real trials.

## Phase 5a: Account data rights and safe deletion (2026-10-19)
- User JSON export now covers staff and email status, social providers, uploads, Stories, rights grants and coupons, in addition to original preferences, posts, tours and bookmarks, without exporting secret token hashes.
- Social-only accounts created with random internal passwords can request self-deletion with exact confirmation after a fresh OAuth session; stale sessions cannot delete. Admin and verified-business transfer gates remain. 
- **Open:** comprehensive DSA/GDPR review, immutable legal retention, object/DB backup erasure procedures and real OAuth account deletion device tests.


## 21 October 2026 increment

Default 3D landing, bounded startup/recovery, complete editorial pagination and distance sorting, cancellation-safe load-more, private saved-event list and organizer-end-aware RFC 5545 export are implemented. See [increment and validation](INCREMENT_20261021.md). This does not complete media/OAuth/push/payment/native operational requirements.

## 21 October 2026 service activation increment

Web Push device opt-in/removal, bookmarked event reminders, new editorial news, a bounded retry/deduplication ledger and an isolated scheduler are implemented. VAPID credentials are generated privately at first deployment. OpenAI configuration now reaches the production container. Optional Google/Apple/OpenAI/scanner credentials can be applied through one allowlisted deployment secret without editing source code. See [activation and remaining prerequisites](SERVICE_ACTIVATION.md). Offer/business/tip push, payment entitlements, native clients and product/legal decisions are still incomplete.

## 21 October 2026 source-backed discovery filters

Combined indoor/outdoor, family-friendly, wheelchair accessibility, relative price level and minimum published-review rating filters are implemented. Editors manage each fact with an HTTPS source, a recent check date, a statement and a before/after history. Facts older than 30 days leave public filtering automatically. Unknown facts never match affirmative filters; raw OSM records are omitted while unsupported factual filters are active. Place details show the current source and check date. No facts were fabricated or seeded. Live opening status, occasion/weather interpretation and verified inventory remain incomplete.

## 21 October 2026 operator handover

Admin service readiness reports only configuration/reachability and actual inventory; no secrets are returned. [Technical handover](TECHNICAL_HANDOVER.md) records architecture, sitemap, domain and role boundaries, actual workflow acceptance, provider prerequisites, operational limitations and a remaining backlog. The generated [API inventory](API_INVENTORY.md) lists 114 literal handlers; full request/response OpenAPI coverage and granular admin roles remain open.

## 21 October 2026 delegated roles and commercial lifecycle

Department permissions and branch-scoped business staff are implemented in both APIs and navigation, with audited editable roles and immediate revocation. Real PostgreSQL HTTP CI passed for 05e14b0395bf81b5dc601c406a7063bc1d2422bb. Hosted web subscriptions, signed provider synchronization, immutable tariff snapshots, cancellation/portal changes, invoices, credits/refunds, expiry and paid analytics/staff/branch checks are now implemented. Editable initial price and capacity defaults are drafts until real contract release. See [decisions, tests and limits](COMMERCIAL_AND_ACCESS_20261021.md). Live provider acceptance, paid ad delivery, loyalty, remaining notification categories, phone authentication and the remaining assistant features are still open.

## Remaining web notification categories

Offers, new moderated contributions at followed businesses and source-backed editorial city tips now have separate opt-ins and delivery-time eligibility checks. Publication timestamps are recorded on actual status transitions; migration does not manufacture notifications for old content. Unfollowing, unpublishing, expired offers, withdrawn tips and stale venue verification cancel pending deliveries. Tip scheduling/archiving is available to the editorial role and public tips resolve to real verified venue records. A malformed billing status response no longer crashes the surrounding private profile. Browser/HTTP CI must pass on the combined increment before deployment.

## Merchant-confirmed visits and loyalty

One-time private confirmation codes, merchant/branch authorization, interval/rate limits, immutable per-card reward/rule snapshots, marketing approval, one-time reward redemption, subsequent cycles, private profile wallet/export and merchant-confirmed review badges are implemented. Defaults and editable decisions are documented in [loyalty decisions](LOYALTY_DECISIONS_20261021.md). The evidence is specifically business confirmation, not GPS or purchase proof. Real rewards/conditions and live operator acceptance remain external prerequisites.

## Combined acceptance, 21 October 2026

All 176 tests, TypeScript, production build, Chromium regressions, actual PostgreSQL HTTP acceptance and Compose validation passed for `6f81be9f49a2cd84f13a95693570631cd36bed3c` in [CI 39638646930](https://github.com/hsdarestani/ffm-aktuell/actions/runs/39638646930). Department roles, scoped staff, hosted subscription lifecycle, remaining web notification categories and merchant-confirmed loyalty now supersede their earlier pending milestones. Paid ad delivery, phone authentication, extended assistant/translation, live provider acceptance and operational/legal work remain open. Native clients and email remain excluded.
