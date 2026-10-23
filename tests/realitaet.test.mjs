import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const read=p=>readFileSync(p,'utf8');
const c=read('lib/ortskategorien.ts'),atlas=read('components/Atlas3D.tsx'),page=read('app/page.tsx'),schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts');
test('all requested category families are present',()=>{
 for(const name of ['Cafés','Bars','Clubs','Shisha Bars','Restaurants','Imbiss','Museen','Fußball','Padel','Laufgruppen','Spaziergruppen','Lesegruppen'])
  assert.ok(c.includes("id:'"+name+"'"),name);
 assert.match(page,/passendeRubrik/);
 assert.match(atlas,/KATEGORIEN/);
});
test('real operating verification is fresh, attributed and only editor-confirmed',()=>{
 assert.match(c,/verification_status!=='verified'/);
 assert.match(c,/activity_status!=='operating'/);
 assert.match(c,/30\*86400000/);
 assert.match(c,/ort\.demo/);
 assert.match(page,/Nur aktuell geprüfte Betriebe/);
 assert.match(schema,/verification_source/);
 assert.match(schema,/verified_at/);
 assert.match(api,/admin\/verify-place/);
 assert.match(api,/const u=admin\(user\)/);
 assert.match(api,/verification_source:z\.url\(\)/);
 assert.match(api,/admin\/dispute-place/);
 assert.match(api,/interval '30 days'/);
});
test('licensed Hessian orthophoto exists as optional base mode',()=>{
 assert.match(atlas,/ogc-free-images\.ows/);
 assert.match(atlas,/he_dop_rgb/);
 assert.match(atlas,/bbox-epsg-3857/);
 assert.match(atlas,/ffm-luftbild/);
 assert.match(atlas,/dl-zero-de\/2\.0/);
 assert.match(atlas,/Luftbild/);
 assert.match(atlas,/OpenStreetMap/);
});
test('real map pins are still geographic, never demo contents',()=>{
 assert.match(atlas,/type:'geojson'/);
 assert.match(atlas,/geoFeatures\(filtered\)/);
 assert.match(page,/<MapDiscovery lang=\{lang\} places=\{places\}/);assert.match(read('components/MapDiscovery.tsx'),/places=\{pins\}/);
});
test('activity groups are labelled as previews',()=>{
 assert.match(page,/vorschauGruppen/);
 assert.match(page,/MUSTERGRUPPE/);
});
test('OSM collector excludes disused and vacant shops and never writes to DB',async()=>{
 const m=await import(pathToFileURL(process.cwd()+'/scripts/osm-kandidaten.mjs').href);
 assert.equal(m.isClearlyClosed({shop:'vacant'}),true);
 assert.equal(m.isClearlyClosed({'disused:shop':'cafe'}),true);
 assert.equal(m.isClearlyClosed({opening_hours:'closed'}),true);
 const data=m.candidatesFromOSM([{type:'node',id:1,lat:50.11,lon:8.68,tags:{name:'Beispiel Café',amenity:'cafe'}},{type:'node',id:2,lat:50.12,lon:8.70,tags:{name:'Nicht aktiv',shop:'vacant'}}]);
 assert.equal(data.length,1);
 assert.equal(data[0].verification_status,'unverified');
 assert.equal(data[0].activity_status,'unknown');
 assert.ok(!read('scripts/osm-kandidaten.mjs').includes('INSERT INTO places'));
});
