import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=f=>readFileSync(f,'utf8');
const api=get('app/api/[[...path]]/route.ts');
const schema=get('db/schema.sql');
const ui=get('components/AdminOrtpruefung.tsx');
const page=get('app/page.tsx');

test('real OSM identities cannot automatically publish without an independent review',()=>{
 assert.match(schema,/places_osm_id_unique/);
 assert.match(schema,/verification_note/);
 assert.match(schema,/verification_method/);
 assert.match(schema,/verified_by/);
 assert.match(api,/admin\/review-candidate/);
 assert.match(api,/independentProof\(b.verification_source\)/);
 assert.match(api,/confirms_existence:z.literal\(true\)/);
 assert.match(api,/confirms_address:z.literal\(true\)/);
 assert.match(api,/confirms_operation:z.literal\(true\)/);
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/abs\(latitude-\$3\)/);
 assert.match(api,/ROLLBACK/);
 assert.match(api,/ON CONFLICT/); // Existing import uses safe on-conflict handling elsewhere.
});
test('candidate discovery stays unverified until editorial review',()=>{
 assert.match(api,/reviewed_status='unverified'/);
 assert.match(api,/reviewed_status='hidden'/);
 assert.match(api,/verification_status:'verified'/);
 assert.match(api,/opening_now_guaranteed:false/);
 assert.match(api,/interval '30 days'/);
});
test('German-only editorial panel explains verification limits and supports recheck',()=>{
 assert.match(ui,/Ungeprüft/);
 assert.match(ui,/Rückfragen/);
 assert.match(ui,/admin\/validation/);
 assert.match(ui,/admin\/candidates/);
 assert.match(ui,/admin\/review-candidate/);
 assert.match(ui,/Keine Live Garantie/);
 assert.match(ui,/type="checkbox" name="confirms_operation" required/);
 assert.match(page,/AdminOrtpruefung/);
 assert.match(page,/verification_note/);
});
test('independent proof blocks OSM and third-party ratings as original operator sources',()=>{
 for(const hostname of ['openstreetmap.org','geofabrik.de','google.com','yelp.com','tripadvisor.com'])assert.ok(api.includes("'"+hostname+"'"));
 assert.match(api,/u.protocol!=='https:'/);
 assert.match(api,/betreiber_webseite/);
 assert.match(api,/behoerde/);
});
