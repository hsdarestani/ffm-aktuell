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
 assert.match(css,/grid-column:2;grid-row:2/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/order:-1/);
 assert.match(css,/ffm-place-location-map/);
 assert.match(component,/Karte öffnen/);
 assert.match(component,/Kartendaten © OpenStreetMap-Mitwirkende/);
 assert.match(layout,/place-location\.css/);
});

test('close control is outside map iframe in a dedicated, keyboard-accessible header',()=>{
 const dialogStart=detail.indexOf('className="ffm-place-dialog-header"');
 const closeStart=detail.indexOf('className="dialog-close"',dialogStart);
 const infoStart=detail.indexOf('className="dialog-body"',closeStart);
 const mapStart=detail.indexOf('<PlaceLocationMap',infoStart);
 assert.ok(dialogStart>=0&&closeStart>dialogStart&&infoStart>closeStart&&mapStart>infoStart);
 assert.match(detail,/aria-label="Details schließen"/);
 assert.match(css,/grid-template-rows:48px minmax\(0,1fr\)/);
 assert.match(css,/grid-column:1\/-1;grid-row:1/);
 assert.match(css,/\.ffm-place-dialog-header \.dialog-close\{\s*position:static/);
 assert.match(css,/\.ffm-place-dialog-header\{\s*order:-2/);
 assert.match(css,/\.ffm-place-location\{\s*order:-1/);
 assert.match(css,/\.ffm-place-dialog-header \.dialog-close:focus-visible/);
});
