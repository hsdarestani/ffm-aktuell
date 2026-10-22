import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
function compile(path,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports}
const context=compile('lib/discovery-context.ts');
test('discovery uses Berlin dates, strict source-backed budgets and real forecast data',()=>{
 const now=new Date('2026-10-21T22:30:00Z');assert.equal(context.berlinDate(now),'2026-10-22');
 assert.throws(()=>context.parseDiscoveryContext(new URLSearchParams({date:'2026-02-30'}),now));
 assert.throws(()=>context.parseDiscoveryContext(new URLSearchParams({budget:'cheap'}),now));
 const c=context.parseDiscoveryContext(new URLSearchParams({budget:'2',occasion:'date',event_budget:'12.50'}),now);assert.equal(c.eventBudget,1250);
 assert.equal(context.contextMatches({},c),false);assert.equal(context.contextMatches({price_level:'2',date_friendly:'yes'},c),true);assert.equal(context.contextMatches({price_level:'2',date_friendly:'yes'},c,true),false);
 const extra=context.parseDiscoveryContext(new URLSearchParams({daypart:'afternoon',mood:'relaxed',companion:'family',lat:'50.11',lon:'8.68',radius:'1'}),now);
 assert.equal(context.contextMatches({quiet:'yes',family_friendly:'yes'},extra,false,{latitude:50.11,longitude:8.68,periods:[{start:720,end:900}]}),true);
 assert.equal(context.contextMatches({quiet:'yes',family_friendly:'yes'},extra,false,{latitude:50.11,longitude:8.68,periods:[{start:600,end:720}]}),false);
 assert.equal(context.contextMatches({quiet:'yes',family_friendly:'yes'},extra,false,{latitude:50.3,longitude:8.9,periods:[{start:720,end:900}]}),false);
 assert.throws(()=>context.parseDiscoveryContext(new URLSearchParams({lat:'50.11'}),now));
 assert.equal(context.weatherSummary([],c.date,now.getTime()),null);
 const forecast=context.weatherSummary([{dt:Date.parse('2026-10-22T12:00:00Z')/1000,main:{temp:12},weather:[{id:500}],pop:.6}],c.date,now.getTime());assert.equal(forecast.prefer_indoor,true);assert.equal(forecast.min,12);
});
test('phone, translation and advertising workflows execute their gates on PostgreSQL',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(readFileSync('db/schema.sql','utf8'));
 const query=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}};
 const pool={connect:async()=>({query,release(){}})},mocks={'@/lib/db':{pool,query}};
 const users=[];for(const name of ['owner','user','other'])users.push((await db.query("INSERT INTO users(email,password_hash,display_name) VALUES($1,'fixture',$2) RETURNING id,email,display_name,role",[name+'@example.org',name])).rows[0]);const [owner,user,other]=users;
 const business=(await db.query("INSERT INTO businesses(owner_id,name,status) VALUES($1,'Actual company','approved') RETURNING id",[owner.id])).rows[0].id;
 const place=(await db.query("INSERT INTO places(business_id,name,status,verification_status,activity_status,verified_at,latitude,longitude) VALUES($1,'Actual location','published','verified','operating',now(),50.11,8.68) RETURNING id",[business])).rows[0].id;
 let actor=user,recent=true,token='',approved=true,calls=0;
 const auth={sessionUser:async()=>actor,trustedOrigin:()=>true,isRecentlyAuthenticated:async()=>recent,beginSession:async(id,res)=>{const value='a'.repeat(64);res.cookies.set('ffm_session',value);await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",[require('node:crypto').createHash('sha256').update(value).digest('hex'),id])}};
 const phoneProvider=compile('lib/phone-provider.ts'),phone=compile('app/api/auth/phone/route.ts',{...mocks,'@/lib/auth':auth,'@/lib/phone-provider':{...phoneProvider,phoneConfigured:()=>true,verifyPhone:async()=>{calls++;return {sid:'VE'+'1'.repeat(32),pending:true,approved}}}});
 const req=d=>({json:async()=>d,cookies:{get:()=>token?{value:token}:undefined},headers:new Headers({'x-real-ip':'127.0.0.1'})});
 const post=async(route,d)=>{const r=await route.POST(req(d));return {status:r.status,body:await r.json(),response:r}};
 await t.test('phone linking requires fresh auth, consent, region, provider proof and one-use challenge',async()=>{
  recent=false;assert.equal((await post(phone,{action:'start',phone:'+4915123456789',consent:true})).status,403);recent=true;
  assert.equal((await post(phone,{action:'start',phone:'+15551234567',consent:true})).status,400);
  const start=await post(phone,{action:'start',phone:'+4915123456789',consent:true});assert.equal(start.status,200);token=start.response.cookies.get('ffm_phone').value;assert.notEqual((await db.query('SELECT token_hash FROM phone_challenges')).rows[0].token_hash,token);
  assert.equal((await post(phone,{action:'start',phone:'+4915123456789',consent:true})).status,429);
  approved=false;assert.equal((await post(phone,{action:'check',code:'111111'})).status,400);assert.equal((await db.query('SELECT attempts FROM phone_challenges')).rows[0].attempts,1);approved=true;
  assert.equal((await post(phone,{action:'check',code:'111111'})).status,200);assert.equal((await post(phone,{action:'check',code:'111111'})).status,409);
  assert.equal((await db.query('SELECT user_id FROM phone_identities')).rows[0].user_id,user.id);
 });
 await t.test('phone login cannot become fresh authentication or log into a business account',async()=>{
  actor=null;await db.query("UPDATE phone_challenges SET created_at=now()-interval '2 hours'");
  let r=await post(phone,{action:'start',phone:'+4915123456789',consent:true});token=r.response.cookies.get('ffm_phone').value;
  assert.equal((await post(phone,{action:'check',code:'111111'})).status,200);assert.equal((await db.query("SELECT authenticated_at<now()-interval '1 hour' AS weak FROM sessions WHERE user_id=$1",[user.id])).rows[0].weak,true);
  await db.query('UPDATE phone_identities SET user_id=$1',[owner.id]);await db.query("UPDATE phone_challenges SET created_at=now()-interval '2 hours'");r=await post(phone,{action:'start',phone:'+4915123456789',consent:true});token=r.response.cookies.get('ffm_phone').value;assert.equal((await post(phone,{action:'check',code:'111111'})).status,403);
 });
 await t.test('published translations require consent, cache exact source and respect withdrawal',async()=>{
  const postId=(await db.query("INSERT INTO posts(user_id,body,status) VALUES($1,'Ein ruhiger Ort.','published') RETURNING id",[user.id])).rows[0].id;actor=user;let requests=0;
  const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture';
  try{const route=compile('app/api/translations/route.ts',{'@/lib/auth':auth,'@/lib/text-provider':{query,reserveTextRequest:async()=>true,textJSON:async()=>{requests++;return {text:'A quiet place.'}}}});
   assert.equal((await post(route,{post_id:postId,language:'en'})).status,400);
   assert.equal((await post(route,{post_id:postId,language:'en',consent:true})).body.text,'A quiet place.');assert.equal((await post(route,{post_id:postId,language:'en',consent:true})).status,200);assert.equal(requests,1);
   await db.query("UPDATE posts SET body='Neuer Text.' WHERE id=$1",[postId]);assert.equal((await post(route,{post_id:postId,language:'en',consent:true})).status,200);assert.equal(requests,2);
   await db.query("UPDATE posts SET status='rejected' WHERE id=$1",[postId]);assert.equal((await post(route,{post_id:postId,language:'en',consent:true})).status,404);
  }finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey}
 });
 let campaign,order,session;
 const ad=compile('lib/advertising.ts');
 const provider={checkout:{sessions:{retrieve:async()=>session}},paymentIntents:{retrieve:async()=>({status:'succeeded',amount_received:1500,currency:'eur',customer:'cus_ad',latest_charge:{amount_refunded:0}})},charges:{retrieve:async()=>({id:'ch_ad',payment_intent:'pi_ad',customer:'cus_ad',amount_refunded:500})}};
 const sync=compile('lib/advertising-sync.ts',{...mocks,'@/lib/billing-provider':{stripeClient:()=>provider},'@/lib/billing-policy':compile('lib/billing-policy.ts')}).syncAdvertisingEvent;
 const event=(id,type='checkout.session.completed')=>({id,type,data:{object:{id:type==='charge.refunded'?'ch_ad':'cs_ad'}}});
 await t.test('ads require approved immutable rates and genuine current payment before delivery',async()=>{
  assert.throws(()=>ad.adSnapshot({start_date:'2026-10-22',end_date:'2026-10-22'},{daily_cents:1500,approved:false}));
  await db.query("INSERT INTO billing_customers(user_id,stripe_id) VALUES($1,'cus_ad')",[owner.id]);
  campaign=(await db.query("INSERT INTO ad_campaigns(business_id,created_by,place_id,title,copy_de,placement,start_date,end_date,status) VALUES($1,$2,$3,'Actual offer','Actual merchant ad text','home',current_date,current_date,'awaiting_commercial_setup') RETURNING id,start_date::text,end_date::text",[business,owner.id,place])).rows[0];
  const snapshot=ad.adSnapshot({...campaign,place_id:place,title:'Actual offer',copy_de:'Actual merchant ad text',placement:'home'},{daily_cents:1500,approved:true,terms_url:'https://example.org/terms'});
  order=(await db.query("INSERT INTO ad_orders(campaign_id,user_id,customer_id,snapshot,amount,provider_session_id) VALUES($1,$2,'cus_ad',$3,1500,'cs_ad') RETURNING id",[campaign.id,owner.id,JSON.stringify(snapshot)])).rows[0].id;
  session={id:'cs_ad',customer:'cus_ad',mode:'payment',currency:'eur',amount_total:1500,status:'complete',payment_status:'unpaid',payment_intent:'pi_ad'};
  await sync(event('evt_unpaid'),provider,pool);assert.equal((await db.query('SELECT state FROM ad_orders')).rows[0].state,'processing');
  session.payment_status='paid';await sync(event('evt_paid'),provider,pool);await sync(event('evt_paid'),provider,pool);assert.equal((await db.query('SELECT state FROM ad_orders')).rows[0].state,'paid');
 });
 await t.test('ad exposures are eligible, viewable/click receipts count once, moderation cancels pending receipts',async()=>{
  const route=compile('app/api/advertising/route.ts',{...mocks,'@/lib/auth':auth,'@/lib/advertising':ad});
  const get=async placement=>{const r=await route.GET({nextUrl:new URL('https://example.org/api/advertising?placement='+placement),headers:new Headers({'x-real-ip':'127.0.0.1'})});return r.json()};
  assert.equal((await get('category')).items.length,0);const served=(await get('home')).items[0];assert.ok(served.token);assert.equal(served.title,'Actual offer');
  for(let n=0;n<2;n++){assert.equal((await post(route,{token:served.token,kind:'impression'})).status,200);assert.equal((await post(route,{token:served.token,kind:'click'})).status,200)}
  const stats=(await db.query('SELECT * FROM ad_daily_stats')).rows[0];assert.equal(stats.impressions,1);assert.equal(stats.clicks,1);
  const another=(await get('home')).items[0];await db.query("UPDATE businesses SET status='pending' WHERE id=$1",[business]);assert.equal((await post(route,{token:another.token,kind:'impression'})).status,409);assert.equal((await get('home')).items.length,0);await db.query("UPDATE businesses SET status='approved' WHERE id=$1",[business]);
 });
 await t.test('ad refunds stop delivery and reordered paid sessions cannot reactivate',async()=>{
  await sync(event('evt_refund','charge.refunded'),provider,pool);assert.equal((await db.query('SELECT state FROM ad_orders')).rows[0].state,'refunded');await sync(event('evt_late_paid'),provider,pool);assert.equal((await db.query('SELECT state FROM ad_orders')).rows[0].state,'refunded');
 });
 await t.test('a refund already present at provider prevents a delayed paid checkout from activating',async()=>{
  await db.query("DELETE FROM ad_charge_refunds");await db.query("UPDATE ad_orders SET state='pending'");const refundedProvider={...provider,paymentIntents:{retrieve:async()=>({status:'succeeded',amount_received:1500,currency:'eur',customer:'cus_ad',latest_charge:{amount_refunded:1500}})}};
  await sync(event('evt_refund_first'),refundedProvider,pool);assert.equal((await db.query('SELECT state FROM ad_orders')).rows[0].state,'refunded');
 });
 await t.test('text quota is global across translation and ranking and survives service restarts',async()=>{
  const reserve=compile('lib/text-provider.ts',mocks).reserveTextRequest;for(let n=0;n<20;n++)assert.equal(await reserve(user.id,n%2?'translation':'ranking'),true);assert.equal(await reserve(user.id,'translation'),false);assert.equal(await reserve(other.id,'ranking'),true);
 });
 await t.test('assistant event budget excludes unknown prices and venue facts expire',async()=>{
  actor=user;await db.query("INSERT INTO place_attributes(place_id,field,value,source_url,checked_at,note) VALUES($1,'price_level','1','https://example.org/price',now(),'Actual price evidence')",[place]);
  const when=new Date(Date.now()+86400000),day=context.berlinDate(when);await db.query("INSERT INTO events(title,starts_at,status,price_cents,price_source_url) VALUES('Known price',$1,'published',500,'https://example.org/ticket'),('Unknown price',$1,'published',NULL,NULL)",[when.toISOString()]);
  const route=compile('app/api/recommendations/route.ts',{...mocks,'@/lib/auth':auth,'@/lib/discovery-context':context,'@/lib/text-provider':{reserveTextRequest:()=>{throw Error('No paid call consent')},textJSON:()=>{throw Error('No provider calls')}}});
  const get=async()=>{const r=await route.GET({nextUrl:new URL('https://example.org/api/recommendations?date='+day+'&budget=1&event_budget=6')});assert.equal(r.status,200);return r.json()};
  let r=await get();assert.equal(r.items.length,1);assert.equal(r.events.length,1);assert.equal(r.events[0].title,'Known price');await db.query("UPDATE place_attributes SET checked_at=now()-interval '31 days'");r=await get();assert.equal(r.items.length,0);
 });
 await t.test('ad checkout enforces ownership, current quote, pending idempotency and no redirect entitlement',async()=>{
  actor=owner;let created=0;
  await db.query("UPDATE ad_rates SET approved=true,terms_url='https://example.org/ad-terms' WHERE placement='home'");
  const next=(await db.query("INSERT INTO ad_campaigns(business_id,created_by,place_id,title,copy_de,placement,start_date,end_date,status) VALUES($1,$2,$3,'Future ad','Actual future merchant ad','home',current_date+2,current_date+2,'awaiting_commercial_setup') RETURNING id",[business,owner.id,place])).rows[0].id;
  const checkoutProvider={checkout:{sessions:{create:async data=>{created++;assert.equal(data.mode,'payment');assert.equal(data.line_items[0].price_data.unit_amount,2500);assert.equal(data.invoice_creation.enabled,true);return {id:'cs_future',url:'https://checkout.stripe.com/fixture'}},retrieve:async()=>({id:'cs_future',status:'complete',payment_status:'unpaid',payment_intent:'pi_future'}),expire:async()=>{}}}};
  const route=compile('app/api/ad-booking/route.ts',{...mocks,'@/lib/auth':auth,'@/lib/billing-policy':{billingConfigured:()=>true},'@/lib/billing-provider':{stripeClient:()=>checkoutProvider},'@/lib/advertising':ad,'@/lib/discovery-context':context});
  assert.equal((await post(route,{campaign_id:next,amount:2500})).status,409);assert.equal(created,0);
  actor=other;assert.equal((await post(route,{campaign_id:next,amount:2500,accept_terms:true})).status,409);actor=owner;
  assert.equal((await post(route,{campaign_id:next,amount:2500,accept_terms:true})).status,200);
  assert.equal((await post(route,{campaign_id:next,amount:2500,accept_terms:true})).status,200);assert.equal(created,1);
  assert.equal((await db.query('SELECT state FROM ad_orders WHERE campaign_id=$1',[next])).rows[0].state,'pending');
  await db.query("UPDATE ad_orders SET expires_at=now()-interval '1 minute' WHERE campaign_id=$1",[next]);assert.equal((await post(route,{campaign_id:next,amount:2500,accept_terms:true})).status,409);assert.equal(created,1);assert.equal((await db.query('SELECT state FROM ad_orders WHERE campaign_id=$1',[next])).rows[0].state,'processing');
 });
 }finally{await db.close()}
});

test('Twilio adapter sends only server-authorized Verify fields and rejects identity mismatch',async()=>{
 const provider=compile('lib/phone-provider.ts'),oldFetch=globalThis.fetch,keys=['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID'],old=keys.map(k=>process.env[k]);
 Object.assign(process.env,{TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'fixture-secret',TWILIO_VERIFY_SERVICE_SID:'VA'+'2'.repeat(32)});
 try{assert.equal(provider.phoneConfigured(),true);let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({sid:'VE'+'3'.repeat(32),to:'+4915123456789',status:'pending'})}};
  await provider.verifyPhone('+4915123456789');assert.equal(request.options.body.get('Channel'),'sms');assert.equal(request.options.body.get('To'),'+4915123456789');assert.ok(request.url.endsWith('/Verifications'));
  await provider.verifyPhone('+4915123456789','123456','VE'+'3'.repeat(32));assert.ok(request.url.endsWith('/VerificationCheck'));assert.equal(request.options.body.get('VerificationSid'),'VE'+'3'.repeat(32));assert.equal(request.options.body.has('To'),false);
  await assert.rejects(provider.verifyPhone('+4915000000000','123456','VE'+'3'.repeat(32)));
 }finally{globalThis.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i]})}
});
