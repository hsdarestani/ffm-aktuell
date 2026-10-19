import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const r=p=>readFileSync(p,'utf8');
test('media never bypasses scanner or rights and uses persistent volume',()=>{
 const s=r('lib/media-storage.ts'),up=r('app/api/media/upload/route.ts'),serve=r('app/api/media/[id]/route.ts'),docker=r('docker-compose.yml');
 assert.match(s,/CLAMD_HOST/);assert.match(s,/await scan\(bytes\)/);assert.match(s,/await scan\(result\)/);assert.match(s,/map_metadata/);assert.match(s,/webp\(/);
 assert.match(up,/license_confirmed/);assert.match(up,/sessionUser/);assert.match(up,/status:'pending'/);
 assert.match(serve,/g\.revoked_at IS NULL AND g\.expires_at>now\(\)/);
 assert.match(serve,/m\.status!=='approved'/);assert.match(docker,/ffm_media:\/app\/uploads/);
});
