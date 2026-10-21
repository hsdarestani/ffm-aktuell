import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const require=createRequire(import.meta.url);
const permissions=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(readFileSync('lib/admin-permissions.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
test('editorial attribute API authenticates writes, records evidence history and withdraws public facts',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
  await db.exec(readFileSync('db/schema.sql','utf8'));
  const user=(await db.query("INSERT INTO users(email,password_hash,role) VALUES('admin@test.invalid','test','admin') RETURNING id,role")).rows[0];
  const id=(await db.query("INSERT INTO places(name,status) VALUES('Actual catalog place','published') RETURNING id")).rows[0].id;
  let actor=null,origin=true;
  const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}};
  const tx={query,release(){}};
  const module={exports:{}};
  const compiled=ts.transpileModule(readFileSync('app/api/place-attributes/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',compiled)(name=>name==='@/lib/admin-permissions'?permissions:name==='@/lib/db'?{query,pool:{connect:async()=>tx}}:name==='@/lib/auth'?{sessionUser:async()=>actor,trustedOrigin:()=>origin}:require(name),module,module.exports);
  const data={place_id:id,field:'indoor',value:'yes',source_url:'https://example.org/official',checked_at:new Date().toISOString(),note:'Checked actual venue official source'};
  const post=body=>module.exports.POST({json:async()=>body});
  assert.equal((await post(data)).status,403);
  actor=user;origin=false;assert.equal((await post(data)).status,403);origin=true;
  for(const body of [{...data,field:'price_level',value:'yes'},{...data,source_url:'http://example.org'},{...data,checked_at:'2099-01-01T00:00:00.000Z'}])assert.equal((await post(body)).status,400);
  assert.equal((await post(data)).status,200);
  const get=()=>module.exports.GET({nextUrl:new URL('https://site.invalid/api/place-attributes?place_id='+id)});
  actor=null;assert.equal((await (await get()).json()).items.length,1);
  actor=user;assert.equal((await post({...data,value:null})).status,200);
  actor=null;assert.equal((await (await get()).json()).items.length,0);
  const history=await db.query('SELECT * FROM place_attribute_history ORDER BY id');assert.equal(history.rows.length,2);assert.equal(history.rows[1].before_value.value,'yes');assert.equal(history.rows[1].after_value.value,null);
 }finally{await db.close()}
});
