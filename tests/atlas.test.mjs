import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(f)=>readFileSync(f,'utf8');
const map=read('components/Atlas3D.tsx'),home=read('components/AtlasHome.tsx'),page=read('app/page.tsx'),route=read('app/atlas/page.tsx'),css=read('app/atlas.css');
test('3D atlas uses actual MapLibre vector tiles and OpenStreetMap building data',()=>{assert.match(map,/tiles\.openfreemap\.org\/styles\/bright/);assert.match(map,/fill-extrusion/);assert.match(map,/render_height/);assert.match(map,/source-layer':'building'/);assert.match(map,/OpenStreetMap/);});
test('atlas is mounted on real homepage, map tab and deep link',()=>{assert.match(page,/import AtlasHome from/);assert.match(page,/<AtlasHome /);assert.match(page,/<Atlas3D /);assert.match(route,/fetch\('\/api\/places'/);assert.match(home,/onCategory\(c\)/);assert.match(home,/onSearch\(query\.trim\(\)\)/);});
test('interactive camera and layers are implemented',()=>{assert.match(map,/flyTo\(/);assert.match(map,/set3D/);assert.match(map,/setMode/);assert.match(map,/goDistrict/);assert.match(map,/setColorScheme/);});
test('accessible phone layout and no directional arrows',()=>{assert.match(css,/@media\(max-width:480px\)/);assert.match(map,/prefers-reduced-motion/);for(const f of ['components/Atlas3D.tsx','components/AtlasHome.tsx','app/atlas/page.tsx'])assert.doesNotMatch(read(f),/Arrow(?:Right|UpRight|DownRight|Left)|[\u2190-\u21ff]/,f+' has an arrow icon');});
