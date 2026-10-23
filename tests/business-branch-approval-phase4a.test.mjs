import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts'),page=read('app/page.tsx'),
 admin=read('components/AdminStudio.tsx'),ui=read('components/BusinessBranchEditor.tsx'),
 e2e=read('scripts/ci-admin-activation-e2e.mjs');
test('owner branch changes staged, uniquely pending, audited and do not alter public data preapproval',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS place_change_requests/);
 assert.match(schema,/place_change_one_pending/);
 assert.match(schema,/ALTER TABLE places ADD COLUMN IF NOT EXISTS phone/);
 assert.match(api,/if\(method==='POST'&&path==='business\/places\/change'\)/);
 assert.match(api,/const u=need\(user\),business=await ownBusiness\(u\)/);
 assert.match(api,/SELECT id FROM places WHERE id=\$1 AND business_id=\$2 AND status='published'/);
 assert.match(api,/ON CONFLICT\(place_id\) WHERE status='pending'/);
 assert.match(api,/business:branch-change-requested/);
});
test('approval requires admin and invalidates status verification until independently rechecked',()=>{
 const block=api.slice(api.indexOf("if(method==='POST'&&path==='admin/review-place-change'"),api.indexOf("if(method==='POST'&&path==='admin/moderate-review'"));
 assert.match(block,/const u=admin\(user,'business'\)/);
 assert.match(block,/FOR UPDATE/);
 assert.match(block,/business_id=\$7 AND status='published'/);
 assert.match(block,/verification_status='unverified'/);
 assert.match(block,/activity_status='unknown'/);
 assert.match(block,/verified_at=NULL/);
 assert.match(block,/verification_source=NULL/);
 assert.match(block,/await tx.query\('ROLLBACK'\)/);
 assert.match(block,/await tx.query\('COMMIT'\)/);
});
test('owner has concise branch editor and editors see approval queue',()=>{
 assert.match(page,/<BusinessBranchEditor places=/);
 assert.match(ui,/Neue Eingaben ersetzen deinen offenen Antrag/);
 assert.match(ui,/business\/places\/change/);
 assert.match(ui,/onChanged\(\)/);
 assert.match(admin,/key:'branchChanges'/);
 assert.match(admin,/admin\/review-place-change/);
 assert.match(api,/branchChanges:canAdmin\(user,'business'\)\?branchChanges.rows/);
});
test('real database flow defends against outsider changes, pending leakage and rejected edits',()=>{
 assert.match(e2e,/Unrelated person could edit a business venue/);
 assert.match(e2e,/Unmoderated branch edit became public/);
 assert.match(e2e,/stale verified status remains/);
 assert.match(e2e,/Rejected change overwrote public details/);
});

