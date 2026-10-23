import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const atlas=readFileSync('components/Atlas3D.tsx','utf8');
const fallback=readFileSync('components/Atlas2DFallback.tsx','utf8');
const css=readFileSync('app/atlas-dom-fallback.css','utf8');
test('Failed raster gets its own non-WebGL map instead of a blank WebGL canvas',()=>{
 assert.match(atlas,/setDomFallback\(true\)/);
 assert.match(atlas,/<Atlas2DFallback/);
 assert.match(atlas,/!domFallback&&!ready&&!error/);
 assert.match(atlas,/setDomFallback\(true\);setReady\(true\);setError\(false\)/);
 assert.match(css,/\.atlas-2d-native\{position:absolute;inset:0;z-index:1/);
});
test('2D fallback maps actual coordinates into places and offers interactive pan zoom',()=>{
 assert.match(fallback,/Math\.log\(\(1\+sin\)\/\(1-sin\)\)/);
 assert.match(fallback,/Math\.atan\(Math\.sinh\(n\)\)/);
 assert.match(fallback,/\/api\/discovery-map\?/);
 assert.match(fallback,/onPointerMove/);
 assert.match(fallback,/onClick=\{e=>\{e\.stopPropagation\(\);onPick\(place\)\}\}/);
 assert.match(fallback,/setZoom\(z=>clamp/);
 assert.match(fallback,/Ortskoordinaten: OpenStreetMap/);
 assert.match(fallback,/tile\.openstreetmap\.org/);
});
test('Never claim map tiles work when no image loaded',()=>{
 assert.match(fallback,/loaded>0\?/);
 assert.match(fallback,/setTileMissing\(true\)/);
 assert.match(fallback,/Straßenkarten derzeit nicht erreichbar/);
 assert.match(fallback,/In OpenStreetMap öffnen/);
});

