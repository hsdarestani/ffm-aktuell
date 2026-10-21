# FFM web technical handover

21 October 2026. Grounded in `Frankfurt_App_Vollstaendiges_IT_Briefing.pdf`, version 1.0, 17 October 2026, and the current branch. Native iOS/Android applications and email are outside this increment. This is an implementation handover, not a declaration of complete PDF acceptance.

## Architecture decision

The web application uses Next.js/React, a shared PostgreSQL schema and server-side route handlers. PostgreSQL is the authority for ownership, moderation, rights, subscriptions to notifications and private data. Raw OpenStreetMap discovery candidates remain separate from editorial places. Source-backed facts and operating verification are distinct. One application serves public pages and authenticated workspaces; authorization is enforced again on the server. This avoids a second backend deployment while keeping domain boundaries explicit in route handlers and libraries. Native clients can reuse documented HTTP endpoints later; no native implementation is implied.

MapLibre renders the interactive map with a bounded startup deadline. On unsupported WebGL or stalled external sources the DOM map provides navigation and sparse readable pins. External styles and tiles remain availability dependencies; a rendered fallback is not evidence of successful live 3D. LoD2 rendering has its own bounded source requests.

The isolated Docker Compose project runs FFM web and PostgreSQL on a shared host. Only the edge proxy network is shared with Publisher. Database credentials/hostname and private media storage are separate. A tiny scheduler inside the web container calls the token-protected push worker every minute. PostgreSQL advisory locking prevents overlapping worker execution. Authenticated data and APIs are not cached by the service worker.

## Sitemap and working prototype

| Area | Navigation and working screens |
| --- | --- |
| Public | Map landing, Start, Discover, venue details, comparison, city journal with events/news/offers, community, curated and shared tours |
| Account | Registration/login, private places, saved events/calendar export, private tour editor, interests/districts, privacy, category preferences, device Push controls, JSON export, account deletion |
| Business | Registration/claims, branches and proposed corrections, deals/coupon redemption, Stories/Highlights rights management, advertisement proposals, staff invitations/roles, real aggregate insights, draft tariff display |
| Administration | Overview, place review, moderation queues, publishing, categories and sourced venue attributes, advertisement review, team seat allocation, tariff proposals, data quality, service readiness |

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
| Commercial | draft subscription_plans, ad_campaigns, deals and coupon claims; no paid subscription/advertisement delivery ledger exists yet |
| Notifications | push_subscriptions and push_deliveries; browser consent plus stored category preferences required |
| Audit | audit_log plus source evidence/history; changes retain actor, target and time according to each workflow |

| Actor | Read | Change | Publish/bill |
| --- | --- | --- | --- |
| Guest | Public content, map/search, shared tour | None of the private interaction actions | No |
| User | Own account, private favorites/tours/coupons/devices; public content | Own private data and moderated submissions, rights grants/revocations | Cannot self-approve |
| Approved business owner | Own company/branches, rights and aggregate insights | Proposals, permitted company data, delegated staff within allocated seats | Editorial approval still required; no billing |
| Staff viewer | Own business scope and allowed aggregate data | No branch content writes | No |
| Staff editor | Viewer scope | Corrections for own business; no cross-company writes | Cannot approve corrections |
| Admin | Review and operational dashboards | Editorial/moderation, draft terms/prices, explicit seat allocation | Subject to workflow validation; cannot activate nonexistent billing |
| Push scheduler | Only delivery processing with worker token | Claims/retries/delivery receipts | Cannot publish editorial content |

The PDF's separate superadmin, editorial, marketing, moderation, support and finance roles and branch-specific staff delegation are not fully implemented; the current admin role is broad. This is a material open item.

## API design and workflow contracts

See [generated API inventory](API_INVENTORY.md) for actual handlers and [requirements implementation ledger](BRIEFING_IMPLEMENTATION_MATRIX.md) for workflow state. JSON errors use non-success HTTP statuses. Server-side authentication, origin checks and parameterized queries protect writes. Dedicated handler implementations are authoritative where validation differs. The source inventory is not yet a complete OpenAPI request/response schema.

| Workflow | Trigger and preconditions | Result and failure behavior | Acceptance evidence |
| --- | --- | --- | --- |
| Discover | Guest/user combines categories, district/radius, supported facts, price level and rating | Stable editorial/OSM pagination, strict AND factual filters; unknown/stale facts excluded | PostgreSQL search tests and real Chromium filters/reset regression |
| Editorial attributes | Admin chooses actual place, valid field/value, HTTPS source, recent date and statement | Atomic update/withdrawal, before/after history and audit; invalid/non-admin request rejected | `place-attributes.test.mjs` |
| Saved event | Authenticated user bookmarks published event | Private profile list; remove bookmark; confirmed end or explicitly provisional `.ics` block | Calendar unit tests, browser save/removal and HTTP CI |
| Push | Explicit device permission and category opt-in; configured VAPID | Event/news queue, consent rechecked before send; expired endpoints removed; bounded retries | PostgreSQL queue tests and generated-key signature check; real provider/device acceptance still needed |
| Media post | Authenticated owner, confirmed rights, reachable scanner | Private quarantine, normalization and moderation; unavailable scanner fails closed | Existing media security tests; real scanner unavailable on current host |
| Business edit | Approved owner or authorized editor, real scoped branch | Proposed correction queued; never self-published | PostgreSQL HTTP acceptance tests |
| Coupon | Published approved offer and logged-in user | Random private claim; authorized redemption once; no verified-visit claim | Existing coupon concurrency/permissions acceptance |
| Tariff/ad proposal | Approved owner/admin according to action | Draft/review/awaiting commercial setup; no paid delivery | Existing lifecycle tests; billing implementation pending |
| Account deletion | Own account and exact confirmation plus recent/password authentication | Private data/device cascades; protected business/admin gates may reject | Existing HTTP CI and push cascade test |

## Data sources, providers and rights

| Dependency | Use | Remaining requirement |
| --- | --- | --- |
| OpenStreetMap | Raw discovery and map attribution | Preserve ODbL/source attribution and importer provenance; no automated business verification |
| Official venue/tourism sources | Editorial evidence and current facts | Human review, freshness and field-level source; image rights separately required |
| External map styles/tiles and LoD2 | Map presentation | Provider availability/licensing verification and operation within quotas |
| Google / Apple | Existing confidential OAuth integrations | Real provider applications, domain/redirect registration, credentials and login acceptance |
| OpenAI | Optional constrained venue ranking | API project/key/model access, budget settings and verified inventory |
| Web Push | Browser push services, VAPID signatures | Device consent, browser support and real delivery acceptance |
| ClamAV / sharp / ffmpeg | Malware gate, metadata stripping and media processing | Resourced private scanner and production processing acceptance |
| Resend | Existing optional email implementation | Excluded from this increment |

Direct dependency versions are locked in `package-lock.json`. Provider/data/image contractual acceptance and a complete transitive software license review are still outstanding. No image obtained from a venue website becomes licensed merely because its URL is public.

## Operations, releases and acceptance

CI runs behavioral/source tests, TypeScript, production build, real Chromium recovery/filter/profile regressions, disposable PostgreSQL HTTP acceptance and Compose validation. Deployment pins an exact tested commit, backs up isolated source/database/media, applies additive idempotent schema changes, builds the container, initializes missing Push keys privately, updates only FFM web and validates both FFM and Publisher health. Failure restores prior isolated source/image/environment where available. A successful deployment is not proof that provider logins, malware scanning or billing were accepted.

Use [service activation](SERVICE_ACTIVATION.md) for the one optional secret and external prerequisites. Admin → Dienste shows configuration booleans, scanner reachability and actual verified inventory without exposing keys. Never print `.env`, OAuth keys, push endpoint credentials or worker authorization headers. Backups containing credentials stay private. Restore rehearsals, off-host backup retention/erasure policies, production alerting and incident runbooks require further operational acceptance.

## Remaining backlog and dependencies

Estimates below are engineering planning ranges in person-days, not committed dates. Work includes integration and QA, and can expand after product/legal decisions.

| Remaining work | Estimate | Dependency |
| --- | --- | --- |
| Production scanner and media/Stories/Highlights acceptance | 2–4 | Separate capacity/private scanner and rights policy |
| Google/Apple real account linking/deletion acceptance | 2–4 | Provider accounts, credentials and test users |
| Phone authentication | 3–6 | SMS provider/account, abuse limits and agreed recovery flow |
| Weather/date/occasion assistant and optional post translation | 4–8 | Verified event/venue facts, provider choice, consent/cost policy |
| Web paid subscriptions, entitlements, invoices, failure/cancellation/refunds | 10–18 | Final prices/benefits/taxes/legal terms and PSP onboarding |
| Paid ad booking/delivery and honest impressions/click measurements | 8–15 | Approved price list, payment and tracking policy |
| Visit proofs and loyalty cards | 5–10 | Agreed proof/misuse/privacy rules |
| Granular admin and branch staff permissions | 5–9 | Approved organization/role matrix and recovery rules |
| Remaining push categories and delivery scale/monitoring | 3–6 | Publishing triggers, consent and volume targets |
| Editorial inventory and licensed media | Ongoing | Real source review, copyright grants and content owner |
| Complete OpenAPI, approved wireframes and all A–I acceptance cases | 4–8 | Remaining implemented contracts and stakeholder acceptance |
| Legal review, vendor ownership, off-host backup/restore and accessibility audit | 5–10 | Operator and qualified reviewers |

No secret alone completes these open items. Native apps and email are excluded as instructed. Follow the remaining backlog rather than treating the existence of a database table or a green CI run as completed product behavior.
