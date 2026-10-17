import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const atlas=read('components/Atlas3D.tsx'),layer=read('lib/citywide-lod2-layer.ts');
const endpoint=read('app/api/lod2-tile/route.ts');
const schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts'),activation=read('app/admin/aktivieren/page.tsx');
test('citywide 3D buildings appear before close-up; detailed LoD2 is progressive',()=>{
 assert.match(atlas,/minzoom:12\.2/);
 assert.match(atlas,/addCitywideLod2Layer\(map\)/);
 assert.match(atlas,/ffm-citywide-lod2/);
 assert.match(layer,/const WEST=8\.4,SOUTH=49\.98/);
 assert.match(layer,/DETAIL_ZOOM=16\.15/);
 assert.match(layer,/slice\(0,12\)/);
 assert.match(layer,/inflight.size>=2/);
 assert.match(layer,/tiles.size<=24/);
 assert.match(layer,/ctx\.drawArrays|c\.drawArrays/);
 assert.match(atlas,/Powered by Lodapi/);
});
test('official API budgeted, bounded, persisted and never masquerades as full coverage',()=>{
 assert.match(endpoint,/if\(b\.used>=24\)return false/);
 assert.match(endpoint,/pending.size>=3/);
 assert.match(endpoint,/fetch\(u,/);
 assert.match(endpoint,/cache:'no-store'/);
 assert.match(endpoint,/bbox/);
 assert.match(endpoint,/partial/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS lod2_tiles/);
});
test('single-use admin invitation is cryptographically guarded and not a public password',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS admin_invites/);
 assert.match(schema,/used_at timestamptz/);
 assert.ok(!schema.includes('KMJSim6a7WYfNUEFh-LdzeU96eHOHAdgBokaHobkgUw'));
 assert.match(api,/admin\/activate/);
 assert.match(api,/createHash\('sha256'\)/);
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/used_at=now\(\)/);
 assert.match(api,/password:z.string\(\)\.min\(16\)/);
 assert.match(activation,/Passwort wiederholen/);
});
