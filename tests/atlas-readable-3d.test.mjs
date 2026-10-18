import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const atlas=read('components/Atlas3D.tsx'),css=read('app/atlas-readable.css'),layout=read('app/layout.tsx');
test('3D stays enabled by default, with a more legible city perspective',()=>{
 assert.match(atlas,/\[is3D,set3D\]=useState\(true\)/);
 assert.match(atlas,/const CITY_PITCH=44/);
 assert.match(atlas,/pitch:CITY_PITCH/);
 assert.match(atlas,/pitch:is3D\?CITY_PITCH:0/);
 assert.match(atlas,/ffm-architecture/);
 assert.match(atlas,/addCitywideLod2Layer\(map\)/);
});
test('raw map data is rendered as sparse categorical pins rather than dozens of counted bubbles',()=>{
 assert.match(atlas,/function readableMapCandidates/);
 assert.match(atlas,/const spacing=narrow\?118:132/);
 assert.match(atlas,/const max=narrow\?9:15/);
 assert.match(atlas,/readableMapCandidates\(items,map,selected\)/);
 assert.match(atlas,/readableMapCandidates\(latestCandidates\.current,map,selected\)/);
 assert.match(atlas,/short:categoryLetter\(p.category\)/);
 assert.match(atlas,/tone:categoryColor\(p.category\)/);
 assert.match(atlas,/id:'ffm-osm-letters'/);
 assert.doesNotMatch(atlas,/cluster:true|point_count_abbreviated|id:'ffm-osm-clusters'/);
 assert.match(atlas,/latestCandidates.current=items/);
});
test('map controls and selected place do not cover the phone screen',()=>{
 assert.match(atlas,/\['Alle','Cafés','Restaurants','Bars'\]/);
 assert.match(atlas,/atlas-map-more-cats/);
 assert.match(atlas,/atlas-selection-cta/);
 assert.match(atlas,/atlas-district-toggle/);
 assert.match(css,/max-height:126px/);
 assert.match(css,/min-height:56px/);
 assert.match(css,/@media\(max-width:385px\)/);
 assert.match(layout,/atlas-readable\.css/);
});
test('source transparency and non-verified operations remain truthful',()=>{
 assert.match(atlas,/selectedIsOSM\?'Ungeprüft'/);
 assert.match(atlas,/OSM ansehen/);
 assert.match(atlas,/openstreetmap\.org/);
 assert.match(atlas,/t.credit/);
 assert.match(atlas,/addCandidatePins\(map\)/);
});
