# FFM Aktuell — MAINLINIE identity v3

## Position
**FFM Aktuell: Frankfurt von innen.** Editorial city discovery with a custom, quiet visual signature. The brand's connective element is the River Main: a single hand-composed flowing line with two anchor points. It refers to the city's continuous connections between neighborhoods, people and activities; it is **not** a navigational arrow and does not claim to be a street map.

## Brand system
- **Mainlinie:** recurring flowing line, two nodes and restrained use of warm mineral color. Appears in the wordmark, masthead divider, editorial interlude and footer.
- **Typography:** DM Sans 400–700 for clear functional text; Instrument Serif sparingly for editorial headlines. Avoid display-heavy giant slab headings.
- **Palette:** warm paper `#F6F5F1`, dark mineral `#292D2B`, muted wine `#735E63`, softly weathered sage `#A7AFA5`, fine-line grey `#DEDFD7`.
- **Composition:** asymmetric editorial masthead + real city river photograph; precise number labels, place rows, 4-column taxonomy board, generous negative space. No fake 'live' indicators or dated opening hours.
- **Microinteractions:** neutral circular point / plus within a circle; button text labels remain understandable. **No directional arrow icons on any route, cards, buttons, navigation, empty states or dialogs.**
- **Mobile:** route-first discovery, 44px+ primary actions, mobile-safe editorial masthead, no horizontal scrolling except intentional category scrollers in legacy catalog.

## Live application architecture
`components/MinimalHome.tsx` implements a fully composed production homepage with working callbacks for search, place detail, categories, map, editorial, community and business. `app/page.tsx` retains the existing API-powered content, auth, moderation and management flows, while removing old directional iconography across all views. `app/brand.css` contains the identity system loaded after baseline functional CSS. Custom SVG mark and wordmark are in `public`.

## Photographic sources
Both city atmosphere photos are from Unsplash and are not represented as photos of a specific listed venue:
- Hero — **Frankfurt Riverfront Skyline**, cargo boat and historic Main crossing. Unsplash: https://unsplash.com/photos/modern-skyscrapers-and-historic-buildings-on-riverbank-FSXkHIny_Fg ; image id `photo-1775127493662-2e0fb1138b9c`.
- Interlude — **Frankfurt Street Crossing**, Leonhard Niederwimmer. Unsplash: https://unsplash.com/photos/a-city-street-with-tall-buildings-0Cor_Y24BdM ; image id `photo-1661503847943-c6bb6a0101aa`.

Images are city atmospheres used under Unsplash's published license. For long-term production, consider hosting licensed, optimized images on first-party assets and recording appropriate author attribution.

## Caveats
Brand requires client approval. Platform release scope remains incomplete per `docs/ROADMAP.md`; visual refinement does not imply publication of unverified places, ratings, offers, hours or events. Account deletion, GDPR/DSA policies, billing and native clients remain separate workstreams.
