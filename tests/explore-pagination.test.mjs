import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const opening=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync('lib/opening-hours.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));

test('public discovery executes pagination and distance ordering against PostgreSQL',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('db/schema.sql','utf8'));
  await db.exec(`INSERT INTO places(name,category,district,address,latitude,longitude,status)
   SELECT 'Pagination venue '||lpad(n::text,2,'0'),'Cafés','Innenstadt','Test address',50.11,8.68,'published'
   FROM generate_series(1,23) n;
   INSERT INTO places(name,category,district,latitude,longitude,status)
   VALUES ('A further place','Bars','Innenstadt',50.115,8.68,'published'),('Z nearest place','Bars','Innenstadt',50.11001,8.68,'published');
   INSERT INTO discovery_candidates(osm_id,name,category,latitude,longitude,address,osm_url)
   VALUES ('node/99001','A further OSM','Bars',50.115,8.68,'Test','https://www.openstreetmap.org/node/99001'),
          ('node/99002','Z nearest OSM','Bars',50.11001,8.68,'Test','https://www.openstreetmap.org/node/99002');`);
  const compiled=ts.transpileModule(readFileSync('app/api/explore/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(id=>id==='@/lib/opening-hours'?opening:id==='@/lib/db'?{query:(sql,args)=>db.query(sql,args)}:require(id),module,module.exports);
  const get=async params=>{const response=await module.exports.GET({nextUrl:new URL('http://localhost/api/explore?'+params)});return {status:response.status,body:await response.json()}};
  await t.test('all editorial records are reachable beyond the first page without overlap',async()=>{
   const first=await get('q=Pagination&place_offset=0'),second=await get('q=Pagination&place_offset=18');
   assert.equal(first.status,200);assert.equal(second.status,200);
   assert.equal(first.body.places_total,23);assert.equal(second.body.places_total,23);
   assert.equal(first.body.places.length,18);assert.equal(second.body.places.length,5);
   assert.equal(new Set([...first.body.places,...second.body.places].map(p=>p.id)).size,23);
   assert.equal(second.body.places_offset,18);
  });
  await t.test('nearby editorial and OSM records sort by real distance before name',async()=>{
   const result=await get('category=Bars&lat=50.11&lon=8.68&radius=1');
   assert.equal(result.status,200);
   assert.equal(result.body.places[0].name,'Z nearest place');
   assert.equal(result.body.candidates[0].name,'Z nearest OSM');
   assert.ok(result.body.places[1].distance_km>result.body.places[0].distance_km);
  });
  await t.test('source-backed filters exclude unknown, stale, negative and unpublished evidence',async()=>{
   const ids=(await db.query("SELECT id FROM places WHERE name LIKE 'Pagination venue%' ORDER BY name LIMIT 4")).rows.map(r=>r.id);
   for(let i=0;i<4;i++)await db.query("INSERT INTO place_attributes(place_id,field,value,source_url,checked_at,note) VALUES($1,'family_friendly',$2,'https://example.org/source',now()-($3::int*interval '1 day'),'Official source checked')",[ids[i],i===1?'no':'yes',i===2?31:0]);
   await db.query("INSERT INTO place_attributes(place_id,field,value,source_url,checked_at,note) VALUES($1,'price_level','2','https://example.org/prices',now(),'Official price level source')",[ids[0]]);
   const first=await get('feature=family_friendly');assert.equal(first.status,200);assert.equal(first.body.places_total,2);assert.equal(first.body.candidates_total,0);
   const combined=await get('feature=family_friendly&price_max=2');assert.equal(combined.body.places_total,1);assert.equal(combined.body.places[0].id,ids[0]);
   assert.equal((await get('feature=family_friendly&price_max=1')).body.places_total,0);
   const u=(await db.query("INSERT INTO users(email,password_hash) VALUES('reviews@test.invalid','test') RETURNING id")).rows[0].id;
   await db.query("INSERT INTO venue_reviews(user_id,place_id,rating,body,status) VALUES($1,$2,5,'A detailed actual review for test','pending'),($1,$3,4,'A published actual review for test','published')",[u,ids[0],ids[3]]);
   const rated=await get('rating_min=4');assert.equal(rated.body.places_total,1);assert.equal(rated.body.places[0].id,ids[3]);
   for(const params of ['feature=invented','price_max=5','rating_min=6','rating_min=NaN'])assert.equal((await get(params)).status,400);
  });
  await t.test('invalid offsets fail before SQL and curated pages do not advance raw OSM',async()=>{
   for(const value of ['-1','0.5','Infinity','10001','bad'])assert.equal((await get('place_offset='+value)).status,400);
   const result=await get('category=Bars&place_offset=18');
   assert.equal(result.body.places.length,0);assert.equal(result.body.candidates.length,2);
  });
  await t.test('current opening filter excludes unknown, stale, closed and unverified plans',async()=>{
   const ids=(await db.query("SELECT id FROM places ORDER BY name LIMIT 4")).rows.map(x=>x.id);
   await db.query("UPDATE places SET verification_status='verified',activity_status='operating',verified_at=now() WHERE id=ANY($1::uuid[])",[ids.slice(0,3)]);
   for(let n=0;n<4;n++)await db.query("INSERT INTO place_opening_days(place_id,day,state,periods,source_url,checked_at,note) VALUES($1,(now() AT TIME ZONE 'Europe/Berlin')::date,$2,$3,'https://example.org/daily-hours',now()-($4::int*interval '1 day'),'Actual daily source checked')",[ids[n],n===1?'closed':'open',JSON.stringify(n===1?[]:[{start:0,end:1440}]),n===2?31:0]);
   const result=await get('open_now=1');assert.equal(result.status,200);assert.equal(result.body.places_total,1);assert.equal(result.body.places[0].id,ids[0]);assert.equal(result.body.candidates_total,0);assert.equal(result.body.openingNowAvailable,true);
   assert.equal((await get('open_now=maybe')).status,400);
  });
  await t.test('daily clock uses Frankfurt DST and half-open opening boundaries',async()=>{
   const id=(await db.query("SELECT id FROM places ORDER BY name LIMIT 1")).rows[0].id;
   await db.query("UPDATE places SET verified_at='2026-10-24T12:00:00Z' WHERE id=$1",[id]);
   await db.query("INSERT INTO place_opening_days(place_id,day,state,periods,source_url,checked_at,note) VALUES($1,'2026-10-25','open','[{\"start\":120,\"end\":180}]','https://example.org/holiday-hours','2026-10-24T12:00:00Z','Actual exceptional hours checked') ON CONFLICT(place_id,day) DO UPDATE SET periods=excluded.periods,checked_at=excluded.checked_at",[id]);
   const sql='SELECT '+opening.openNowSQL('p','$1::timestamptz')+' AS open FROM places p WHERE p.id=$2';
   for(const stamp of ['2026-10-25T00:00:00Z','2026-10-25T01:30:00Z'])assert.equal((await db.query(sql,[stamp,id])).rows[0].open,true);
   assert.equal((await db.query(sql,['2026-10-25T02:00:00Z',id])).rows[0].open,false);
   assert.equal(opening.validPeriods([{start:600,end:700},{start:650,end:800}],'open'),false);assert.equal(opening.validPeriods([{start:1200,end:120}],'open'),false);assert.equal(opening.validPeriods([],'closed'),true);
  });
 }finally{await db.close()}
});
