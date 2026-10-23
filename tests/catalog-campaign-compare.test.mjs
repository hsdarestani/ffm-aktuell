import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readUiSource(p);
test('Editorial taxonomy is managed by admins, supports nested groups and real multi-category links',()=>{
 const schema=file('db/schema.sql'),cats=file('app/api/categories/route.ts'),places=file('app/api/categories/places/route.ts');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS catalog_categories/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS place_categories/);
 assert.match(cats,/!canAdmin\(u,'editorial'\)/);
 assert.match(cats,/parent_slug/);
 assert.match(places,/JOIN|SELECT slug FROM catalog_categories/);
 assert.match(places,/FOR UPDATE/);
});
test('Business ad campaign proposals never imply price, subscription or delivery',()=>{
 const schema=file('db/schema.sql'),business=file('app/api/campaigns/route.ts'),admin=file('app/api/admin/campaigns/route.ts');
 assert.match(schema,/awaiting_commercial_setup/);
 assert.match(schema,/payment_status text NOT NULL DEFAULT 'not_configured'/);
 assert.doesNotMatch(schema,/CHECK\(status IN \('live'/);
 assert.match(business,/b\.owner_id=\$1/);
 assert.match(admin,/advertising_enabled:false/);
 assert.match(admin,/awaiting_commercial_setup/);
});
test('Place comparison never manufactures star ratings, prices or operating status',()=>{
 const page=file('app/page.tsx');
 assert.match(page,/comparePlaces/);
 assert.match(page,/slice\(-3\)/);
 assert.match(page,/p\.candidate\?'OSM · ungeprüft':statusLabel\(p\)/);
 assert.match(page,/Nicht hinterlegt/);
 assert.match(page,/Zum Vergleich hinzufügen/);
});

