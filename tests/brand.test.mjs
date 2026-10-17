import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(file,'utf8');
const page=read('app/page.tsx');
const atlas=read('components/AtlasHome.tsx');
const brand=read('app/brand.css');
test('Live FFM homepage offers fast search and explicit access to real map APIs',()=>{
 assert.match(page,/import AtlasHome from/);
 assert.match(page,/onSearch=\{value=>/);
 assert.match(atlas,/onSearch\(query\.trim\(\)\)/);
 assert.match(atlas,/onPlace\(p\.id\)/);
 assert.match(atlas,/onCategory\(n.id\)/);assert.match(atlas,/onMap/);assert.doesNotMatch(atlas,/<Atlas3D/);
});
test('FFM bespoke identity and responsive layout survive Atlas integration',()=>{
 assert.match(brand,/\.ml-brand-mark/);
 assert.match(read('app/atlas.css'),/\.atlas-hero/);
 assert.match(read('app/atlas.css'),/@media\(max-width:480px\)/);
 assert.match(read('public/icon.svg'),/path d=/);
});
test('no directional-arrow controls in any live UI',()=>{
 const sources=['app/page.tsx','components/AtlasHome.tsx','components/Atlas3D.tsx','app/atlas/page.tsx','app/not-found.tsx'];
 const banned=/Arrow(Up|Down|Left|Right|UpRight|DownRight)|ExternalLink|[\u2190-\u21ff\u2794\u27a4\u27a1]/;
 for(const file of sources)assert.doesNotMatch(read(file),banned,file+' contains directional arrow UI');
});
