import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
async function load(path){const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))}
const {enqueuePushJobs,pushPayloadQuery}=await load('lib/push-jobs.ts');
const {safePushEndpoint,validPushKeys}=await load('lib/push-policy.ts');
test('push endpoints reject SSRF targets and malformed encryption keys',()=>{
 for(const host of ['https://fcm.googleapis.com/fcm/send/x','https://updates.push.services.mozilla.com/wpush/v2/x','https://web.push.apple.com/x'])assert.equal(safePushEndpoint(host),true);
 for(const url of ['http://fcm.googleapis.com/x','https://fcm.googleapis.com.evil.org/x','https://localhost/x','https://127.0.0.1/x','https://fcm.googleapis.com:444/x','https://user@fcm.googleapis.com/x','https://evil.notify.windows.com.evil/x'])assert.equal(safePushEndpoint(url),false);
 assert.equal(validPushKeys({p256dh:Buffer.alloc(65).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}),true);
 assert.equal(validPushKeys({p256dh:'bad',auth:'bad'}),false);
});
test('push jobs enforce consent, event bookmarks, publication, time windows and deduplication',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('db/schema.sql','utf8'));
  const user=(await db.query("INSERT INTO users(email,password_hash) VALUES('push@test.invalid','test') RETURNING id")).rows[0].id;
  const sub=(await db.query("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,'https://fcm.googleapis.com/x','test','test') RETURNING id",[user])).rows[0].id;
  const event=(await db.query("INSERT INTO events(title,starts_at,status) VALUES('Real saved event',now()+interval '50 minutes','published') RETURNING id,starts_at::text AS version")).rows[0];
  await db.query('INSERT INTO event_favorites(user_id,event_id) VALUES($1,$2)',[user,event.id]);
  await db.query('INSERT INTO user_preferences(user_id) VALUES($1)',[user]);
  await t.test('no category consent means no delivery',async()=>{await db.exec(enqueuePushJobs);assert.equal((await db.query('SELECT * FROM push_deliveries')).rows.length,0)});
  await db.query('UPDATE user_preferences SET notify_events=true WHERE user_id=$1',[user]);
  await db.exec(enqueuePushJobs);await db.exec(enqueuePushJobs);
  assert.equal((await db.query('SELECT * FROM push_deliveries')).rows.length,1);
  const args=[sub,event.id,'event',event.version];
  assert.equal((await db.query(pushPayloadQuery,args)).rows.length,1);
  await t.test('unbookmarking cancels a queued reminder at delivery time',async()=>{await db.query('DELETE FROM event_favorites WHERE user_id=$1',[user]);assert.equal((await db.query(pushPayloadQuery,args)).rows.length,0)});
  await db.query('INSERT INTO event_favorites(user_id,event_id) VALUES($1,$2)',[user,event.id]);
  await t.test('rescheduling invalidates the old reminder',async()=>{await db.query("UPDATE events SET starts_at=now()+interval '2 hours' WHERE id=$1",[event.id]);assert.equal((await db.query(pushPayloadQuery,args)).rows.length,0)});
  await t.test('news never sends old, future or unpublished content',async()=>{
   await db.query('UPDATE user_preferences SET notify_news=true WHERE user_id=$1',[user]);
   await db.exec("INSERT INTO news(title,status,published_at) VALUES('old','published',now()-interval '1 day'),('future','published',now()+interval '1 hour'),('pending','pending',now()),('current','published',now())");
   await db.exec(enqueuePushJobs);const jobs=(await db.query("SELECT * FROM push_deliveries WHERE kind='news'")).rows;assert.equal(jobs.length,1);
   const job=jobs[0];assert.equal((await db.query(pushPayloadQuery,[sub,job.source_id,'news',job.source_version])).rows[0].title,'current');
   await db.query('UPDATE user_preferences SET notify_news=false WHERE user_id=$1',[user]);assert.equal((await db.query(pushPayloadQuery,[sub,job.source_id,'news',job.source_version])).rows.length,0);
  });
  await t.test('offers, followed businesses and matching tips require consent and cancel on withdrawal',async()=>{
   const business=(await db.query("INSERT INTO businesses(owner_id,name,status) VALUES($1,'Followed business','approved') RETURNING id",[user])).rows[0].id;
   const place=(await db.query("INSERT INTO places(business_id,name,category,district,status,verification_status,activity_status,verified_at) VALUES($1,'Verified café','Cafés','Nordend','published','verified','operating',now()) RETURNING id",[business])).rows[0].id;
   await db.query('INSERT INTO business_follows(follower_id,business_id) VALUES($1,$2)',[user,business]);
   await db.query("INSERT INTO deals(business_id,title,status) VALUES($1,'Real offer','published')",[business]);
   await db.query("INSERT INTO posts(user_id,place_id,body,status) VALUES($1,$2,'Actual moderated contribution','published')",[user,place]);
   await db.query("INSERT INTO discovery_tips(place_id,title,body,publish_at,expires_at) VALUES($1,'Verified city idea','A source backed city recommendation',now(),now()+interval '1 day')",[place]);
   await db.exec(enqueuePushJobs);assert.equal((await db.query("SELECT * FROM push_deliveries WHERE kind IN ('offer','following','tip')")).rows.length,0);
   await db.query("UPDATE user_preferences SET notify_offers=true,notify_following=true,notify_tips=true,interests=ARRAY['Sport'],districts=ARRAY['Westend'] WHERE user_id=$1",[user]);
   await db.exec(enqueuePushJobs);assert.equal((await db.query("SELECT * FROM push_deliveries WHERE kind IN ('offer','following')")).rows.length,2);assert.equal((await db.query("SELECT * FROM push_deliveries WHERE kind='tip'")).rows.length,0);
   await db.query("UPDATE user_preferences SET interests=ARRAY['Cafés'] WHERE user_id=$1",[user]);await db.exec(enqueuePushJobs);await db.exec(enqueuePushJobs);
   const jobs=(await db.query("SELECT * FROM push_deliveries WHERE kind IN ('offer','following','tip')")).rows;assert.equal(jobs.length,3);
   for(const job of jobs)assert.equal((await db.query(pushPayloadQuery,[sub,job.source_id,job.kind,job.source_version])).rows.length,1);
   await db.query('DELETE FROM business_follows WHERE follower_id=$1',[user]);const followed=jobs.find(j=>j.kind==='following');assert.equal((await db.query(pushPayloadQuery,[sub,followed.source_id,followed.kind,followed.source_version])).rows.length,0);
   await db.query("UPDATE deals SET status='rejected' WHERE business_id=$1",[business]);const offer=jobs.find(j=>j.kind==='offer');assert.equal((await db.query(pushPayloadQuery,[sub,offer.source_id,offer.kind,offer.source_version])).rows.length,0);
   await db.query("UPDATE places SET verified_at=now()-interval '31 days' WHERE id=$1",[place]);const tip=jobs.find(j=>j.kind==='tip');assert.equal((await db.query(pushPayloadQuery,[sub,tip.source_id,tip.kind,tip.source_version])).rows.length,0);
  });
  await t.test('deleting the account removes subscriptions and delivery history',async()=>{await db.query('DELETE FROM users WHERE id=$1',[user]);assert.equal((await db.query('SELECT * FROM push_subscriptions')).rows.length,0);assert.equal((await db.query('SELECT * FROM push_deliveries')).rows.length,0)});
 }finally{await db.close()}
});
