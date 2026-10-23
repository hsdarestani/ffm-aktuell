import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import Stripe from 'stripe';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
function compile(path,mocks={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(name=>name in mocks?mocks[name]:require(name),module,module.exports);return module.exports}
const policy=compile('lib/billing-policy.ts');
test('subscription access expires and never derives from a checkout redirect or unpaid state',()=>{
 const future=new Date(Date.now()+60000).toISOString(),past=new Date(Date.now()-60000).toISOString();
 for(const status of ['active','trialing']){assert.equal(policy.subscriptionHasAccess(status,future),true);assert.equal(policy.subscriptionHasAccess(status,past),false)}
 for(const status of ['past_due','incomplete','unpaid','paused','canceled','success'])assert.equal(policy.subscriptionHasAccess(status,future),false);
 assert.equal(policy.subscriptionHasAccess('active',null),false);
 assert.throws(()=>policy.planSnapshot({status:'draft',monthly_price_cents:490},'month'));
});
test('real Stripe signature verification rejects mutation, wrong secret and stale timestamps',()=>{
 const stripe=new Stripe('sk_test_fixture'),secret='whsec_fixture',payload=JSON.stringify({id:'evt_signature',type:'customer.subscription.updated',data:{object:{id:'sub_test'}}});
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret});assert.equal(stripe.webhooks.constructEvent(payload,signature,secret).id,'evt_signature');
 assert.throws(()=>stripe.webhooks.constructEvent(payload+' ',signature,secret));assert.throws(()=>stripe.webhooks.constructEvent(payload,signature,'wrong'));
 const stale=stripe.webhooks.generateTestHeaderString({payload,secret,timestamp:Math.floor(Date.now()/1000)-600});assert.throws(()=>stripe.webhooks.constructEvent(payload,stale,secret));
});
test('billing sync executes atomic entitlement, invoice, credit and out-of-order handling on PostgreSQL',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('db/schema.sql','utf8'));
  const query=async(sql,args=[])=>{if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:1};const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}};
  const database={connect:async()=>({query,release(){}})};
  const {syncBillingEvent}=compile('lib/billing-sync.ts',{'@/lib/db':{pool:database},'@/lib/billing-provider':{stripeClient:()=>{throw Error('No external provider allowed in tests')}},'@/lib/billing-policy':policy});
  const owner=(await db.query("INSERT INTO users(email,password_hash) VALUES('billing@test.invalid','test') RETURNING id")).rows[0].id;
  const business=(await db.query("INSERT INTO businesses(owner_id,name,status) VALUES($1,'Test company','approved') RETURNING id",[owner])).rows[0].id;
  const snapshot={code:'business_premium_1',audience:'business',title_de:'Test premium',features:['analytics','additional_staff'],staff_seats:2,branch_limit:3,amount:1990,interval:'month',legal_terms_url:'https://example.org/terms'};
  await db.query("INSERT INTO billing_customers(user_id,stripe_id) VALUES($1,'cus_test')",[owner]);
  await db.query("INSERT INTO billing_prices(id,product_id,snapshot_hash,snapshot) VALUES('price_test','prod_test','hash_test',$1)",[JSON.stringify(snapshot)]);
  const checkout=(await db.query("INSERT INTO billing_checkouts(user_id,business_id,scope_key,price_id,snapshot) VALUES($1,$2,$3,'price_test',$4) RETURNING id",[owner,business,'business:'+business,JSON.stringify(snapshot)])).rows[0].id;
  const end=Math.floor(Date.now()/1000)+86400;
  let current={id:'sub_test',customer:'cus_test',metadata:{ffm_checkout_id:checkout},status:'active',items:{data:[{price:'price_test',current_period_end:end}]},latest_invoice:{id:'in_test',status:'paid',amount_due:1990},cancel_at_period_end:false},reads=0;
  const provider={creditNotes:{retrieve:async()=>({id:'cn_test',invoice:'in_test',customer:'cus_test',amount:990,currency:'eur',status:'issued'})},charges:{retrieve:async()=>({id:'ch_test',customer:'cus_test',payment_intent:'pi_test',amount:1990,amount_refunded:1990,currency:'eur'})},subscriptions:{retrieve:async()=>{reads++;return current}},invoices:{retrieve:async()=>({id:'in_test',customer:'cus_test',parent:{subscription_details:{subscription:'sub_test'}},status:'paid',amount_due:1990,amount_paid:1990,currency:'eur',hosted_invoice_url:'https://invoice.stripe.com/test',invoice_pdf:null,created:end-86400,payments:{data:[{payment:{payment_intent:'pi_test'}}]}})}};
  const event=(id,type='customer.subscription.updated',extra={})=>({id,type,data:{object:{id:type.startsWith('invoice.')?'in_test':'sub_test',customer:'cus_test',...extra}}});
  await t.test('only verified provider state activates access; repeated events do not replay provider work',async()=>{
   await syncBillingEvent(event('evt_1'),provider,database);const s=(await db.query('SELECT * FROM billing_subscriptions')).rows[0];assert.equal(s.status,'active');assert.equal(s.snapshot.staff_seats,2);assert.equal((await db.query('SELECT state FROM billing_checkouts')).rows[0].state,'completed');
   await syncBillingEvent(event('evt_1'),provider,database);assert.equal(reads,1);
  });
  await t.test('seat capacity falls immediately on expiry without deleting staff history',async()=>{
   const staff=[];for(let n=0;n<3;n++){const uid=(await db.query("INSERT INTO users(email,password_hash) VALUES($1,'test') RETURNING id",['staff'+n+'@test.invalid'])).rows[0].id;staff.push(uid);await db.query('INSERT INTO business_team_members(business_id,user_id,role,joined_at) VALUES($1,$2,\'editor\',now()+($3::int*interval \'1 second\'))',[business,uid,n])}
   assert.equal((await db.query('SELECT business_staff_allowed($1,$2) AS ok',[business,staff[0]])).rows[0].ok,true);assert.equal((await db.query('SELECT business_staff_allowed($1,$2) AS ok',[business,staff[2]])).rows[0].ok,false);
   await db.query("UPDATE billing_subscriptions SET current_period_end=now()-interval '1 second'");assert.equal((await db.query('SELECT business_staff_allowed($1,$2) AS ok',[business,staff[0]])).rows[0].ok,false);
  });
  await t.test('an old event cannot restore a provider-canceled subscription',async()=>{current={...current,status:'canceled'};await syncBillingEvent(event('evt_older'),provider,database);assert.equal((await db.query('SELECT status FROM billing_subscriptions')).rows[0].status,'canceled')});
  await t.test('an unpaid latest invoice cannot grant premium even if provider subscription says active',async()=>{current={...current,status:'active',latest_invoice:{id:'in_test',status:'open',amount_due:1990}};await syncBillingEvent(event('evt_unpaid'),provider,database);assert.equal((await db.query('SELECT status FROM billing_subscriptions')).rows[0].status,'past_due')});
  await t.test('real invoice and credit records are deduplicated',async()=>{
   current={...current,status:'active',latest_invoice:{id:'in_test',status:'paid',amount_due:1990}};await syncBillingEvent(event('evt_invoice','invoice.paid'),provider,database);
   const inv=(await db.query('SELECT * FROM billing_invoices')).rows[0];assert.equal(inv.amount_paid,1990);assert.equal(inv.user_id,owner);
   await syncBillingEvent(event('evt_credit','credit_note.created',{id:'cn_test',invoice:'in_test',amount:990,currency:'eur',status:'issued'}),provider,database);assert.equal((await db.query('SELECT amount FROM billing_credit_notes')).rows[0].amount,990);
  });
  await t.test('a full refund suspends the current period and an older active event cannot undo it',async()=>{
   await syncBillingEvent(event('evt_refund','charge.refunded',{id:'ch_test'}),provider,database);
   assert.equal((await db.query('SELECT status FROM billing_subscriptions')).rows[0].status,'refunded');
   await syncBillingEvent(event('evt_after_refund'),provider,database);assert.equal((await db.query('SELECT status FROM billing_subscriptions')).rows[0].status,'refunded');
  });
  await t.test('failed synchronization rolls back the event receipt so delivery can retry',async()=>{current={...current,items:{data:[{price:'price_unknown',current_period_end:end}]}};await assert.rejects(syncBillingEvent(event('evt_retry'),provider,database));assert.equal((await db.query("SELECT id FROM billing_webhook_events WHERE id='evt_retry'")).rows.length,0);current={...current,items:{data:[{price:'price_test',current_period_end:end}]}};await syncBillingEvent(event('evt_retry'),provider,database);assert.equal((await db.query("SELECT id FROM billing_webhook_events WHERE id='evt_retry'")).rows.length,1)});
  await t.test('defaults do not overwrite operator edits on repeated migrations',async()=>{await db.query("UPDATE subscription_plans SET monthly_price_cents=799 WHERE code='user_premium'");await db.exec(readFileSync('db/schema.sql','utf8'));assert.equal((await db.query("SELECT monthly_price_cents FROM subscription_plans WHERE code='user_premium'")).rows[0].monthly_price_cents,799)});
 }finally{await db.close()}
});
