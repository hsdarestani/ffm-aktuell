# FFM Aktuell — actual implementation vs 17 October 2026 briefing

This is a **feature-branch development ledger**, not production acceptance. Do not treat GitHub CI success as real store, server or user testing. The full 7-page product brief plus requested 13 deliverables still contain substantial work.

## Implemented in repository / PR #48 (not necessarily deployed)
- Responsive multilingual first-party Next.js web/PWA, moderated location and OSM discovery, location actions, user accounts and private favourites.
- MapLibre 3D (default), genuine editable location markers, OSM raster fallback and tile-data readiness detection. Live grey-map fix still awaits deployed browser QA.
- User tour planner and limited ready-made editorial/previews; transparent unverified stop labels, route sharing and revocation.
- Community posts, likes, moderated comments, follows, reviews, reporting, optional stories, media upload & business highlights with consent, 24-hour expiry, moderation and owner deletion. Actual upload remains scanner-dependent.
- Optional private user interests, conservative AI suggestions, Google/Apple web OAuth code paths (only usable after provider configuration).
- Category taxonomy: create/edit/disable, one-level subcategory, German/English labels, audited admin assignment up to 8 tags per published place; data-backed filters. Comparative side-by-side venue panel limited to three actual records with unverified flags.
- Approved business basic profile/corrections, one-use approved deal coupons, business media/highlight requests.
- Business advertising **draft proposals only**, owner creation/review/cancel, editor approval/reject with audit, no payment/price/advertising delivery.
- Admin editorial flow, pending queues, category and ad review modules, sourced event pricing/categories/organizers and future scheduled local news.
- CI covers tests, TypeScript, build, disposable PostgreSQL E2E and compose validation.

## Remaining from mandatory brief, no implementation-complete claim
### Content and discovery
- Independently source-check and editorially verify thousands of venue candidates, opening status, attributes, geo-distance and event/news availability; populate real content lawfully, no fake inventory.
- Combine trusted price, accessibility, occasion, indoor/outdoor, family status, hours, rating and open-now filters, plus event, sentiment, budget, weather and real local trend signals.
- Full bilingual UI and clearly tagged opt-in UGC translations; comprehensive managed homepage modules and rich place/event/news detail content.

### Social and identity
- Deploy scanner/storage/backup & content takedown/appeal/retention process, upload tests on iOS/Android, security review, staff permission model and automatic moderation (currently human review gate).
- Verified visit policy, visit proofs, business responses to reviews and abuse disputes.
- Google/Apple live provider keys, safe social-account linking to existing email users, phone/SMS login, granular real APNs/FCM notifications.

### Business, subscriptions, billing and advertising
- Commission/pricing decisions, entitlement matrices, premium trial and annual subscription, invoice/tax/SEPA/card payment and cancellation/renewal logic.
- Multi-branch employee permissions, trusted ownership verification documents, separate staff support/moderation/finance roles.
- Actual fixed-price ad inventory, authorized transactions, sponsored placement with transparent labelling and permissioned analytics, legitimate impression/click/coupon tracking.
- Digital loyalty cards with privacy-preserving repeat visit proof; depends on formal visit verification rules.

### Apps and operational acceptance
- Proper Android/iOS production clients and store-compliant sign-in/payment/privacy, realistic device performance QA, push permissions, release builds and App Store / Play submission.
- Development/staging and production isolation, real browser/mobile map QA, accessibility audits, threat modelling, DSA/GDPR audit and takedown documentation, backups/restore and monitoring, incident response, reliability tests and scale-out/multi-city.
- Deliverable matrix: full sitemap, diagrams and journeys, screen specifications, rights/tier matrix, ERD, OpenAPI specifications, vendor/license register, costed backlog, test cases and live release handbook. Baseline implementation notes and unit/E2E tests are not substitutes for a fully approved technical specification.

## Blocking decisions held for owner approval (never fabricate)
- Final app name/trademark, premium user fee, second business tier fee/staff limits, ad fixed-price schedule, payments & tax setup, verified-visit and loyalty entitlement rules, attribution and licensed sources, moderation/appeals, privacy/translation/AI usage budgets, final visual and user acceptance.

## Non-mandatory in v1
- General points and rewards engine, internal restaurant reservation/ticket checkout, private DMs, unsolicited merchant DMs, public personal profiles and publicly authored recommendation lists.
