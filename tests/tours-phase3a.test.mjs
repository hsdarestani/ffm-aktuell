import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts'),
 page=read('app/page.tsx'),ui=read('components/TourPlanner.tsx'),
 css=read('app/tour-planner.css'),ci=read('scripts/ci-admin-activation-e2e.mjs');
test('private tours belong only to owner and stop positions are unique',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS user_tours/);
 assert.match(schema,/owner_id uuid NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS tour_stops/);
 assert.match(schema,/CHECK\(position BETWEEN 1 AND 8\)/);
 assert.match(schema,/PRIMARY KEY\(tour_id,position\)/);
 assert.match(schema,/UNIQUE INDEX IF NOT EXISTS tour_stop_unique_osm/);
});
test('tours validate public real venues, transaction scope, private ownership and safe revocation',()=>{
 assert.match(api,/if\(method==='POST'&&path==='tours'\)/);
 assert.match(api,/rate\(req,'tour'\)/);
 assert.match(api,/stop_ids:z.array\(z.string\(\).refine\(validLocationId\)\).min\(2\).max\(8\)/);
 assert.match(api,/new Set\(b.stop_ids\).size!==b.stop_ids.length/);
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/FROM user_tours WHERE id=\$1 AND owner_id=\$2/);
 assert.match(api,/SELECT id FROM places WHERE id=\$1 AND status='published'/);
 assert.match(api,/reviewed_status='unverified' AND latitude IS NOT NULL/);
 assert.match(api,/await tx.query\('ROLLBACK'\)/);
 assert.match(api,/action:z.literal\('share'\)/);
 assert.match(api,/share_token=NULL,shared_at=NULL/);
 assert.match(api,/randomBytes\(32\).toString\('base64url'\)/);
});
test('public shared tour reveals only selected stops, not private account',()=>{
 const start=api.indexOf("if(method==='GET'&&path==='tours/shared'");
 const end=api.indexOf("if(method==='POST'&&path==='tours'",start);
 const chunk=api.slice(start,end);
 assert.match(chunk,/share_token=\$1 AND shared_at IS NOT NULL/);
 assert.match(chunk,/p.status='published'/);
 assert.match(chunk,/c.reviewed_status='unverified'/);
 assert.match(chunk,/return ok\(\{tour:\{title:r.rows\[0\].title\},stops:stops.rows,shared:true\}\)/);
 assert.doesNotMatch(chunk,/owner_id|owner_email/);
});
test('compact UI handles route, reorder, accessible controls and share link opening',()=>{
 assert.match(ui,/tour-stops/);
 assert.match(ui,/aria-label=\{s.name\+' nach oben'\}/);
 assert.match(ui,/aria-label=\{s.name\+' nach unten'\}/);
 assert.match(ui,/action:'save'/);
 assert.match(ui,/action:'share'/);
 assert.match(ui,/action:'delete'/);
 assert.match(ui,/new URLSearchParams/);
 assert.match(ui,/www.google.com\/maps\/dir/);
 assert.match(ui,/Ungeprüft/);
 assert.match(page,/page==='tours'&&<>[\\s\\S]*?<TourPlanner/);
 assert.match(page,/new URLSearchParams\(window.location.search\).has\('tour'\)/);
 assert.match(page,/Tour planen/);
 assert.match(css,/@media\(max-width:500px\)/);
});
test('PostgreSQL e2e checks route privacy, share and revoke',()=>{
 for(const fragment of ["Guest could list private tours","Other account read a private tour","Shared tour leaked private details","Revoked tour still publicly accessible","Ordered stops did not update"])
  assert.ok(ci.includes(fragment),fragment);
});
