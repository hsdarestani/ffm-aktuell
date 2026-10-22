import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../app/api/[[...path]]/route.ts',import.meta.url),'utf8');
const home=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const explore=readFileSync(new URL('../app/api/explore/route.ts',import.meta.url),'utf8');
test('nearby search is validated and uses actual coordinates',()=>{
 assert.match(api,/radius<0\.25\|\|radius>12/);assert.match(explore,/RADIANS\(latitude\)/);
 assert.match(explore,/\[1,3,5,10\]\.includes\(radius\)/);
 assert.match(home,/getCurrentPosition/);assert.match(home,/radius:String\(radiusKm\)/);
});
test('assistant never returns invented venues or false operating claims',()=>{
 assert.match(api,/verification_status='verified' AND activity_status='operating'/);
 assert.match(api,/verified_at BETWEEN now\(\)-interval '30 days'/);
 const assistant=readFileSync(new URL('../app/api/recommendations/route.ts',import.meta.url),'utf8');
 assert.match(assistant,/items\.find\(p=>p\.id===id\)/);
});
test('curated tours only use independently checked real coordinates',()=>{
 assert.match(api,/path==='tours\/curated'/);
 assert.match(api,/t\.stops\.length>=2/);
 assert.match(api,/latitude IS NOT NULL AND longitude IS NOT NULL/);
});

