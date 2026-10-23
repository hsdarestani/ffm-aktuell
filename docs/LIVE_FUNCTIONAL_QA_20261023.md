# Live functional QA corrections, 23 October 2026

Based on the deployed City Experience branch, not the older main branch.

- Detail maps now render OpenStreetMap raster tiles with an anchored marker and zoom controls, without requiring WebGL. External navigation remains available when tiles fail.
- Events previous-month navigation keeps the displayed month and selected day together. Canonical Berlin date formatting does not depend on locale punctuation/order.
- Events and guides have bounded requests, retry controls and translated loading/error states. Lazy sections have an explicit loading state.
- Matcher has a request deadline and does not retain a German server notice after changing to English.
- Event/guide labels and headings have English equivalents. Tab navigation returns to the top.
- Map mode responds to event-calendar navigation; late pagination results cannot populate another query.
- Independent initial loads retain successful content when another endpoint fails.

Validation: calendar regression tests plus the existing unit/database suite; TypeScript and production build; CI desktop/mobile fixture tests and PostgreSQL HTTP acceptance. Fixture success does not certify live providers or production customer workflows.

Content and operational limits remain explicit: no automatic OSM verification, fake guides/events, simulated subscriptions, malware-scan bypass or invented venue attributes. Verified suggestions need actual editorial evidence. Media uploads need a healthy private scanner. OAuth, SMS, payments and device push require their real provider setup and acceptance. These are not converted into successful features by an API key or empty-state UI.
