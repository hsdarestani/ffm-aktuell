# City Experience Release — 23 October 2026

Scope: **FFM Aktuell web/PWA only**. No Android/iOS native client. No fake sources, rights or confirmed opening claims.

## Completed source changes

| Journey | Feature | Evidence and rules |
| --- | --- | --- |
| Matcher | Category + 3 choices, optional weather and consented AI ordering | Filters source-backed, independently checked currently operating venues; uses existing provider quotas and falls back deterministically |
| Events | Day/week/month date selection, category counts, prices/time, saves and .ics | Only published records; night events starting before 05:00 associate with previous nightlife evening |
| Map | Place/event switch, search and scrolling bottom sheet | Only explicitly linked currently independently verified venue coordinates give event pins; other events stay list-only |
| Guides | Editorial Guide:* articles, filtered search and readable article detail | Source HTTPS required; licensed image optional only with documented rights; generic news is never auto-promoted |
| Newly opened | Homepage cards for substantiated openings | Actual opening date last 90 days, URL source, separate current independent venue verification required |
| Providers | Admin → Dienste → live checks | Explicit operations-only endpoint probes OpenAI model access and OpenWeather forecast. Keys never shown. |

New additive database fields: events.place_id; news.image_url, news.image_rights_note; places.opened_at, places.opening_source_url. Apply the idempotent schema migration before enabling this web release.

## Acceptance checks

1. Confirm five primary mobile tabs on 390px without horizontal overflow; Matcher back/forward and category selection work.
2. Matcher returns at most three *verified* results within the selected category and is honest about empty inventory. Try without AI, with separately consented AI, and with weather turned on/off.
3. Test event day/month controls across month edges, category chips, real prices, Europe/Berlin time, bookmarks and .ics.
4. Check a nightclub entry after midnight before 05:00 maps to previous evening; ordinary daytime events do not.
5. Switch Places / Events on the map; verify OSM discovery points are hidden in event mode and only currently verified linked events get exact pins.
6. Publish a sourced Guide:Café as editor and verify filter/detail; normal news remains outside Guides. Reject a photo without a 30+-character rights statement.
7. Record an opening date for a verified published venue with HTTPS proof and an audit note; verify only real dated openings in the last 90 days display.
8. Probe providers as operations admin. Independent status for each may be ready, unavailable, unauthorized or missing. No credentials in API responses.
9. Run TypeScript, production build, accessible browser regressions, PostgreSQL HTTP tests and FFM-only health/rollback checks.

## External editorial and provider prerequisites

Real researched articles, photography rights, independently verified venues, current venue attributes, event-place linking and opening-date evidence cannot be generated responsibly by a UI change or API secret. Provider keys must reach the private FFM production environment via Publisher FFM_SERVICES_JSON; configured means present, not successful live calls. Live acceptance must be checked after release.
