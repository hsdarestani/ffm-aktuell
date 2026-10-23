import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const atlas=readFileSync('components/Atlas3D.tsx','utf8');
test('vector tile errors have recoverable map fallback with OSM pins',()=>{
 assert.match(atlas,/baseTileErrors/);
 assert.match(atlas,/map\.setStyle\(fallbackRaster\)/);
 assert.match(atlas,/try\{addGeoPins\(map\);\}/);
 assert.match(atlas,/try\{addCandidatePins\(map\);\}/);
 assert.doesNotMatch(atlas,/if\(!ready\|\|fallback\|\|!map\|\|!map\.getSource\(OSM_SOURCE\)\)/);
 assert.match(atlas,/Einfache Karte laden/);
});
