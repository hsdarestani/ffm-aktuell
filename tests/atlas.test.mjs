import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(f)=>readFileSync(f,'utf8');
const map=read('components/Atlas3D.tsx'),home=read('components/AtlasHome.tsx'),page=read('app/page.tsx'),route=read('app/atlas/page.tsx'),css=read('app/atlas.css');
test('3D atlas uses actual MapLibre vector tiles and OpenStreetMap building data',()=>{assert.match(map,/tiles\.openfreemap\.org\/styles\/bright/);assert.match(map,/fill-extrusion/);assert.match(map,/render_height/);assert.match(map,/source-layer':'building'/);assert.match(map,/OpenStreetMap/);});
test('home has quick map access and full atlas remains in map tab and deep link',()=>{assert.match(page,/import AtlasHome from/);assert.match(page,/<AtlasHome /);assert.match(page,/useState<Page>\('map'\)/);assert.match(page,/<MapDiscovery /);assert.match(read('components/MapDiscovery.tsx'),/<Atlas3D /);assert.match(route,/fetch\('\/api\/places'/);assert.match(home,/onCategory\(n.id\)/);assert.doesNotMatch(home,/<Atlas3D/);assert.match(home,/onSearch\(query\.trim\(\)\)/);});
test('interactive camera and layers are implemented',()=>{assert.match(map,/flyTo\(/);assert.match(map,/set3D/);assert.match(map,/setMode/);assert.match(map,/goDistrict/);assert.match(map,/setColorScheme/);});
test('pins are rendered in the geographical projection, never moved by DOM transformations',()=>{
 assert.match(map,/POI_SOURCE='ffm-curated-geo'/);
 assert.match(map,/type:'geojson'/);
 assert.match(map,/circle-pitch-alignment':'viewport'/);assert.match(map,/readableMapCandidates/);
 assert.match(map,/queryRenderedFeatures\(e\.point/);
 assert.match(map,/\.setData\(geoFeatures\(filtered\)\)/);
 assert.doesNotMatch(map,/new maplibre\.Marker/);
});
test('cinematic palette and camera reveal',()=>{
 assert.match(map,/requestAnimationFrame/);
 assert.match(map,/map.once\('idle',revealScene\)/);
 assert.match(map,/guard\.ready\(\)/);
 assert.match(map,/duration:2250/);
 assert.match(map,/setColorScheme/);
 assert.match(map,/setLight/);
 assert.match(map,/text-allow-overlap/);
});
test('accessible phone layout and no directional arrows',()=>{assert.match(css,/@media\(max-width:480px\)/);assert.match(map,/prefers-reduced-motion/);for(const f of ['components/Atlas3D.tsx','components/AtlasHome.tsx','app/atlas/page.tsx'])assert.doesNotMatch(read(f),/Arrow(?:Right|UpRight|DownRight|Left)|[\u2190-\u21ff]/,f+' has an arrow icon');});

