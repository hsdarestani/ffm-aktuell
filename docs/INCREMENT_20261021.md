# 21 October 2026: default map, complete discovery pages, private saved events

This increment continues PR #48. It is not completion of the full PDF or native app delivery.

## Delivered behavior

1. An ordinary visit opens the map in 3D. Start and Entdecken remain directly accessible. Existing place, tour and account-verification links keep their dedicated behavior.
2. A map load deadline starts before MapLibre or its remote style finishes loading. A stalled vector request gets 18 seconds; fallback raster gets 10 seconds. Unsupported/lost WebGL recovers to the interactive DOM map. Failed GPU maps and temporary capability-probe contexts are released. Retry reinstates 3D intent and creates one map. Manual fallback uses the same recovery state machine.
3. Editorial locations now have real 18-item SQL pagination and a load-more control, independently of OSM pagination. Nearby results sort by distance, then stable tie breakers. Stale or aborted pagination cannot append a previous filter's records to a new search.
4. Mein Profil now exposes the account's saved published upcoming/recent events, with Frankfurt local time, calendar download and removal. The existing account-scoped API supplies the event end time too.
5. The DOM fallback declutters location labels, reserves control space and correctly styles actual node/way/relation OSM identifiers as unverified. Selected visible places remain retained.
6. Calendar files use the registered organizer end time when valid. Unknown/invalid end times retain an explicitly labelled provisional one-hour block. UTC conversion handles German daylight-saving transitions; escaped and UTF-8-folded calendar text conforms to the 75-octet line limit.

## Validation

- 148 tests pass, including executable PostgreSQL/WASM SQL pagination/distance checks, deterministic map deadline tests and calendar date/escaping/folding behavior.
- Production build includes TypeScript validation.
- Real mobile Chromium against the production build tests unsupported WebGL, silent vector/raster network stalls, single-map 3D retry, stale pagination isolation, private event-list display, calendar download and unsaving. API and event fixtures are isolated browser-test data, not production venue content.
- CI now runs the mobile browser suite and retains screenshots as workflow artifacts, alongside the existing disposable PostgreSQL real-HTTP E2E and compose checks.

## Still requires operational work

- Live provider/deployment QA is separate from controlled-network browser tests. No claim that unsupported hardware can render 3D.
- Media needs an operational scanner/storage service; Google/Apple need registered credentials; push needs providers and native permission handling.
- Paid subscriptions, checkout, sponsored delivery and loyalty remain disabled pending real configuration and commercial rules.
- Independent venue/event data verification, licensed media, native apps and the remaining product/technical-brief deliverables are still open.
