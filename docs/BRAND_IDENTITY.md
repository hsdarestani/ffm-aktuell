# FFM Aktuell — Quiet City (visual system v2)

## Positioning
A useful and confident Frankfurt city guide. Editorial, local and inviting without looking like a tourist agency, nightlife flyer or generic SaaS dashboard.

Brand phrase: **Frankfurt. Immer wieder neu.**

## Principles
- Clarity first: purposeful whitespace, legible text sizes, clear hierarchy, direct primary actions.
- Local character: city-specific photography and accurate local records; no stock representations of individual places.
- Restrained palette: nearly-white #F8F8F5, forest ink #26342E, neutral grey-green #626E66 and a single muted clay accent #AB6050.
- Type: DM Sans for all interface content; Instrument Serif for a selective poetic emphasis, never forced onto buttons or forms.
- Reduce noise: no autoplay media, hero animations, decorative city maps, neon, huge serial numbers, outline headings, faux live counters or invented badges.
- Functional discovery: homepage search goes to the real database-backed listings filter; category links and featured places open existing working views.
- Robust mobile design: 360px and up, readable text, 44px minimum touch targets for primary controls, no horizontal overflow, clear map/search navigation.

## Photography
Both images are **real photographs of Frankfurt am Main**, by their named authors, used under the Unsplash License.

- Hero, a city street with tall buildings by **Leonhard Niederwimmer**: https://unsplash.com/photos/a-city-street-with-tall-buildings-0Cor_Y24BdM
- Editorial second image, pedestrian street and high-rises by **Leon Seibert**: https://unsplash.com/photos/people-walking-on-pedestrian-lane-near-high-rise-buildings-during-daytime-3FiG6P7lWAs
- Both images are displayed as city atmosphere, not as photographs of an unrelated venue or as proof of the listing's accuracy.
- Provider data/images should be licensed and verified before adding location-specific imagery.
- Image hosting uses Unsplash CDN; cache/privacy suitability must be reviewed before general production release.

## Implementation
- `components/MinimalHome.tsx`: redesigned landing with editorial hero, working search, categories, verified place summaries, journal and community/B2B links.
- `app/brand.css`: compact consistent visual layer loaded after the original functional styles.
- `app/page.tsx`: existing state, API calls, auth, community and admin stay intact.
- `app/brand-lab/page.tsx`: old concept gallery redirects back home.
- `public/icon.svg`, `public/ffm-wordmark.svg`, site metadata and PWA colors now follow the restrained mark.

This is a designed implementation, not a formally approved identity. Test actual user flows and get stakeholder approval before declaring brand final.
