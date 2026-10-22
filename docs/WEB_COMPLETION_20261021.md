# Web completion: advertising, telephone access and contextual discovery

Native applications and email remain excluded. This increment implements the remaining named web modules without introducing real provider credentials or pretending that provider acceptance has occurred.

## Editable decisions

| Area | Implemented default | Change surface |
| --- | --- | --- |
| Advertising | Flat daily inclusive EUR price; search/feed/events €15, home €25, stories/district/category €10. Draft until finance approves actual HTTPS contract terms. No guaranteed reach. | Finance → Tarife → Werbetarife |
| Advertising approval | Marketing checks content; finance approves rates; merchant separately accepts exact total and terms; only signed provider payment can start delivery. | Existing marketing and finance roles |
| Booking period | Inclusive Berlin calendar days, 1–91 days, booking starts no earlier than the following day. Existing orders preserve content, price and terms. | New merchant proposal |
| Ad measurement | Browser observes at least 50% visibility continuously for one second while document is visible. A click implies a view. Each issued receipt counts once per kind under a database row lock. | SponsoredPlace component and authenticated-origin receipt API |
| Ad privacy/abuse | No third-party pixels, permanent ad identifier or unique-person claim. Daily HMAC IP buckets cap serving at 60/hour. Temporary receipts are erased after two days; aggregate daily counts remain. Counts are technical, not independently certified human reach. | Advertising handler, maintenance worker |
| SMS | Twilio Verify. Link an owned number from an existing account with fresh password/OAuth authentication, then use SMS login. No automatic email matching or fake email accounts. | Profile and login |
| SMS limits | Germany +49 by default, five sends per phone/IP per hour, one per phone per minute, global 100/day, five checks, ten-minute challenge. Failed sends/checks consume budget. | FFM_PHONE_PREFIXES and FFM_PHONE_DAILY_LIMIT; route constants |
| Sensitive access | SMS alone cannot log into root/delegated administration or merchant/staff accounts and does not count as fresh authentication for sensitive changes. | Phone handler, session freshness |
| Discovery | Optional date, relative venue price level, source-backed family/date/group/quiet attributes, separate numeric event entry budget, explicitly opted-in interests/districts. | Home → city ideas |
| Weather | OpenWeather five-day/three-hour forecast for Frankfurt only, cached 30 minutes with actual retrieval timestamp. Rain/cold/heat prefers venues with recent positive indoor evidence. Missing/out-of-horizon forecast applies no weather filter. Provider failure backs off 15 minutes. | OPENWEATHER_API_KEY; contextual search checkbox |
| Translation and AI | Public published posts only, German/English, explicit request explains OpenAI transfer; no image/private message transfer. Source-hash cache invalidates edited posts; withdrawn posts cannot be translated. Optional ranking sends only eligible verified venues. | Per-post translation and city-ideas opt-in |
| Text costs | Shared database-reserved allowance of 20 requests/user/hour and 200 total/day across ranking and translation; provider failures consume allowance. Translation cache 30 days. | text-provider helper; maintenance worker |

## Advertising payment and cancellation

`POST /api/ad-booking` validates owner, approved merchant/branch/content, approved current rate, affirmative terms and exact current amount under locks. A pending order is unique per campaign. Hosted Stripe payment supports card/SEPA, inclusive tax calculation, billing details and provider invoices. A browser success URL never grants delivery. Bank processing blocks a second booking even after the original checkout expiry. Immutable order snapshots survive rate edits.

The existing signed `/api/billing/webhook` also synchronizes advertisements, with a separate deduplication ledger. It retrieves the current checkout and payment intent, verifies known session/customer, currency and exact amount, checks the latest charge for refunds, and handles asynchronous payment. Out-of-order events cannot revive refunded orders. Any refund pauses ad delivery immediately; partial delivery/financial reconciliation is an operator decision in the provider dashboard. Invoice events update the known order's invoice link. No public API can arbitrarily refund money.

Delivery and measurement both recheck paid order, editorial status, business/branch approval and Berlin booking dates. Merchant or marketing stop takes effect on the next delivery/receipt. A stop does not imply an automatic refund; the contract and financial reconciliation still apply. No ad is shown before real payment. If bank settlement occurs after the complete booking window, there is no delivery; finance must reconcile/refund in the provider dashboard. No unearned reach or fulfillment is claimed.

Merchant dashboards show real aggregate counts and invoice links. Finance lists advertising orders separately from subscriptions. No fabricated impressions, revenue, unique visitors or visit conversions exist.

## Provider activation

Extend the same production environment `FFM_SERVICES_JSON` configuration with:

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`; optional `FFM_PHONE_PREFIXES`, `FFM_PHONE_DAILY_LIMIT`.
- `OPENWEATHER_API_KEY`.
- Existing `OPENAI_API_KEY`, `OPENAI_RECOMMENDATION_MODEL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Compose and the allowlisted deployment helper pass these values without printing them. Service readiness reports booleans, never credentials. No SMS is sent and no payment/provider acceptance is claimed by fixture tests. Twilio requires a real Verify service, permitted countries and account funding; Stripe requires a real account, tax/contract data and webhook registration. Provider terms/licensing and real delivery/checkout testing are external acceptance steps.

The internal scheduler also calls token-protected `/api/internal/maintenance` every minute, independently of whether Push is enabled. It erases expired transient phone challenges, text request reservations and ad receipts after two days, and translation caches after 30 days. Production keeps the existing private worker token. Phone numbers are included only in the user's own export and cascade on account deletion; OTP codes are never stored or logged.

## Verification

Behavioral PostgreSQL-compatible tests cover real route execution and persisted state: telephone link/freshness/region/rate/proof/replay, restricted SMS sessions, exact-source translation caching/withdrawal, sourced discovery budgets and expiring facts, shared cost quota, immutable ad pricing, current payment/refunds and late events, owner/quote/pending checkout gates, and one-time ad receipts. The Twilio adapter test inspects real request fields with an in-process fake transport.

Actual PostgreSQL HTTP CI additionally races three receipts for one ad token and proves one impression/click, owner stop, outsider isolation and immediate receipt withdrawal. Chromium mobile regression exercises the optional date/budget/occasion fields, event results and sponsored viewability. These tests use isolated fixtures, not production customers or paid services.

Primary provider references: [Twilio start](https://www.twilio.com/docs/verify/api/verification), [Twilio check](https://www.twilio.com/docs/verify/api/verification-check), [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [OpenWeather forecast](https://openweathermap.org/api/forecast5).

## 22 October: daily opening status and homepage CMS

The public current-opening filter now uses explicit, source-backed calendar-day plans in Europe/Berlin. Up to six nonoverlapping half-open minute intervals are accepted per day; holiday exceptions require their own dated plan. Unknown dates, stale evidence, stale operating verification and unverified OSM data never match. Overnight hours must be split over the two actual dates. Editors can publish a dated plan or closure for up to 30 days ahead, withdraw it and inspect before/after history. No weekly/OSM text is silently converted into a current opening claim. Venue details explicitly label the result as the confirmed plan and link the source; this is not live physical occupancy/availability.

Editors can reorder/show/hide six homepage modules: categories, verified places/events, sourced tips, personal ideas, community/business and city stories. Hero/search/navigation remain reachable. Configuration is validated and audited, persists across migrations and falls back to the default layout if malformed.

Additional tests cover actual SQL opening filters, unknown/stale/closed states, Europe/Berlin DST and boundary minutes, write permissions/evidence, withdrawal history and non-resetting homepage configuration. Actual PostgreSQL HTTP CI exercises these endpoints as well as public reads and unauthorized writes.
