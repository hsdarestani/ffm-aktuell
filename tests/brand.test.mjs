import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const read=(name)=>fs.readFileSync(name,'utf8');
const page=read('app/page.tsx');
const home=read('components/MinimalHome.tsx');
const css=read('app/brand.css');
test('Mainlinie home uses real discovery and publication-backed UI',()=>{
 assert.match(page,/import MinimalHome from/);
 assert.match(page,/onSearch=\{value=>/);
 assert.match(home,/onSearch\(search\.trim\(\)\)/);
 assert.match(home,/onPlace\(p\.id\)/);
 assert.match(home,/onCategory\(key\)/);
});
test('signature identity is present and covers mobile breakpoints',()=>{
 assert.match(css,/\.ml-hero/);
 assert.match(css,/\.ml-river/);
 assert.match(css,/@media\(max-width:530px\)/);
 assert.match(read('public/icon.svg'),/path d=/);
});
test('no directional arrow icons or arrow glyphs on any live UI page',()=>{
 const sources=['app/page.tsx','components/MinimalHome.tsx','components/CityMap.tsx','app/not-found.tsx','app/brand-lab/page.tsx'];
 const banned=/Arrow(Up|Down|Left|Right|UpRight|DownRight)|ExternalLink|[\u2190-\u21ff\u2794\u27a4\u27a1]/;
 for(const file of sources){assert.doesNotMatch(read(file),banned,file+' contains directional arrow UI');}
});
