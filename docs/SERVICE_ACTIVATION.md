# Service activation, 21 October 2026

The web product remains usable without third-party credentials. Never paste real keys into source code, issues, screenshots, chat or this example file.

## One configuration secret

Publisher's **production** environment accepts `FFM_SERVICES_JSON`, a JSON object whose key names match `.env.example`. Include only the services you want to configure. `scripts/service-config.example.json` contains placeholders, not working credentials. Missing fields preserve the current server configuration. Explicit empty values disable the corresponding setting. The workflow validates the allowlist and writes only the isolated FFM `.env` with mode 0600; it never changes Publisher credentials. Re-run the FFM deploy workflow after changing the secret. No source changes are needed.

Google requires a confidential Web OAuth client and this registered redirect URI:
`https://ffm-aktuell.smarbiz.sbs/api/auth/oauth/google/callback`.
Apple requires a Services ID, Team ID, Key ID and its P8 private key, with return URL:
`https://ffm-aktuell.smarbiz.sbs/api/auth/oauth/apple/callback`.
Provider account registration, domain verification and accepted provider agreements are still operator responsibilities.

OpenAI uses `OPENAI_API_KEY` and optional `OPENAI_RECOMMENDATION_MODEL`. The assistant already limits returned IDs to independently verified local records; a provider failure falls back to editorial matching. No key can compensate for missing verified inventory. The selected model must be enabled for the API project. Enable project budget controls in the provider account.

Email is outside this increment and is not accepted by this configuration script.

## Web Push

No purchased push provider account is required. On first deployment, missing VAPID credentials and a worker token are generated privately on the server. Existing keys are retained on every subsequent deployment. The public application server key is intentionally returned to authenticated browsers; the private key and worker token never are.

Users must activate each device and separately save their desired categories in Profile. All preferences default to false. Devices can be removed individually or together. Removing an account cascades to devices and delivery records. Unsupported browsers receive an explanation instead of a permission prompt. iOS/iPadOS may require installation on the Home Screen.

Implemented deliveries: bookmarked published events in the next hour and newly published news. Consent, bookmark and publication are checked again immediately before sending. Old news is not sent on registration. Failed subscriptions (404/410) are removed. Transient errors retry up to five attempts; notification tags coalesce retries. One scheduler polls every minute, up to 20 deliveries per tick. It uses a PostgreSQL advisory lock to prevent concurrent workers. This suits the initial low-volume deployment; increase worker throughput before a high-volume launch. Push is best effort and cannot guarantee an exact delivery time. `.ics` export remains available independently.

Not yet implemented: offer pushes, followed-business/tip pushes, native APNs/FCM integrations. The user can save offer preferences, but the UI explicitly says that offers are not sent yet.

## Media

`CLAMD_HOST` and `CLAMD_PORT` connect to an isolated ClamAV TCP service. Do not expose the scanner publicly and do not disable scanning. The current shared server lacks sufficient spare RAM for the bundled ClamAV sidecar. A properly resourced private scanner/network is required, in addition to configuration. Uploads stay unavailable until scanner health succeeds.

## Decisions that credentials cannot resolve

Live contractual/tax approval for the editable initial tariff defaults; verified venue data and licensed images; visit proofs and loyalty rules; legal and visual acceptance remain separate work. The PDF's native applications and email are excluded from this increment. This document is not a claim that the whole PDF is finished.

## Validation

Push SQL tests execute the actual schema and delivery queries in PostgreSQL (PGlite), covering opt-in, deduplication, cancellation, rescheduling, unpublished/future/old news and account deletion. Endpoint validation rejects arbitrary request destinations. Production build, TypeScript, existing browser regressions and CI PostgreSQL HTTP tests must pass before deployment. Actual provider delivery needs a user-consented device and cannot be proven with a mock.

References: https://github.com/web-push-libs/web-push and https://developer.mozilla.org/en-US/docs/Web/API/Push_API .

## Web subscriptions and delegated access

Hosted Stripe Checkout, portal changes/cancellation, invoice/credit/refund synchronization, paid entitlements and editable initial tariff decisions are implemented. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the same FFM_SERVICES_JSON object. See [commercial/access decisions and provider acceptance](COMMERCIAL_AND_ACCESS_20261021.md). Live account/tax/contract setup and provider tests remain necessary.
