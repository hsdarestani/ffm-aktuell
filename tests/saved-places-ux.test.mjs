import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readUiSource(path);
const api=file('app/api/[[...path]]/route.ts'),page=file('app/page.tsx');
const css=file('app/saved-places.css'),layout=file('app/layout.tsx');
test('private saved locations endpoint joins OSM and published venues only for logged in user',()=>{
 assert.match(api,/method==='GET'&&path==='favorites\/details'/);
 const start=api.indexOf("if(method==='GET'&&path==='favorites/details'");
 const end=api.indexOf("if(method==='GET'&&path==='favorites')",start);
 const code=api.slice(start,end);
 assert.match(code,/const u=need\(user\)/);
 assert.match(code,/FROM favorites f JOIN places p ON p.id=f.place_id/);
 assert.match(code,/FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id/);
 assert.match(code,/WHERE f.user_id=\$1/);
 assert.match(code,/WHERE cf.user_id=\$1/);
 assert.match(code,/dc.reviewed_status='unverified'/);
});
test('saved list is accessible and actions open same real modal',()=>{
 assert.match(page,/\|'saved'\|/);
 assert.match(page,/api\('favorites\/details'\)/);
 assert.match(page,/setSavedPlaces\(data.items\|\|\[\]\)/);
 assert.match(page,/onClick=\{\(\)=>setSelected\(p\)\}/);
 assert.match(page,/aria-label="Gespeicherte Orte"/);
 assert.match(page,/Meine Orte/);
 assert.match(page,/void favorite\(p.id\)/);
 assert.match(page,/Noch keine Orte gemerkt/);
});
test('responsive saved list has proper page CSS',()=>{
 assert.match(layout,/saved-places\.css/);
 assert.match(css,/@media\(max-width:540px\)/);
 assert.match(css,/ffm-saved-item/);
});

