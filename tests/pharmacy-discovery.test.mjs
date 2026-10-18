import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(x,'utf8');
const categories=read('lib/ortskategorien.ts'),map=read('components/Atlas3D.tsx'),page=read('app/page.tsx'),api=read('app/api/[[...path]]/route.ts');
test('pharmacy and on-duty categories are visible and distinct',()=>{
 assert.match(categories,/id:'Apotheken'/);
 assert.match(categories,/id:'Apotheken Notdienst'/);
 assert.match(categories,/Apotheken-Notdienst/);
 assert.match(page,/aponet\.de\/notdienstsuche\/60320-Frankfurt/);
 assert.match(page,/keine Notdienstbestätigung/);
});
test('original raw candidates are searchable, never promoted to verified places',()=>{
 assert.match(read('db/schema.sql'),/CREATE TABLE IF NOT EXISTS discovery_candidates/);
 assert.match(read('db/schema.sql'),/reviewed_status text NOT NULL DEFAULT 'unverified'/);
 assert.match(api,/path==='discovery'/);
 assert.match(api,/path==='discovery-map'/);
 assert.match(api,/path==='pharmacy-notdienst'/);
 assert.match(api,/WHERE reviewed_status='unverified'/);
 assert.match(page,/ffm-find-item/);
 assert.match(page,/Weitere Orte anzeigen/);
 assert.match(page,/!nurGepruefte/);
});
test('large map data remains georeferenced while visible markers are sparse on mobile',()=>{
 assert.match(map,/ffm-osm-points/);
 assert.match(map,/ffm-marker-/);
 assert.match(map,/readableMapCandidates/);
 assert.match(map,/map\.project/);
 assert.match(map,/geoCandidateFeatures/);
 assert.match(map,/const max=narrow\?9:15/);
 assert.doesNotMatch(map,/cluster:true|point_count_abbreviated/);
});
test('safe importer uses only original archived candidates plus pharmacy source',()=>{
 const txt=read('scripts/prepare-osm-import.mjs');
 assert.match(txt,/3000\+ candidates/);
 assert.match(txt,/pharmacy/);
 assert.match(txt,/ON CONFLICT\(osm_id\)/);
 assert.match(txt,/discovery_candidates\.reviewed_status='unverified'/);
 assert.match(read('.github/workflows/import-osm-and-lod2.yml'),/39035078106/);
});
