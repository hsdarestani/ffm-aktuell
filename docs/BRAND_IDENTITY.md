# FFM Aktuell — Visual identity system

## Design position
**SIGNAL / 069** is the implemented main site direction. FFM Aktuell is a live city frequency: a bridge between editorial culture, street-level discovery and the pace of Frankfurt. It must look neither like a tourist directory nor a stock SaaS template.

Brand promise (German): **Die Stadt ist nicht still.**
Personality: informed, lively, confident, local, practical, expressive, inclusive.
Name stays FFM Aktuell; trademark and customer approval are still pending.

## Three visual directions
The interactive previews are available at **/brand-lab** with mobile/desktop control and shareable links:

1. **SIGNAL / 069**: metropolitan wayfinding, rail-map diagrams, orange field, graphite city black, bold condensed display. Current homepage.
2. **NACHTSCHICHT**: urban nightlife, violet after-dark atmosphere, acid lime highlight, rhythmic graphic language.
3. **STADTARCHIV**: cultural editorial publishing, cream paper, ultramarine and archival golden yellow, expressive high-contrast serif.

The preview prototypes are intentionally non-transactional. The actual product functionality (real approved places, auth, maps, moderation, B2B) is preserved on the main site. Only SIGNAL / 069 is implemented as the full homepage and applied system-wide.

## Core tokens — Signal 069
- Signal orange: `#FF5B35`, active direction, signal, CTAs, hero emphasis.
- Asphalt black: `#17191B`, editorial dark surfaces, text and grid.
- Paper ivory: `#F3F0E8`, reading surface.
- Neutral stone: `#D9D8D0`, quieter editorial blocks.
- Directional lavender and sage are reserved for exploration graphics and location illustrations.

Type: Barlow Condensed ExtraBold / Black for campaign headlines; Syne Bold for editorial cards and titles; Space Grotesk for UI content; DM Mono for coordinates, eyebrow labels and editorial numbering. Instrument Serif appears only in the Stadtarchiv prototype.

## Identity motifs
- **069:** Frankfurt telephone prefix; uniquely local stamp used in huge numerals and navigation rails.
- **Signal route:** a city-network diagram deliberately stylized and not represented as an accurate navigational map.
- **Node + pulse:** local stories, places and events as nodes, with a real-time visual pulse (not a false claim of real-time updates).
- **Square controls and angular arrows:** rooted in civic wayfinding, not rounded generic mobile-SaaS cards.
- **Editorial serials:** 01/02/03, district labels, issue numbers, microcoordinates. Distinguish actual location records from visual decorations.

## Design and content integrity
- No invented opening hours, live crowd counts, event availability, ratings or user reviews.
- Graphic location illustrations are abstract placeholders, **not photos of listed venues**.
- Properly licensed, source-verified photography can be introduced later into the reusable image field.
- Responsive design targets 360/390/768/1280+ viewports, respects reduced-motion preferences.
- Do not copy a Frankfurt municipality visual trademark or suggest an official city affiliation.

## Operations and implementation
- CSS overrides in `app/brand.css` are loaded after legacy `app/globals.css` for backwards compatibility.
- New modular live homepage: `components/SignalHome.tsx`.
- Showcase: `app/brand-lab/page.tsx`.
- Identity assets: `public/icon.svg` and `public/ffm-wordmark.svg`.
- The rest of the app's live flows are unchanged; quality assurance should include registration, submission, place detail, mobile map, bilingual navigation and admin review.
