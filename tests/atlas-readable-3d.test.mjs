import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readUiSource(p);
const atlas=read('components/Atlas3D.tsx'),css=read('app/atlas-readable.css'),layout=read('app/layout.tsx');
test('3D stays enabled by default, with a more legible city perspective',()=>{
 assert.match(atlas,/\[is3D,set3D\]=useState\(true\)/);
 assert.match(atlas,/const CITY_PITCH=37/);
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
 assert.match(atlas,/icon:'ffm-marker-'\+markerIcon\(p.category\)/);
 assert.match(atlas,/addMarkerSprites/);
 assert.match(atlas,/id:'ffm-osm-points'/);
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
 assert.match(atlas,/>Details</);
 assert.match(atlas,/selectedIsOSM\?'Ungeprüft'/);
 assert.match(atlas,/HLBG|Hessische/);
 assert.match(atlas,/addCandidatePins\(map\)/);
});

test('category pin artwork is understandable without cryptic one-letter glyphs',()=>{
 for(const icon of ['coffee','food','bar','pharmacy','museum','pin']){
  assert.match(atlas,new RegExp("'"+icon+"'"));
 }
 assert.match(atlas,/function createMapIcon/);
 assert.match(atlas,/map\.addImage\(id,createMapIcon\(icon\)/);
 assert.match(atlas,/'icon-image':\['get','icon'\]/);
 assert.doesNotMatch(atlas,/categoryLetter\(/);
 assert.doesNotMatch(atlas,/ffm-osm-letters/);
});
test('street detail stays visible and selected venues show useful address',()=>{
 assert.match(atlas,/center:CENTER,zoom:14\.35,pitch:CITY_PITCH/);
 assert.match(atlas,/selectedPlace\.address&&<small/);
});

