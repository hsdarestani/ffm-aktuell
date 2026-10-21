import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('app/page.tsx','utf8');
const css=readFileSync('app/find-fast.css','utf8');
const segment=page.slice(page.indexOf("{page==='discover'&&"),page.indexOf("{page==='map'&&"));
test('visual discovery is one small heading, one search and category icons',()=>{
 assert.match(segment,/<h1>Entdecken<span>\.<\/span><\/h1>/);
 assert.match(segment,/ffm-find-search/);
 assert.match(segment,/Icon:Coffee/);
 assert.match(segment,/Icon:UtensilsCrossed/);
 assert.match(segment,/Icon:Martini/);
 assert.match(segment,/Icon:Landmark/);
 assert.match(segment,/ffm-find-category-visual/);
 assert.doesNotMatch(segment,/Finde, was|Einfach suchen oder auswählen|Einträge aus OpenStreetMap mit ungeprüftem Betriebsstatus/);
});
test('source information is optional on list but still available in details',()=>{
 assert.match(segment,/<details className="ffm-find-data">/);
 assert.match(segment,/OSM Einträge sind noch nicht auf Betrieb oder Öffnungszeiten geprüft/);
 assert.match(segment,/© OpenStreetMap-Mitwirkende/);
 assert.match(segment,/Ungeprüft/);
 assert.match(page,/Betrieb und Öffnungszeiten nicht geprüft/);
 assert.match(segment,/ffm-find-item-footer/);
});
test('unverified venues are represented by honest category drawings, not invented photographic venues',()=>{
 assert.match(segment,/candidates.map\(p=>\{/);
 assert.match(segment,/ffm-find-place-visual/);
 assert.match(segment,/const Icon=p.category/);
 assert.doesNotMatch(segment,/<img[^>]*src=\{ortsbild\(p.name/);
 const candidateCards=segment.slice(segment.indexOf('candidates.map(p=>{'));
 assert.doesNotMatch(candidateCards,/p\.rating|bewertet|jetzt geöffnet/);
});
test('responsive cards visually prioritize names, not repetitive descriptions',()=>{
 assert.match(css,/\.ffm-find-visual \.ffm-find-list\{display:grid;grid-template-columns:repeat\(3/);
 assert.match(css,/@media\(max-width:590px\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/-webkit-line-clamp:2/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(segment,/<details className="ffm-find-more">/);
});

