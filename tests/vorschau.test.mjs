import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readUiSource(file);
const v=read('lib/vorschau.ts'),page=read('app/page.tsx'),home=read('components/AtlasHome.tsx'),css=read('app/vorschau.css'),atlas=read('app/atlas/page.tsx');
test('samples exist for all requested visitor surfaces but are not written to the DB',()=>{
 for(const key of ['vorschauOrte','vorschauVeranstaltungen','vorschauBeitraege','vorschauPosts','vorschauAngebote'])assert.match(v,new RegExp('export const '+key));
 assert.match(v,/Musterangebot/);
 assert.match(v,/Musterprofil/);
 assert.match(v,/demo:true/);
 assert.doesNotMatch(read('app/api/[[...path]]/route.ts'),/vorschauOrte|vorschauVeranstaltungen|vorschauAngebote/);
 assert.match(page,/VORSCHAU_HINWEIS/);
});
test('all live public views are filled with labeled photo previews',()=>{
 for(const word of ['sichtbareOrte','sichtbareVeranstaltungen','sichtbareBeitraege','sichtbarePosts','sichtbareAngebote'])assert.match(page,new RegExp(word));
 assert.match(page,/Musterveranstaltung · nicht buchbar/);
 assert.match(page,/MUSTERANGEBOT · NICHT EINLÖSBAR/);
 assert.match(page,/Musterbeitrag · erfundenes Profil/);
 assert.match(page,/v3-business-preview/);
 assert.match(home,/v3-home-news-grid/);
 assert.match(css,/\.v3-place-grid/);
 assert.match(css,/@media\(max-width:540px\)/);
});
test('visible navigational and editorial content does not use unwanted English wording',()=>{
 for(const old of ['03 / CITY JOURNAL','04 / THE PEOPLE','YOUR CITY / YOUR VOICE','COMMUNITY / POST','LOCAL BUSINESS / PARTNERS','01 / DISCOVER FRANKFURT','PLACES / FRANKFURT','MEMBER ACCESS / FFM AKTUELL'])assert.ok(!page.includes(old),old);
 assert.match(page,/events:'Veranstaltungen'/);
 assert.match(page,/community:'Miteinander'/);
 assert.match(page,/setLang\(/);
 assert.match(page,/lang==='de'\?'EN':'DE'/);
 assert.doesNotMatch(atlas,/setLang\(/);
 assert.match(home,/03 \/ STADTJOURNAL/);
});
test('photo cards include meaningful alt labels and demo UI never writes placeholder favorites',()=>{
 assert.match(page,/alt="Stimmungsbild zur Stadtempfehlung"/);
 assert.match(page,/validLocationId\(id\)/);
 assert.match(read('components/PlaceActions.tsx'),/venue\.demo/);
 assert.match(v,/Stimmungsbild/);
 assert.match(css,/prefers-reduced-motion/);
});

