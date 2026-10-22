import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
function compile(path,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports}
test('editorial layout and daily opening plans enforce permissions, evidence and withdrawal on PostgreSQL',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(readFileSync('db/schema.sql','utf8'));
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}},pool={connect:async()=>({query,release(){}})};
 const root=(await query("INSERT INTO users(email,password_hash,role) VALUES('editor@example.org','test','admin') RETURNING id,role")).rows[0];let actor=null;
 const place=(await query("INSERT INTO places(name,status,verification_status,activity_status,verified_at) VALUES('Verified hours venue','published','verified','operating',now()) RETURNING id")).rows[0].id;
 const auth={sessionUser:async()=>actor,trustedOrigin:()=>true},permissions=compile('lib/admin-permissions.ts'),context=compile('lib/discovery-context.ts'),layout=compile('lib/home-layout.ts');
 const mocks={'@/lib/db':{query,pool},'@/lib/auth':auth,'@/lib/admin-permissions':permissions,'@/lib/discovery-context':context,'@/lib/opening-hours':compile('lib/opening-hours.ts'),'@/lib/home-layout':layout};
 const home=compile('app/api/home-layout/route.ts',mocks),hours=compile('app/api/opening-hours/route.ts',mocks);
 const post=async(route,d)=>{const r=await route.POST({json:async()=>d});return {status:r.status,body:await r.json()}};
 const getHours=async()=>{const r=await hours.GET({nextUrl:new URL('https://example.org/api/opening-hours?place_id='+place)});return r.json()};
 await t.test('homepage saves all ordered modules, cannot inject modules and survives migrations',async()=>{
  const modules=layout.defaultHomeLayout.toReversed().map((x,i)=>({...x,enabled:i!==0}));
  assert.equal((await post(home,{modules})).status,403);actor=root;
  assert.equal((await post(home,{modules:[...modules.slice(1),modules[1]]})).status,400);
  assert.equal((await post(home,{modules})).status,200);assert.deepEqual((await (await home.GET()).json()).modules,modules);
  await db.exec(readFileSync('db/schema.sql','utf8'));assert.deepEqual((await (await home.GET()).json()).modules,modules);
  assert.equal((await query("SELECT count(*)::int AS n FROM audit_log WHERE target_type='home_layout'")).rows[0].n,1);
 });
 const data={place_id:place,day:context.berlinDate(),state:'open',periods:[{start:0,end:1440}],source_url:'https://example.org/actual-day',checked_at:new Date(Date.now()-1000).toISOString(),note:'Official hours for this actual calendar day were checked.'};
 await t.test('unknown hours stay unknown; only editorial source-backed nonoverlapping plans become current',async()=>{
  assert.equal((await getHours()).state,'unknown');actor=null;assert.equal((await post(hours,data)).status,403);actor=root;
  assert.equal((await post(hours,{...data,periods:[{start:600,end:720},{start:700,end:800}]})).status,400);
  assert.equal((await post(hours,{...data,source_url:'http://example.org'})).status,400);
  assert.equal((await post(hours,data)).status,200);assert.equal((await getHours()).state,'open');
 });
 await t.test('closed/withdrawn plans and stale operating verification remove current opening claims',async()=>{
  assert.equal((await post(hours,{...data,state:'closed',periods:[]})).status,200);assert.equal((await getHours()).state,'closed');
  assert.equal((await post(hours,{...data,state:'withdraw',periods:[]})).status,200);assert.equal((await getHours()).state,'unknown');
  await post(hours,data);await query("UPDATE places SET verified_at=now()-interval '31 days' WHERE id=$1",[place]);assert.equal((await getHours()).state,'unknown');
  const history=(await query("SELECT before_value,after_value FROM place_attribute_history WHERE field LIKE 'opening_day:%' ORDER BY id")).rows;assert.equal(history.length,4);assert.equal(history[2].after_value.state,'withdraw');assert.equal(history[2].before_value.state,'closed');
 });
 }finally{await db.close()}
});
