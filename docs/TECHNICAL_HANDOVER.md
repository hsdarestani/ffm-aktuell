# FFM web technical handover

22 October 2026. Grounded in `Frankfurt_App_Vollstaendiges_IT_Briefing.pdf`, version 1.0, 17 October 2026, and the current branch. Native iOS/Android applications and email are outside this increment. This is an implementation handover, not a declaration of complete PDF acceptance.

## Architecture decision

The web application uses Next.js/React, a shared PostgreSQL schema and server-side route handlers. PostgreSQL is the authority for ownership, moderation, rights, subscriptions to notifications and private data. Raw OpenStreetMap discovery candidates remain separate from editorial places. Source-backed facts and operating verification are distinct. One application serves public pages and authenticated workspaces; authorization is enforced again on the server. This avoids a second backend deployment while keeping domain boundaries explicit in route handlers and libraries. Native clients can reuse documented HTTP endpoints later; no native implementation is implied.

MapLibre renders the interactive map with a bounded startup deadline. On unsupported WebGL or stalled external sources the DOM map provides navigation and sparse readable pins. External styles and tiles remain availability dependencies; a rendered fallback is not evidence of successful live 3D. LoD2 rendering has its own bounded source requests.

The isolated Docker Compose project runs FFM web and PostgreSQL on a shared host. Only the edge proxy network is shared with Publisher. Database credentials/hostname and private media storage are separate. A tiny scheduler inside the web container calls the token-protected push worker every minute. PostgreSQL advisory locking prevents overlapping worker execution. Authenticated data and APIs are not cached by the service worker.

## Sitemap and working prototype

| Area | Navigation and working screens |
| --- | --- |
| Public | Map landing, Start, Discover, venue details, comparison, city journal with events/news/offers, community, curated and shared tours |
| Account | Registration/login, private places, saved events/calendar export, private tour editor, interests/districts, privacy, category preferences, device Push controls, JSON export, account deletion |
| Business | Registration/claims, branches and proposed corrections, deals/coupon redemption, Stories/Highlights rights management, advertisement proposals, staff invitations/roles, real aggregate insights, web subscriptions, invoices, cancellation and private loyalty cards |
| Administration | Overview, place review, moderation queues, publishing, categories and sourced venue attributes, advertisement review, department roles, team seat allocation, tariffs, financial ledger, loyalty review, city tips, data quality, service readiness |

The deployed site is the interactive prototype and implementation. Existing preview content is marked as sample content; it is not licensed editorial inventory or proof that the corresponding operational capability is live. Separate approved wireframes, final visual acceptance and a native prototype remain outstanding.

## Domain model and permissions

The exact, idempotent model lives in `db/schema.sql`; no external diagram supersedes its constraints.

| Domain | Main entities and boundaries |
| --- | --- |
| Identity | users, sessions, social_identities, user_preferences, email_verification_tokens; private account data belongs to its user |
| Catalogue | places, discovery_candidates, catalog_categories, place_categories, place_field_evidence, place_attributes/history; raw imports never self-verify |
| Social | posts, likes/comments, follows, venue_reviews, reports; published moderation state controls public visibility |
| Media | user_media, stories, media_right_grants, highlights; scan, moderation, time and revocation gates remain independent |
| Planning | events, news, favorites, event_favorites, user_tours/stops; shared tour token explicitly grants read access |
| Business | businesses, claims, proposed branch corrections, team members/invites; owner authorization and seat limits apply |
| Commercial | subscription_plans, immutable billing_prices, billing_checkouts/subscriptions, invoices, credits/refunds, ad_campaigns, deals/coupons and loyalty cards; ad_rates, immutable ad_orders, deduplicated ad_webhook_events and viewable receipt/daily aggregates implement paid advertisement delivery |
| Notifications | push_subscriptions and push_deliveries; browser consent plus stored category preferences required |
| Audit | audit_log plus source evidence/history; changes retain actor, target and time according to each workflow |

| Actor | Read | Change | Publish/bill |
| --- | --- | --- | --- |
| Guest | Public content, map/search, shared tour | None of the private interaction actions | No |
| User | Own account, private favorites/tours/coupons/devices, subscription records and loyalty cards; public content | Own private data and moderated submissions, rights grants/revocations | Cannot self-approve |
| Approved business owner | Own company/branches, rights and aggregate insights | Proposals, permitted company data, delegated staff within allocated seats | Editorial approval still required; hosted checkout grants benefits only after signed provider synchronization |
| Staff viewer | Own business scope and allowed aggregate data | No branch content writes | No |
| Staff editor | Viewer scope | Corrections for own business; no cross-company writes | Cannot approve corrections |
| Department admin | Only assigned editorial, moderation, business, marketing, finance or operations screens | Capability-checked actions; changes audited | Publication and commercial approval remain separate gates |
| Root admin | All administration and role assignments | Editable roles, grants and revocation with recent authentication | Cannot bypass provider payment verification |
| Push scheduler | Only delivery processing with worker token | Claims/retries/delivery receipts | Cannot publish editorial content |

Editable department roles and branch-scoped staff delegation are implemented. Permissions are read on each authenticated request, so revocation takes effect immediately. Staff capacity comes from an active paid entitlement or an explicit audited manual allocation; restricted staff cannot read whole-company analytics. See [commercial and access decisions](COMMERCIAL_AND_ACCESS_20261021.md).

## API design and workflow contracts

See [generated API inventory](API_INVENTORY.md) for actual handlers and [requirements implementation ledger](BRIEFING_IMPLEMENTATION_MATRIX.md) for workflow state. JSON errors use non-success HTTP statuses. Server-side authentication, origin checks and parameterized queries protect writes. Dedicated handler implementations are authoritative where validation differs. The generated [OpenAPI contract](openapi.json) and [operation handbook](API_CONTRACTS.md) cover all 149 implemented operations, including input structures, query parameters, actual authorization/validation expressions and response shapes. The live read-only reference is `/api-docs` and the machine-readable contract is `/api/openapi`. Imperative action/state validation remains authoritative; the documentation does not execute source expressions.

| Workflow | Trigger and preconditions | Result and failure behavior | Acceptance evidence |
| --- | --- | --- | --- |
| Discover | Guest/user combines categories, district/radius, supported facts, price level and rating | Stable editorial/OSM pagination, strict AND factual filters; unknown/stale facts excluded | PostgreSQL search tests and real Chromium filters/reset regression |
| Editorial attributes | Admin chooses actual place, valid field/value, HTTPS source, recent date and statement | Atomic update/withdrawal, before/after history and audit; invalid/non-admin request rejected | `place-attributes.test.mjs` |
| Saved event | Authenticated user bookmarks published event | Private profile list; remove bookmark; confirmed end or explicitly provisional `.ics` block | Calendar unit tests, browser save/removal and HTTP CI |
| Push | Explicit device permission and category opt-in; configured VAPID | Event/news/offer/followed-business/city-tip queue, consent and current source eligibility rechecked before send; expired endpoints removed; bounded retries | PostgreSQL queue tests and generated-key signature check; real provider/device acceptance still needed |
| Media post | Authenticated owner, confirmed rights, reachable scanner | Private quarantine, normalization and moderation; unavailable scanner fails closed | Existing media security tests; real scanner unavailable on current host |
| Business edit | Approved owner or authorized editor, real scoped branch | Proposed correction queued; never self-published | PostgreSQL HTTP acceptance tests |
| Coupon | Published approved offer and logged-in user | Random private claim; authorized redemption once; no verified-visit claim | Existing coupon concurrency/permissions acceptance |
| Subscription | Approved tariff, contractual terms and configured provider | Hosted card/SEPA checkout, signed synchronization, immutable terms, expiry, invoices, credits/refunds and provider portal | Billing lifecycle tests and real PostgreSQL entitlement checks; live provider acceptance pending |
| Advertisement | Approved owner, reviewed content, released rate/terms and actual payment | Immutable quote, hosted card/SEPA checkout, signed payment/refund synchronization, eight placements and current viewability receipts | PostgreSQL payment/receipt lifecycle tests and Chromium visibility regression |
| Loyalty and visit proof | Approved merchant program, actual scoped merchant confirmation | Hashed short-lived one-time codes, immutable card rules, minimum visit interval, one-time reward and private wallet | PGlite lifecycle plus real PostgreSQL concurrent visit/reward HTTP tests |
| Account deletion | Own account and exact confirmation plus recent/password authentication | Private data/device cascades; protected business/admin gates may reject | Existing HTTP CI and push cascade test |

## Data sources, providers and rights

| Dependency | Use | Remaining requirement |
| --- | --- | --- |
| OpenStreetMap | Raw discovery and map attribution | Preserve ODbL/source attribution and importer provenance; no automated business verification |
| Official venue/tourism sources | Editorial evidence and current facts | Human review, freshness and field-level source; image rights separately required |
| External map styles/tiles and LoD2 | Map presentation | Provider availability/licensing verification and operation within quotas |
| Google / Apple | Existing confidential OAuth integrations | Real provider applications, domain/redirect registration, credentials and login acceptance |
| OpenAI | Optional constrained venue ranking | API project/key/model access, budget settings and verified inventory |
| Stripe | Hosted web subscriptions and billing synchronization | Real account/key registration, contract/tax data, webhook configuration and live acceptance |
| Web Push | Browser push services, VAPID signatures | Device consent, browser support and real delivery acceptance |
| ClamAV / sharp / ffmpeg | Malware gate, metadata stripping and media processing | Resourced private scanner and production processing acceptance |
| Resend | Existing optional email implementation | Excluded from this increment |

Direct dependency versions are locked in `package-lock.json`. Provider/data/image contractual acceptance and a complete transitive software license review are still outstanding. No image obtained from a venue website becomes licensed merely because its URL is public.

## Operations, releases and acceptance

CI runs behavioral/source tests, TypeScript, production build, real Chromium recovery/filter/profile regressions, disposable PostgreSQL HTTP acceptance and Compose validation. Deployment pins an exact tested commit, backs up isolated source/database/media, applies additive idempotent schema changes, builds the container, initializes missing Push keys privately, updates only FFM web and validates both FFM and Publisher health. Failure restores prior isolated source/image/environment where available. A successful deployment is not proof that provider logins, malware scanning or billing were accepted.

Use [service activation](SERVICE_ACTIVATION.md) for the one optional secret and external prerequisites. Admin → Dienste shows configuration booleans, scanner reachability and actual verified inventory without exposing keys. Never print `.env`, OAuth keys, push endpoint credentials or worker authorization headers. Backups containing credentials stay private. [Operations](OPERATIONS.md) defines installed daily private snapshots, seven-day bounded retention, five-minute internal health/freshness checks, an independent public monitor and incident/restore procedures. CI rehearses actual archive restore. Off-host destination, alert recipient/on-call ownership and qualified operational acceptance still require operator inputs.

## Remaining backlog and dependencies

Estimates below are engineering planning ranges in person-days, not committed dates. Work includes integration and QA, and can expand after product/legal decisions.

| Remaining work | Estimate | Dependency |
| --- | --- | --- |
| Production scanner and media/Stories/Highlights acceptance | 2–4 | Separate capacity/private scanner and rights policy |
| Google/Apple real account linking/deletion acceptance | 2–4 | Provider accounts, credentials and test users |
| Phone provider acceptance | 1–2 | Twilio account/Verify service, funded delivery and real test numbers; linking/login/abuse limits are implemented |
| Weather/text provider acceptance and editorial attributes | 1–3 | OpenWeather/OpenAI access and verified facts; contextual search/translation/cost controls are implemented |
| Live web billing provider acceptance | 2–4 | Real PSP account, tax/contract data, webhook and test account; implementation is complete and tested with fixtures |
| Live ad checkout/payment/refund acceptance | 1–3 | Stripe account, released actual advertising terms/rates and funded test account; booking/delivery/measurements are implemented |
| Real device Push acceptance and delivery monitoring | 1–3 | Consenting test devices and volume targets; web categories are implemented |
| Editorial inventory and licensed media | Ongoing | Real source review, copyright grants and content owner |
| Stakeholder acceptance of implemented screen flows and A–I cases | 2–4 | Actual content, operational owners and consenting test users; API contracts and executable regression cases are delivered |
| Independent legal/accessibility acceptance, vendor ownership and off-host backup destination | 5–10 | Operator, qualified reviewers and a private destination/retention policy; keyboard/automated accessibility checks and isolated restore rehearsal are delivered |

No secret alone completes these open items. Native apps and email are excluded as instructed. Follow the remaining backlog rather than treating the existence of a database table or a green CI run as completed product behavior.

## Latest combined acceptance

Source `6f81be9f49a2cd84f13a95693570631cd36bed3c` passed all 176 tests, TypeScript, production build, Chromium regressions, actual HTTP acceptance on temporary PostgreSQL and Compose validation in [CI run 39638646930](https://github.com/hsdarestani/ffm-aktuell/actions/runs/39638646930). The tested scope includes concurrent loyalty confirmation/redemption, permission revocation and paid entitlement expiry. This does not replace real provider/device acceptance or complete the remaining web backlog.

## Final named web modules

[Web completion decisions and tests](WEB_COMPLETION_20261021.md) covers implemented source-backed daily opening filters, editorial homepage layout, contextual discovery, weather adapter, consent-based public-post translation, linked phone access, paid ad booking/delivery and actual viewable receipt counting. The remaining provider, factual inventory, legal and independent operational acceptance steps are not completed by code or secrets alone.

### Admin workspace visual correction — 2026-10-22

All 15 permitted sections now use task-grouped navigation (editorial, content, business, administration), with Today first for root administrators. The desktop rail scrolls independently; mobile uses a grouped menu with focus containment, Escape and opener restoration. Permission filtering remains unchanged.

Shared admin-only controls cover account search, catalog/roles, tariff/seat forms and moderation tools. Homepage modules use compact ordered rows, correctly sized checkboxes, spaced movement actions and a separate save action. Failed initial layout loading blocks editing/saving rather than overwriting the saved layout with defaults. Empty role/team/loyalty states are explicit. Public interfaces retain their own styles.

`node scripts/admin-workspace-browser.mjs` uses isolated HTTP fixtures and a production build to exercise every section at desktop/mobile sizes, check horizontal overflow, audit accessibility, test homepage order/visibility persistence and account search, and capture representative screenshots. It creates no production records and is included in CI. Provider delivery and independent accessibility acceptance remain external prerequisites.

### Public-site design review — 2026-10-23

The business workspace now groups existing tools into five task areas: locations, content, customers, advertising and administration. Hidden sections stay mounted so switching tasks preserves unsent form drafts. Example offers are an explicit optional disclosure. Existing authorization, payments, moderation and scanner gates are unchanged.

Public profile/premium/business controls now share spacing, readable input sizes and appropriately sized checkboxes. Profile auxiliary sections use the same reading width as profile settings. Assistant consent checkboxes no longer inherit text-input dimensions. Secondary editorial, saved-place and tour labels have measured darker colours. Content photographs in the main experience and homepage have a local SVG illustration fallback with an explicit unavailable-image alt label; it is not venue photography or a verified-content claim.

`scripts/site-design-browser.mjs` exercises production-built public pages and all five business task areas at 1440, 390 and 320 pixels, with anonymous/registration states, English business labels, blocked external photographs, draft preservation and checkbox-size assertions. Isolated HTTP fixtures create no production records; the browser checks and screenshots are included in CI. Existing map/admin/API/PostgreSQL/restore checks remain required.
