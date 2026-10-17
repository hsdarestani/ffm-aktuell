import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const admin=read('components/AdminStudio.tsx'),css=read('app/stadtstudio.css'),
 site=read('app/page.tsx'),dedicated=read('app/admin/page.tsx'),layout=read('app/layout.tsx');
test('new Stadtstudio is the only main-page admin and has a separate protected route',()=>{
 assert.match(site,/import AdminStudio from/);
 assert.match(site,/<AdminStudio onChanged=/);
 assert.doesNotMatch(site,/<AdminOrtpruefung/);
 assert.match(site,/ffm-studio-active/);
 assert.match(dedicated,/fetch\('\/api\/me'/);
 assert.match(dedicated,/d\.user\?\.role==='admin'/);
 assert.match(layout,/stadtstudio\.css/);
});
test('Frankfurt-specific language and scene are not generic template content',()=>{
 for(const feature of ['Skyline','Stadtpult','Orte prüfen','Freigaben','Veröffentlichen',
 'Die Stadt.','Dein Blick.','Beleg statt Behauptung','Dreimal sicher','Quellenlage prüfen']){
  assert.ok(admin.includes(feature),feature+' not found');
 }
 assert.match(css,/ffm-studio-skyline/);
 assert.match(css,/ffm-studio-hero-scene/);
 assert.match(css,/ffmStudioPulse/);
 assert.match(css,/prefers-reduced-motion/);
});
test('mobile workspace uses independent tabs and dismissible place detail sheet',()=>{
 assert.match(css,/max-width:850px/);
 assert.match(css,/max-width:560px/);
 assert.match(css,/ffm-studio-mobile-tabs/);
 assert.match(css,/ffm-studio-drawer-scrim/);
 assert.match(css,/ffm-studio-detail-panel.drawer-open/);
 assert.match(admin,/setDrawer\(true\)/);
 assert.match(admin,/aria-label="Details schließen"/);
});
test('existing privileged API paths and stringent independent verification remain wired',()=>{
 for(const path of ['admin/validation','admin/candidates','admin/queue','admin/review-candidate',
 'admin/verify-place','admin/review','admin/places','admin/events','admin/news']){
  assert.ok(admin.includes(path),'missing endpoint: '+path);
 }
 for(const f of ['confirms_existence','confirms_address','confirms_operation','verification_note','verification_source','verification_method']){
  assert.ok(admin.includes(f),'missing review evidence field: '+f);
 }
 assert.match(admin,/window\.confirm/);
 assert.match(admin,/no-store/);
 assert.match(admin,/kein Live Öffnungsstatus/i);
 assert.match(admin,/safeLink/);
});
