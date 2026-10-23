# Assisted discovery increment (2026-10-19)

- Location permission is requested only after tapping the 3 km filter; coordinates are never stored in the user profile.
- Verified recommendations are limited to real published venues independently checked within 30 days. Optional server-side OpenAI only reorders approved IDs; fallback is deterministic and never fabricates availability.
- Curated tour themes are generated solely from verified places with real coordinates. Empty state is honest when there are no approved places.
- DE/EN switch is introduced; a complete translation audit is still required.
- Current production has zero independently verified operating places. Do not mass-mark OSM entries as checked. Complete source verification and browser/device QA before launch.
- Map tile reliability, full media/Stories/rights workflow and OAuth app credentials remain separate release gates.
