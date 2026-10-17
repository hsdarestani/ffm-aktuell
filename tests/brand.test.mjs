import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync('app/page.tsx','utf8');
const home=readFileSync('components/MinimalHome.tsx','utf8');
const brand=readFileSync('app/brand.css','utf8');
test('new homepage is wired into actual application',()=>{assert.match(page,/import MinimalHome from/);assert.match(page,/onSearch=\{value=>/);assert.doesNotMatch(page,/SignalHome/);});
test('homepage search and featured places invoke real callbacks',()=>{assert.match(home,/onSearch\(term\.trim\(\)\)/);assert.match(home,/onPlace\(place\.id\)/);assert.match(home,/onCategory\(value\)/);});
test('restrained brand and mobile view exist',()=>{assert.match(brand,/\.mh-hero/);assert.match(brand,/@media\(max-width:520px\)/);assert.doesNotMatch(brand,/signal-moving-marquee/);});
