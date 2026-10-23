import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(name)=>readUiSource(name);
const page=read('app/page.tsx'),api=read('app/api/[[...path]]/route.ts');
const db=read('db/schema.sql'),ui=read('components/PlaceActions.tsx'),atlas=read('components/Atlas3D.tsx');
const helpers=read('lib/location-actions.ts'),admin=read('components/AdminStudio.tsx');
const css=read('app/place-actions.css'),layout=read('app/layout.tsx');
const dialog=page.slice(page.indexOf('{selected&&<div className="overlay"'),page.indexOf('{auth&&<div className="overlay"'));

test('main place detail offers Route, Merken, Teilen, website and real-number Call without faking verification',()=>{
 assert.match(dialog,/<PlaceActions key=\{'actions:'\+selected\.id\}/);
 assert.match(dialog,/<PlaceLocationMap key=\{selected\.id\}/);
 for(const label of ['Route','Merken','Teilen','Anrufen','Website'])assert.ok(ui.includes(label),label);
 assert.match(ui,/navigator\.share/);
 assert.match(ui,/navigator\.clipboard\.writeText/);
 assert.match(helpers,/https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
 assert.match(helpers,/function safePhoneHref/);
 assert.match(helpers,/tel:/);
 assert.match(helpers,/encodeURIComponent\(query\)/);
 assert.match(helpers,/https:','http:/);
 assert.doesNotMatch(ui,/Jetzt geöffnet|openNow|5 Sterne/);
});
test('raw OSM candidates have real private favorites without pretending they are verified',()=>{
 assert.match(db,/CREATE TABLE IF NOT EXISTS candidate_favorites/);
 assert.match(db,/REFERENCES discovery_candidates\(osm_id\)/);
 assert.match(api,/SELECT osm_id AS id FROM candidate_favorites/);
 assert.match(api,/INSERT INTO candidate_favorites\(user_id,osm_id\)/);
 assert.match(api,/reviewed_status='unverified'/);
 assert.match(page,/const favorite=async\(id:string\)/);
 assert.match(page,/validLocationId\(id\)/);
 assert.doesNotMatch(page,/Ungeprüfte Einträge können noch nicht gespeichert werden/);
});
test('geolocated OSM markers open the same detail actions as published venues',()=>{
 assert.match(atlas,/onClick=\{\(\)=>onSelect\?\.\(selectedPlace\.id\)\}/);
 assert.match(page,/api\('location\?id='\+encodeURIComponent\(id\)\)/);
 assert.match(api,/method==='GET'&&path==='location'/);
 assert.match(api,/osmId\.test\(place_id\)/);
 assert.match(api,/status='published'/);
 assert.match(api,/false AS demo,true AS candidate/);
});
test('shared place URLs resolve correctly even if discovery pagination omits the location',()=>{
 assert.match(helpers,/u\.searchParams\.set\('ort',id\)/);
 assert.match(page,/new URLSearchParams\(window\.location\.search\)\.get\('ort'\)/);
 assert.match(page,/fetch\('\/api\/location\?id='\+encodeURIComponent\(placeId\)/);
 assert.match(api,/validLocationId\(place_id\)/);
});
test('bad-location reports enter admin queue, but never directly hide a business',()=>{
 assert.match(db,/CREATE TABLE IF NOT EXISTS place_reports/);
 assert.match(db,/CHECK \(\(place_id IS NOT NULL\)::int \+ \(osm_id IS NOT NULL\)::int = 1\)/);
 assert.match(api,/path==='place-reports'/);
 assert.match(api,/rate\(req,'place-report'\)/);
 assert.match(api,/INSERT INTO place_reports/);
 assert.match(api,/path==='admin\/review-report'/);
 assert.match(admin,/title:'Ortsmeldungen'/);
 assert.match(admin,/admin\/review-report/);
 assert.match(api,/report:reviewed/);
 const reviewSection=api.slice(api.indexOf("if(method==='POST'&&path==='admin/review-report'"),api.indexOf("if(method==='POST'&&path==='admin/review'"));
 assert.doesNotMatch(reviewSection,/UPDATE discovery_candidates SET|UPDATE places SET/);
});
test('tips attached to imported OSM venues are moderated',()=>{
 assert.match(db,/ALTER TABLE posts ADD COLUMN IF NOT EXISTS candidate_osm_id/);
 assert.match(api,/INSERT INTO posts\(user_id,place_id,candidate_osm_id,body,media_id\)/);
 assert.match(api,/owner_id=\$2 AND status IN \('pending','approved'\)/);
 assert.match(api,/COALESCE\(pl.name,dc.name\) AS place_name/);
 assert.match(ui,/Dein Beitrag wird vor der Veröffentlichung geprüft/);
 assert.match(ui,/onPost\(body\)/);
});
test('actions are responsive, accessible and only reveal the advanced tools on demand',()=>{
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(ui,/<details className="ffm-place-action-more">/);
 assert.match(ui,/<summary>Mehr zum Ort/);
 assert.match(ui,/aria-label="Aktionen zu diesem Ort"/);
 assert.match(ui,/disabled=\{Boolean\(venue.demo\)\}/);
 assert.match(layout,/place-actions\.css/);
});

