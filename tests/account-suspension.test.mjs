import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {NextResponse} from 'next/server.js';
const require=createRequire(import.meta.url);
function compile(path,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(n=>n in mocks?mocks[n]:require(n),m,m.exports);return m.exports}
test('account suspension invalidates real sessions, rejects fresh login and requires recent authorized moderation to restore',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(readFileSync('db/schema.sql','utf8'));
 const query=async(sql,args=[])=>{const r=await db.query(sql,args);return {...r,rowCount:/^\s*SELECT/i.test(sql)?r.rows.length:r.affectedRows}},pool={connect:async()=>({query,release(){}})};
 const users=(await query("INSERT INTO users(email,password_hash,role) VALUES('root@test.invalid','test','admin'),('target@test.invalid','test','user'),('mod@test.invalid','test','user') RETURNING id,role")).rows;
 const [root,target,mod]=users;
 const auth=compile('lib/auth.ts',{'@/lib/db':{query}}),permissions=compile('lib/admin-permissions.ts');
 async function session(user){const r=NextResponse.json({});await auth.beginSession(user.id,r);const raw=r.cookies.get('ffm_session').value;return {cookies:{get:()=>({value:raw})},headers:new Headers(),nextUrl:new URL('http://localhost:3000')}}
 const targetReq=await session(target),rootReq=await session(root);
 assert.equal((await auth.sessionUser(targetReq)).id,target.id);
 const api=compile('app/api/admin/accounts/route.ts',{'@/lib/db':{query,pool},'@/lib/auth':auth,'@/lib/admin-permissions':permissions});
 const post=(req,data)=>api.POST({...req,json:async()=>data});
 const input={id:target.id,action:'suspend',reason:'A documented moderation incident.'};
 assert.equal((await post(targetReq,input)).status,403);
 assert.equal((await post(rootReq,{...input,id:root.id})).status,409);
 assert.equal((await post(rootReq,input)).status,200);
 assert.equal(await auth.sessionUser(targetReq),null);
 assert.equal((await query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1',[target.id])).rows[0].n,0);
 await assert.rejects(()=>session(target),/Account unavailable/);
 await query("UPDATE sessions SET authenticated_at=now()-interval '6 minutes' WHERE user_id=$1",[root.id]);
 assert.equal((await post(rootReq,{...input,action:'restore'})).status,403);
 const freshRoot=await session(root);
 assert.equal((await post(freshRoot,{...input,action:'restore'})).status,200);
 assert.equal(await auth.sessionUser(targetReq),null);
 assert.equal((await auth.sessionUser(await session(target))).id,target.id);
 await query("INSERT INTO admin_role_assignments(user_id,role_code,granted_by) VALUES($1,'moderation',$2)",[mod.id,root.id]);
 const modReq=await session(mod);
 assert.equal((await post(modReq,{...input,id:root.id})).status,403);
 assert.equal((await post(modReq,input)).status,200);
 assert.equal((await query("SELECT count(*)::int AS n FROM audit_log WHERE target_type='user' AND action LIKE 'account:%'")).rows[0].n,3);
 const content=compile('app/api/admin/content/route.ts',{'@/lib/db':{query,pool},'@/lib/auth':auth,'@/lib/admin-permissions':permissions});
 for(const type of ['post','review','comment','deal','place']){const r=await content.GET({...freshRoot,nextUrl:new URL('http://localhost:3000/api/admin/content?type='+type+'&status=pending')});assert.equal(r.status,200)}
 const postId=(await query("INSERT INTO posts(user_id,body,status) VALUES($1,'Public actual contribution','published') RETURNING id",[root.id])).rows[0].id;
 const change=d=>content.POST({...freshRoot,json:async()=>({type:'post',id:postId,reason:'Documented content moderation reason.',...d})});
 assert.equal((await change({action:'remove'})).status,200);
 assert.equal((await query('SELECT status FROM posts WHERE id=$1',[postId])).rows[0].status,'rejected');
 assert.equal((await change({action:'restore'})).status,200);
 assert.equal((await query('SELECT status FROM posts WHERE id=$1',[postId])).rows[0].status,'pending');
 assert.equal((await change({action:'restore'})).status,409);
 assert.equal((await change({action:'remove',type:'users;DROP'})).status,400);
 const unauthorized=await content.POST({...targetReq,json:async()=>({type:'post',id:postId,action:'remove',reason:'Unauthorized user must never change content.'})});assert.equal(unauthorized.status,403);
 assert.equal((await query("SELECT count(*)::int AS n FROM audit_log WHERE target_type='post' AND action LIKE 'content:%'")).rows[0].n,2);
 await db.exec(readFileSync('db/schema.sql','utf8'));assert.equal(await auth.sessionUser(targetReq),null);
 }finally{await db.close()}
});
