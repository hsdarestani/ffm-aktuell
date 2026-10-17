# Frankfurt Living Atlas 3D — October 17 2026

## Product
Mobile-first interactive city discovery. This is an actual WebGL map of Frankfurt, not a video, generated illustration or mockup. The new application homepage mounts `Atlas3D`; the existing Map tab mounts the full-screen variant. A shareable, public `/atlas` route also mounts the same component, loads published places from `/api/places`, and provides a place detail sheet.

## Data, accuracy, licenses
- Basemap: **OpenFreeMap Bright vector style** (`https://tiles.openfreemap.org/styles/bright`), open-source vector hosting, OpenMapTiles + OpenStreetMap data. See https://openfreemap.org/ and https://github.com/hyperknot/openfreemap.
- 3D geometry: MapLibre GL JS `fill-extrusion` on the actual OpenMapTiles `building` vector layer. Rendered height/min height come from the underlying data when available. A neutral fallback height is used when missing. 3D geometry **is not photogrammetry** and does not include photoreal facade textures or exact building models.
- Visually expressive palettes: Daylight and Evening. Evening is a UI color grade, **not** real-time lighting, sunset calculations or actual weather.
- Attribution is retained in the map and editorial notes; don't hide OSM/OpenMapTiles/OpenFreeMap attribution.
- User-visible markers are only actual published DB records with plausible Frankfurt coordinates; no fake restaurants, reviews or availability. District camera targets are approximate neighborhood centers, not administrative polygons or exact addresses.
- A fallback to standard OSM raster street tiles exists only if the vector basemap fails. At scale, ensure tile provider use is appropriate, migrate raster fallback to licensed infrastructure and consider self-hosting OpenFreeMap.
- Third-party map tile and photo requests contact provider servers; the German GDPR/privacy statement must disclose them before full production release. No precise location permission is requested here.

## Functional flows
- Pan/rotate/zoom with native MapLibre interactions, 3D to 2D, manual Day/Evening grade toggle, named neighborhood fly-to, Zoom+ Zoom- and city-reset controls.
- Category filtering, verified DB pins, selected-place bottom sheet, click-through to the existing place details in the SPA.
- Deep-linked `/atlas` route, standalone selected place drawer with actual addresses and external website/source when present.
- User-facing UI avoids directional-arrow icons entirely (global brand preference).
- Desktop and mobile layouts, touch controls, reduced-motion support, display/screenreader labels.
- Graceful fallback on missing WebGL or vector tiles.

## Tech & future fidelity
- Source: `components/Atlas3D.tsx`. Home: `components/AtlasHome.tsx`. Route: `app/atlas/page.tsx`. Styles: `app/atlas.css`.
- The already-installed MapLibre GL JS 5 is dynamically imported client-side.
- For genuine photo-textured 3D city meshes (Google Photorealistic 3D Tiles or official municipal LoD2/LoD3 data), a separate licensed data source, compatible renderer, API/key management and GPU budget are required. **No photorealism or complete height coverage is claimed by this release.**
- Before launch: mobile real-device QA, CDN availability/error telemetry, large-city load test, OSM/DEM licensing review, privacy audit, accessible keyboard alternative to map-only discovery and route optimization.
