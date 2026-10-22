import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
test('personal coupon entitlement and private review management execute on PostgreSQL',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(readFileSync('db/schema.sql','utf8'));
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}};
 const users=(await query("INSERT INTO users(email,password_hash) VALUES('customer@test.invalid','x'),('merchant@test.invalid','x') RETURNING id")).rows;let actor={...users[0],role:'user'};
 const business=(await query("INSERT INTO businesses(owner_id,name,status) VALUES($1,'Merchant','approved') RETURNING id",[users[1].id])).rows[0].id;
 const deal=(await query("INSERT INTO deals(business_id,title,status,premium_only) VALUES($1,'Exclusive','published',true) RETURNING id",[business])).rows[0].id;
 const m={exports:{}};const mocks={'@/lib/db':{query},'@/lib/auth':{sessionUser:async()=>actor,trustedOrigin:()=>true},'@/lib/location-actions':{validLocationId:v=>/^[0-9a-f-]{36}$/.test(v),osmId:/^(node|way|relation)\//},'@/lib/admin-permissions':{},'@/lib/business-team':{},'@/lib/media-storage':{}};
 new Function('require','module','exports',ts.transpileModule(readFileSync('app/api/[[...path]]/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(n=>n in mocks?mocks[n]:require(n),m,m.exports);
 const request=async(path,body)=>{const method=body===undefined?'GET':'POST';const r=await m.exports[method]({nextUrl:new URL('https://example.org/api/'+path),headers:new Headers({'x-real-ip':'premium-test'}),json:async()=>body},{params:Promise.resolve({path:path.split('?')[0].split('/')})});return {status:r.status,body:await r.json()}};
 assert.equal((await request('coupons/claim',{deal_id:deal})).status,404);
 await query("INSERT INTO billing_prices(id,product_id,snapshot_hash,snapshot) VALUES('test','test','test','{}')");
 await query("INSERT INTO billing_subscriptions(id,user_id,customer_id,scope_key,price_id,snapshot,status,current_period_end) VALUES('sub',$1::uuid,'customer','user:'||$1::text,'test','{\"features\":[\"exclusive_deals\"]}','trialing',now()+interval '1 day')",[users[0].id]);
 const claim=await request('coupons/claim',{deal_id:deal});assert.equal(claim.status,200);assert.ok(claim.body.code);
 assert.equal((await request('coupons/claim',{deal_id:deal})).body.code,claim.body.code);
 for(const state of ['past_due','unpaid','canceled','incomplete']){
  await query('UPDATE billing_subscriptions SET status=$1',[state]);
  assert.equal((await request('coupons')).body.items[0].available,false);
  actor={...users[1],role:'user'};assert.equal((await request('business/coupons/redeem',{code:claim.body.code})).status,409);actor={...users[0],role:'user'};
 }
 await query("UPDATE billing_subscriptions SET status='active',current_period_end=now()-interval '1 second'");
 assert.equal((await request('coupons')).body.items[0].available,false);
 await query("UPDATE billing_subscriptions SET current_period_end=now()+interval '1 day',scope_key='business:wrong'");
 assert.equal((await request('coupons')).body.items[0].available,false);
 await query("UPDATE billing_subscriptions SET scope_key='user:'||user_id::text");
 assert.equal((await request('coupons')).body.items[0].available,true);
 actor={...users[1],role:'user'};assert.equal((await request('business/coupons/redeem',{code:claim.body.code})).status,200);assert.equal((await request('business/coupons/redeem',{code:claim.body.code})).status,409);
 const place=(await query("INSERT INTO places(name,status) VALUES('Review venue','published') RETURNING id")).rows[0].id;
 actor={...users[0],role:'user'};
 const saved=await request('reviews',{place_id:place,rating:1,body:'An honest critical experience for moderation.'});assert.equal(saved.status,201);
 let reviews=await request('reviews?place_id='+place);assert.equal(reviews.body.own.rating,1);assert.equal(reviews.body.items.length,0);
 assert.equal((await request('reviews',{place_id:place,rating:2,body:'Updated honest critical experience for moderation.'})).body.id,saved.body.id);
 await query("UPDATE venue_reviews SET status='published' WHERE id=$1",[saved.body.id]);
 actor={...users[1],role:'user'};
 assert.equal((await request('reviews/remove',{id:saved.body.id})).status,404);
 assert.equal((await request('reviews?place_id='+place)).body.own,null);
 const second=await request('reviews',{place_id:place,rating:5,body:'Another actual experience submitted for moderation.'});
 await query("UPDATE venue_reviews SET status='published' WHERE id=$1",[second.body.id]);
 assert.equal((await request('reviews?place_id='+place+'&sort=highest')).body.items[0].rating,5);
 assert.equal((await request('reviews?place_id='+place+'&sort=lowest')).body.items[0].rating,2);
 assert.equal((await request('reviews?place_id='+place+'&sort=rating;DROP')).status,400);
 actor={...users[0],role:'user'};assert.equal((await request('reviews/remove',{id:saved.body.id})).status,200);
 assert.equal((await request('reviews?place_id='+place)).body.own,null);
 actor=null;assert.equal((await request('reviews/remove',{id:second.body.id})).status,401);
 await db.exec(readFileSync('db/schema.sql','utf8'));assert.equal((await query('SELECT premium_only FROM deals WHERE id=$1',[deal])).rows[0].premium_only,true);
 }finally{await db.close()}
});
