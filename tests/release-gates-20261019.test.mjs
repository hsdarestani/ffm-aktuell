import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=p=>readFileSync(p,'utf8');
test('Community disables media when scanner is not ready but keeps text posts',()=>{
 const s=source('components/CommunityMediaComposer.tsx');
 const r=source('app/api/media/status/route.ts');
 assert.match(s,/disabled=\{!mediaReady\}/);
 assert.match(s,/Textbeiträge funktionieren weiterhin/);
 assert.match(r,/scannerReady\(\)/);
});
test('public business highlights are only from active explicit media grants',()=>{
 const api=source('app/api/highlights/route.ts'),media=source('app/api/media/[id]/route.ts');
 assert.match(api,/g\.revoked_at IS NULL AND g\.expires_at>now\(\)/);
 assert.match(api,/scope'\)==='available'/);
 assert.match(api,/b\.owner_id=\$1/);
 assert.match(media,/g\.revoked_at IS NULL AND g\.expires_at>now\(\)/);
 assert.match(media,/status:206/);
});
test('Map does not treat empty vector style as successfully loaded',()=>{
 const map=source('components/Atlas3D.tsx');
 assert.match(map,/vectorTileSeen/);
 assert.match(map,/rasterTileSeen/);
 assert.match(map,/if\(triedRaster\?!rasterTileSeen:!vectorTileSeen\)return/);
 assert.match(map,/switchToSafeMap\(\)/);
});
