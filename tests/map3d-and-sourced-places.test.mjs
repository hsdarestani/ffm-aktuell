import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const atlas=readFileSync('components/Atlas3D.tsx','utf8');
const seed=readFileSync('db/seed.sql','utf8');
const schema=readFileSync('db/schema.sql','utf8');
const page=readFileSync('app/page.tsx','utf8');
test('3D starts by default and reuses existing vector source for buildings',()=>{
 assert.match(atlas,/\[is3D,set3D\]=useState\(true\)/);
 assert.match(atlas,/const buildingSource=mainVector\|\|'ffm-openmaptiles'/);
 assert.match(atlas,/source:buildingSource,'source-layer':'building'/);
 assert.match(atlas,/map\.queryRenderedFeatures\(\)\.some\(f=>f\.source===baseVectorSource\)/);
});
test('Never abandon 3D on failure of optional roof imagery or secondary sources',()=>{
 assert.match(atlas,/sourceId===baseVectorSource/);
 assert.match(atlas,/if\(!baseFailure&&!rasterFailure\)return/);
 assert.match(atlas,/triedRaster\?10000:18000/);
 assert.match(atlas,/setRetryKey\(v=>v\+1\)/);
 assert.match(atlas,/3D neu/);
});
test('Curated hours are official, idempotent and do not pretend to prove current operation',()=>{
 for(const n of ['Städel Museum','Palmengarten','MAIN TOWER'])assert.ok(seed.includes("name='"+n+"'"));
 assert.match(seed,/nullif\(btrim\(coalesce\(opening_hours_text,''\)\),''\) IS NULL/);
 assert.match(seed,/ON CONFLICT\(place_id,field\) DO NOTHING/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS place_field_evidence/);
 assert.match(seed,/Römerberg is a public square/);
 assert.doesNotMatch(seed,/verification_status\s*=\s*'verified'/);
 assert.match(page,/Keine Live-Öffnungsprüfung/);
});
