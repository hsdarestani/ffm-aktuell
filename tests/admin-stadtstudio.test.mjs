import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readUiSource(p);
const admin=read('components/AdminStudio.tsx'),css=read('app/stadtstudio.css'),
 site=read('app/page.tsx'),dedicated=read('app/admin/page.tsx'),layout=read('app/layout.tsx');
test('new Stadtstudio is the only main-page admin and has a separate protected route',()=>{
 assert.match(site,/import AdminStudio from/);
 assert.match(site,/<AdminStudio permissions=/);
 assert.doesNotMatch(site,/<AdminOrtpruefung/);
 assert.match(site,/ffm-studio-active/);
 assert.match(dedicated,/fetch\('\/api\/me'/);
 assert.match(dedicated,/d\.user\?\.role==='admin'/);
 assert.match(layout,/stadtstudio\.css/);
});
test('Frankfurt-specific admin now starts with three direct tasks, not a marketing hero',()=>{
 for(const feature of ['Was steht','Orte prüfen','Freigaben','Neu erstellen','Nächste Orte','Prüfung starten']){
  assert.ok(admin.includes(feature),feature+' not found');
 }
 assert.match(admin,/ffm-simple-actions/);
 assert.doesNotMatch(admin,/<section className="ffm-studio-hero">/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(read('app/stadtstudio-simple.css'),/ffm-simple-action/);
 assert.match(layout,/stadtstudio-simple\.css/);
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

test('all candidate decisions remain evidence-based and optional details are disclosed',()=>{
 assert.match(admin,/detailDecision&&<form/);
 assert.match(admin,/name="confirms_existence" required/);
 assert.match(admin,/name="confirms_address" required/);
 assert.match(admin,/name="confirms_operation" required/);
 assert.match(admin,/verification_source/);
 assert.match(admin,/name="verification_note"/);
 assert.match(admin,/ffm-simple-more-fields/);
 assert.match(admin,/ffm-simple-danger/);
 assert.match(admin,/handleDecision\('needs_review'\)/);
 assert.match(admin,/handleDecision\('hide'\)/);
});
test('publishing stays a three choice, short basic form with optional advanced fields',()=>{
 for(const name of ['mode:\x27place\x27,title:\x27Ort\x27','mode:\x27news\x27,title:\x27Beitrag\x27','mode:\x27event\x27,title:\x27Event\x27']){
   assert.ok(admin.includes(name),'Missing publishing type: '+name);
 }
 assert.match(admin,/Weitere Angaben/);
 assert.match(admin,/Beschreibung & Link/);
 assert.match(admin,/Geplante Beiträge erscheinen erst/);
 assert.match(admin,/price_source_url/);
 assert.match(admin,/published_at/);
});

