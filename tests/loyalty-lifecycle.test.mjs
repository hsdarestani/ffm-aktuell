import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
function compile(path,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(name=>name in mocks?mocks[name]:require(name),m,m.exports);return m.exports}
test('business-confirmed visits and loyalty rewards are private, scoped, rate-limited and single-use',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('db/schema.sql','utf8'));
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}};
  const pool={connect:async()=>({query,release(){}})};
  const people=[];for(const label of ['owner','customer','outsider','admin'])people.push((await db.query("INSERT INTO users(email,password_hash,role) VALUES($1,'test',$2) RETURNING id,email,role",[label+'@test.invalid',label==='admin'?'admin':'user'])).rows[0]);
  const [owner,customer,outsider,root]=people;
  const business=(await db.query("INSERT INTO businesses(owner_id,name,status) VALUES($1,'Actual test business','approved') RETURNING id",[owner.id])).rows[0].id;
  const place=(await db.query("INSERT INTO places(business_id,name,status) VALUES($1,'Actual venue','published') RETURNING id",[business])).rows[0].id;
  let actor=owner;
  const auth={sessionUser:async()=>actor,trustedOrigin:()=>true};
  const perms=compile('lib/admin-permissions.ts'),ledger=compile('lib/loyalty-ledger.ts');
  const resolveBusinessEditor=async(u,id)=>(await query("SELECT b.id,b.status FROM businesses b JOIN places p ON p.business_id=b.id LEFT JOIN business_team_members tm ON tm.business_id=b.id AND tm.user_id=$1 WHERE p.id=$2 AND (b.owner_id=$1 OR (tm.role='editor' AND business_staff_allowed(b.id,$1) AND (tm.all_places OR p.id=ANY(tm.place_ids))))",[u.id,id])).rows[0]||null;
  const route=compile('app/api/loyalty/route.ts',{'@/lib/db':{query,pool},'@/lib/auth':auth,'@/lib/admin-permissions':perms,'@/lib/loyalty-ledger':ledger,'@/lib/business-team':{resolveBusinessEditor}});
  const post=async data=>{const r=await route.POST({json:async()=>data});return {status:r.status,body:await r.json()}};
  const get=async search=>{const r=await route.GET({nextUrl:new URL('https://site.invalid/api/loyalty'+(search||''))});return {status:r.status,body:await r.json()}};
  const save={action:'save_program',business_id:business,goal:2,minimum_hours:1,reward:'Test reward provided by the actual test business',terms_url:'https://example.org/loyalty-terms'};
  actor=outsider;assert.equal((await post(save)).status,403);actor=owner;assert.equal((await post(save)).status,200);
  const program=(await get('?scope=business&business_id='+business)).body.program;
  assert.equal(program.status,'pending');actor=customer;assert.equal((await post({action:'review_program',id:program.id,approve:true,reason:'Unauthorized publication attempt'})).status,403);
  actor=root;assert.equal((await post({action:'review_program',id:program.id,approve:true,reason:'Test reward and conditions reviewed'})).status,200);
  await t.test('owners cannot mint self-confirmed visit evidence',async()=>{actor=owner;assert.equal((await post({action:'request_visit',place_id:place})).status,403)});
  actor=customer;const first=await post({action:'request_visit',place_id:place});assert.equal(first.status,201);assert.match(first.body.code,/^[A-F0-9]{24}$/);
  const pending=(await db.query('SELECT * FROM visit_confirmation_requests')).rows[0];assert.notEqual(pending.token_hash,first.body.code);assert.equal(pending.token_hash.length,64);
  actor=outsider;assert.equal((await post({action:'confirm',code:first.body.code})).status,403);
  actor=owner;assert.equal((await post({action:'confirm',code:first.body.code})).status,200);assert.equal((await post({action:'confirm',code:first.body.code})).status,409);
  actor=customer;assert.equal((await post({action:'request_visit',place_id:place})).status,409);
  const firstCard=(await get()).body.cards[0];assert.equal(firstCard.visits,1);assert.equal(firstCard.goal,2);
  await t.test('later program edits do not change an existing card goal, benefit or interval',async()=>{
   actor=owner;assert.equal((await post({...save,goal:5,minimum_hours:24,reward:'New reward only for a future card cycle'})).status,200);
   actor=root;assert.equal((await post({action:'review_program',id:program.id,approve:true,reason:'Updated future rules reviewed'})).status,200);
   const card=(await db.query('SELECT * FROM loyalty_cards WHERE id=$1',[firstCard.id])).rows[0];assert.equal(card.goal,2);assert.equal(card.minimum_hours,1);assert.equal(card.reward,save.reward);
  });
  await db.query("UPDATE confirmed_visits SET confirmed_at=now()-interval '2 hours' WHERE user_id=$1",[customer.id]);
  actor=customer;const second=await post({action:'request_visit',place_id:place});assert.equal(second.status,201);actor=owner;assert.equal((await post({action:'confirm',code:second.body.code})).status,200);
  actor=customer;const ready=(await get()).body.cards[0];assert.equal(ready.visits,2);const reward=await post({action:'request_reward',card_id:ready.id,place_id:place});assert.equal(reward.status,201);
  actor=outsider;assert.equal((await post({action:'confirm',code:reward.body.code})).status,403);actor=owner;assert.equal((await post({action:'confirm',code:reward.body.code})).status,200);assert.equal((await post({action:'confirm',code:reward.body.code})).status,409);
  actor=customer;const wallet=(await get()).body;assert.equal(wallet.cards.filter(c=>c.redeemed_at).length,1);const next=wallet.cards.find(c=>!c.redeemed_at);assert.equal(next.goal,5);assert.equal(next.visits,0);assert.match(next.reward,/New reward/);
  actor=outsider;assert.equal((await get()).body.cards.length,0);assert.equal((await get()).body.visits.length,0);
  await t.test('account deletion removes private visit/card data and tokens',async()=>{await db.query('DELETE FROM users WHERE id=$1',[customer.id]);for(const table of ['confirmed_visits','loyalty_cards','visit_confirmation_requests'])assert.equal((await db.query('SELECT * FROM '+table)).rows.length,0)});
 }finally{await db.close()}
});
