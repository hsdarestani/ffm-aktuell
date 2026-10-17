#!/usr/bin/env node
// Uses a disposable local PostgreSQL database and a locally started Next.js server.
// Never run this against production or use a real invite/password.
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

const raw=process.env.ACTIVATION_CI_DATABASE_URL;
if(!raw)throw Error('Missing ACTIVATION_CI_DATABASE_URL');
const dbURL=new URL(raw);
if(!['localhost','127.0.0.1'].includes(dbURL.hostname)||dbURL.pathname!=='/ffm_activation_ci')
 throw Error('Safety guard: admin activation tests require a disposable local DB named ffm_activation_ci');
const pool=new pg.Pool({connectionString:raw,max:2});
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const password='CI-Activation-'+randomBytes(18).toString('hex');
const email='ci-activation-'+randomBytes(7).toString('hex')+'@example.com';
const site='http://127.0.0.1:3101';
let server=null,output='';

try{
 await pool.query(await readFile('db/schema.sql','utf8'));
 await pool.query("INSERT INTO admin_invites(token_hash,expires_at) VALUES($1,now()+interval '30 minutes')",[digest]);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3101'],{
  env:{...process.env,DATABASE_URL:raw,NEXT_PUBLIC_SITE_URL:site,NODE_ENV:'production'},
  stdio:['ignore','pipe','pipe']
 });
 server.stdout.on('data',s=>{output=(output+String(s)).slice(-2500)});
 server.stderr.on('data',s=>{output=(output+String(s)).slice(-2500)});
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)break;
  try{const r=await fetch(site+'/api/health',{signal:AbortSignal.timeout(1800)});if(r.ok){ready=true;break}}catch{}
  await delay(400);
 }
 if(!ready)throw Error('Next server did not become healthy: '+output.replaceAll(password,'[redacted]'));
 const body={token,email,display_name:'CI Admin',password};
 const first=await fetch(site+'/api/admin/activate',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 const result=await first.json();
 if(first.status!==201||!result.success||result.role!=='admin')
  throw Error('Expected successful one-time activation; got HTTP '+first.status+' '+JSON.stringify(result));
 const cookie=first.headers.get('set-cookie')?.split(';')[0];
 if(!cookie?.startsWith('ffm_session='))throw Error('Admin session cookie missing');
 const me=await fetch(site+'/api/me',{headers:{Cookie:cookie}});
 const session=await me.json();
 if(me.status!==200||session.user?.role!=='admin'||session.user?.email!==email)
  throw Error('Activation did not establish a usable admin session');
 const retry=await fetch(site+'/api/admin/activate',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,email:'reused-'+email})
 });
 if(retry.status!==403)throw Error('One-time invitation could be reused (status '+retry.status+')');
 const verified=await pool.query(
  'SELECT used_at IS NOT NULL AS used FROM admin_invites WHERE token_hash=$1',[digest]);
 const saved=await pool.query('SELECT u.role, count(s.token_hash)::int AS sessions FROM users u LEFT JOIN sessions s ON s.user_id=u.id WHERE u.email=$1 GROUP BY u.id',[email]);
 const audit=await pool.query("SELECT count(*)::int AS events FROM audit_log WHERE action='admin:one-time-activation' AND target_id=(SELECT id::text FROM users WHERE email=$1)",[email]);
 if(!verified.rows[0]?.used||saved.rows[0]?.role!=='admin'||saved.rows[0]?.sessions!==1||audit.rows[0]?.events!==1)
  throw Error('Atomic database state does not match successful activation');
 console.log('PASS: admin created, audit logged, session working, invitation used exactly once');
}finally{
 if(server){
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);
 }
 await pool.end();
}
