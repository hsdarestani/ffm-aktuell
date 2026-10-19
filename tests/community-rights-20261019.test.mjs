import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const read=p=>readFileSync(p,'utf8');
test('24h public story expiry, owner removal and pending moderation',()=>{
 const s=read('app/api/stories/route.ts'),a=read('app/api/media/moderation/route.ts');
 assert.match(s,/expires_at>now\(\)/);assert.match(s,/owner_id=\$2/);assert.match(s,/status IN \('pending','approved'\)/);
 assert.match(a,/s\.expires_at>now\(\)/);assert.match(a,/m\.status='approved'/);
});
test('rights and highlights require explicit revocable and unexpired consent',()=>{
 const r=read('app/api/media/rights/route.ts'),h=read('app/api/highlights/route.ts');
 assert.match(r,/revoked_at=now\(\)/);assert.match(r,/owner_id=\$2/);
 assert.match(h,/g\.revoked_at IS NULL AND g\.expires_at>now\(\)/);assert.match(h,/b\.owner_id=\$1/);
});
