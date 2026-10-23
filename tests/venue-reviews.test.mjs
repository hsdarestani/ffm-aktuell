import {readUiSource} from './ui-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readUiSource(p);
const api=get('app/api/[[...path]]/route.ts');
const schema=get('db/schema.sql');
const page=get('app/page.tsx'),admin=get('components/AdminStudio.tsx'),component=get('components/VenueReviews.tsx'),css=get('app/venue-reviews.css'),layout=get('app/layout.tsx');
const block=(first,last)=>api.slice(api.indexOf(first),api.indexOf(last,api.indexOf(first)));
test('reviews have exactly one published or OSM target, tight bounds and unique user vote',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS venue_reviews/);
 assert.match(schema,/CHECK \(rating BETWEEN 1 AND 5\)/);
 assert.match(schema,/CHECK \(char_length\(body\) BETWEEN 20 AND 1000\)/);
 assert.match(schema,/CHECK \(\(place_id IS NOT NULL\)::int \+ \(osm_id IS NOT NULL\)::int = 1\)/);
 assert.match(schema,/venue_reviews_user_place_unique/);
 assert.match(schema,/venue_reviews_user_osm_unique/);
 assert.match(schema,/REFERENCES discovery_candidates\(osm_id\)/);
});
test('reviews never expose pending / rejected items nor count unmoderated opinions',()=>{
 const code=block("if(method==='GET'&&path==='reviews'","if(method==='GET'&&path==='posts'");
 assert.match(code,/status='published'/);
 assert.match(code,/FROM venue_reviews WHERE/);
 assert.match(code,/avg\(rating\)/);
 assert.match(code,/LIMIT 30/);
 assert.match(code,/LEFT\(u.display_name,1\)/);
 assert.match(code,/reviewed_status='unverified'/);
});
test('authenticated reviews are rate-limited, source-checked, rated and held for admin',()=>{
 const code=block("if(method==='POST'&&path==='reviews'","if(method==='POST'&&path==='review-reports'");
 assert.match(code,/rate\(req,'venue-review'\)/);
 assert.match(code,/const u=need\(user\)/);
 assert.match(code,/min\(1\)\.max\(5\)/);
 assert.match(code,/min\(20\)\.max\(1000\)/);
 assert.match(code,/reviewed_status='unverified'/);
 assert.match(code,/ON CONFLICT \(user_id,osm_id\)/);
 assert.match(code,/ON CONFLICT \(user_id,place_id\)/);
 assert.match(code,/status='pending'/);
 assert.match(code,/review:submitted/);
});
test('reporting abusive reviews is logged in, deduplicated and human moderated',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS venue_review_reports/);
 assert.match(schema,/UNIQUE\(review_id,reporter_id\)/);
 const code=block("if(method==='POST'&&path==='review-reports'","if(method==='POST'&&path==='posts'");
 assert.match(code,/rate\(req,'review-abuse'\)/);
 assert.match(code,/need\(user\)/);
 assert.match(code,/user_id!=\$2/);
 assert.match(code,/ON CONFLICT\(review_id,reporter_id\) DO NOTHING/);
 assert.match(code,/review:reported/);
});
test('admin moderation supports approve/reject, queue and explicit removal for reported abuse',()=>{
 for(const name of ["reviews","reviewReports"])assert.match(admin,new RegExp("key:'"+name+"'"));
 assert.match(admin,/admin\/moderate-review/);
 assert.match(admin,/admin\/moderate-review-report/);
 assert.match(admin,/admin\/remove-review/);
 assert.match(api,/path==='admin\/moderate-review'/);
 assert.match(api,/path==='admin\/moderate-review-report'/);
 assert.match(api,/path==='admin\/remove-review'/);
 assert.match(api,/rr.review_id/);
 assert.match(api,/review:removed:/);
});
test('reviews UI explains no verified visit, hides unused rating and allows user report',()=>{
 assert.match(page,/<VenueReviews key=\{selected.id\} placeId=\{selected.id\}/);
 assert.match(component,/Besuch nicht verifiziert/);
 assert.match(component,/Noch keine freigegebenen Bewertungen/);
 assert.match(component,/role="group" aria-label="Sterne vergeben"/);
 assert.match(component,/minLength=\{20\} maxLength=\{1000\}/);
 assert.match(component,/onClick=\{\(\)=>void report\(r.id\)\}/);
 assert.match(component,/navigator\.share|Bewertung einreichen/);
 assert.match(component,/const form|type FormEvent/);
 assert.match(layout,/venue-reviews\.css/);
 assert.match(css,/@media\(max-width:800px\)/);
});
test('demo locations never get reviews',()=>{
 assert.match(component,/if\(demo\)return null/);
 assert.match(api,/validLocationId\(venueId\)/);
});

