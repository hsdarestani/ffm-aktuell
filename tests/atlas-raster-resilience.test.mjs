import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('components/Atlas3D.tsx','utf8');
test('Fallback does not require optional MapLibre tile coord, which varies across events',()=>{
 assert.match(source,/e\.tile\|\|e\.coord\|\|e\.isSourceLoaded/);
 assert.match(source,/\['content','idle'\]/);
 assert.doesNotMatch(source,/if\(e\.sourceDataType!=='content'\|\|!e\.coord\)return/);
});
test('Fallback map and real place pins are usable without third-party tile events',()=>{
 assert.match(source,/if\(triedRaster\)\{\s*revealed=true;\s*setReady\(true\)/);
 assert.match(source,/map\.jumpTo\(\{center:CENTER,zoom:14\.35,pitch:0,bearing:0\}\)/);
 assert.match(source,/else if\(rasterFailure&&!rasterTileSeen\)showDOM\(\)/);
 assert.match(source,/addGeoPins\(map\)/);
 assert.match(source,/addCandidatePins\(map\)/);
 assert.match(source,/fetch\('\/api\/discovery-map\?/);
});
test('Map fallback and external OSM link do not invent live operating status',()=>{
 assert.match(source,/source:'raster'|type:'raster'/);
 assert.match(source,/www\.openstreetmap\.org\/\#map=/);
 assert.match(source,/Ungeprüft/);
});

