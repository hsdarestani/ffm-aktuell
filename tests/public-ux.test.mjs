import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const home=read('components/AtlasHome.tsx'),page=read('app/page.tsx'),css=read('app/quick-home.css'),find=read('app/find-fast.css'),layout=read('app/layout.tsx');
test('a visitor can begin with one search or exactly six immediate activity choices',()=>{
 assert.match(home,/Was hast du/);
 assert.match(home,/Wonach suchst du/);
 assert.match(home,/onSearch\(query.trim\(\)\)/);
 const ids=[...home.matchAll(/\{id:'([^']+)',label:'[^']+',icon:/g)].map(m=>m[1]);
 assert.deepEqual(ids,['Cafés','Restaurants','Bars','Freizeit','Museen','Apotheken']);
 assert.match(home,/onCategory\(n.id\)/);
 assert.match(home,/onMap/);
 assert.match(home,/onEvents/);
});
test('the home route does not mount a blocking 3D map',()=>{
 assert.doesNotMatch(home,/<Atlas3D/);
 assert.doesNotMatch(home,/next\/dynamic|maplibre-gl/);
 assert.match(page,/<AtlasHome lang/);
 assert.match(page,/page==='map'&&<main className="atlas-app-map"/);
});
test('the home view does not advertise illustrative entries as confirmed or give invented events',()=>{
 assert.match(home,/places.filter\(p=>frischBestaetigt\(p\)\)/);
 assert.match(home,/events.filter\(ev=>!ev.demo/);
 assert.match(home,/MUSTERBEITRAG/);
 assert.match(home,/keine buchbaren Events/);
 assert.match(home,/Öffnungszeiten bitte beim Anbieter prüfen/);
});
test('real search is first, preview cards are folded, advanced categories are not in the main navigation',()=>{
 assert.match(page,/ffm-find-source-line/);
 assert.match(page,/candidates.map\(p=>/);
 assert.match(page,/ffm-find-preview/);
 assert.match(page,/<details className="ffm-find-more">/);
 assert.match(page,/Nur aktuell geprüfte Betriebe/);
 assert.match(page,/window.setTimeout\(\(\)=>\{/);
 assert.match(page,/const nav:[^;]*\['map',MapIcon,t.map\]\];/);
 assert.doesNotMatch(page,/const nav:[^;]*\['community',Users,t.community\]/);
});
test('full category catalog, official pharmacy duty search and 3D map remain accessible',()=>{
 assert.match(page,/categoryIds.filter\(cat=>/);
 assert.match(page,/Apotheken Notdienst/);
 assert.match(page,/aponet.de\/notdienstsuche/);
 assert.match(page,/Atlas3D places=\{places\}/);
 assert.match(home,/Alle Kategorien ansehen/);
 assert.match(home,/Miteinander entdecken/);
});
test('responsive mobile experience limits distraction and retains keyboard interaction',()=>{
 assert.match(css,/@media\(max-width:430px\)/);
 assert.match(find,/@media\(max-width:590px\)/);
 assert.match(home,/role="search"/);
 assert.match(home,/className="sr-only"/);
 assert.match(page,/aria-label="Suche löschen"/);
 assert.match(layout,/quick-home\.css/);
 assert.match(layout,/find-fast\.css/);
});
