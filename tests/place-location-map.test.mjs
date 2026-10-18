import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('app/page.tsx','utf8');
const component=readFileSync('components/PlaceLocationMap.tsx','utf8');
const css=readFileSync('app/place-location.css','utf8');
const layout=readFileSync('app/layout.tsx','utf8');
const detail=page.slice(page.indexOf('{selected&&<div className="overlay"'),page.indexOf('{auth&&<div className="overlay"'));

test('selected place detail always fills formerly empty media column',()=>{
 assert.match(page,/import PlaceLocationMap from '@\/components\/PlaceLocationMap'/);
 assert.match(detail,/className="dialog-body"/);
 assert.match(detail,/<PlaceLocationMap key=\{selected\.id\}/);
 assert.match(detail,/latitude=\{selected\.latitude\}/);
 assert.match(detail,/longitude=\{selected\.longitude\}/);
 assert.doesNotMatch(detail,/picture\(2,selected\)/);
});
test('map uses the place own coordinates on real OSM, never invented stock pictures',()=>{
 assert.match(component,/www\.openstreetmap\.org\/export\/embed\.html/);
 assert.match(component,/new URLSearchParams\(\{bbox:bounds,layer:'mapnik',marker:/);
 assert.match(component,/https:\/\/www\.openstreetmap\.org\/\?mlat=/);
 assert.match(component,/lat>=49\.7&&lat<=50\.4&&lon>=8\.2&&lon<=9\.1/);
 assert.match(component,/Number\.isFinite\(lat\)&&Number\.isFinite\(lon\)/);
 assert.match(component,/Keine Kartenposition vorhanden/);
 assert.doesNotMatch(component,/ortsbild|unsplash|placeholder\.com|image_url/);
});
test('right-hand map on desktop, top map on mobile, with OSM credit and exit to map',()=>{
 assert.match(css,/grid-template-columns:minmax\(0,45%\) minmax\(0,55%\)/);
 assert.match(css,/grid-column:2;grid-row:1/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/order:-1/);
 assert.match(css,/ffm-place-location-map/);
 assert.match(component,/Karte öffnen/);
 assert.match(component,/Kartendaten © OpenStreetMap-Mitwirkende/);
 assert.match(layout,/place-location\.css/);
});
