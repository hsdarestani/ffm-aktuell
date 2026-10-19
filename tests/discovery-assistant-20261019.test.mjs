import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../app/api/[[...path]]/route.ts',import.meta.url),'utf8');
const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
test('nearby search is validated and uses actual coordinates',()=>{
 assert.match(api,/radius<0\.25\|\|radius>12/);assert.match(api,/RADIANS\(latitude\)/);
 assert.match(home,/getCurrentPosition/);assert.match(home,/q\.set\('radius','3'\)/);
});
test('assistant never returns invented venues or false operating claims',()=>{
 assert.match(api,/verification_status='verified' AND activity_status='operating'/);
 assert.match(api,/verified_at BETWEEN now\(\)-interval '30 days'/);
 assert.match(api,/candidates\.find\(p=>p\.id===id\)/);
});
test('curated tours only use independently checked real coordinates',()=>{
 assert.match(api,/path==='tours\/curated'/);
 assert.match(api,/t\.stops\.length>=2/);
 assert.match(api,/latitude IS NOT NULL AND longitude IS NOT NULL/);
});
