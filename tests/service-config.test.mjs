import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('service configuration preserves database secrets, prevents injection and never logs values',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ffm-config-'));const env=join(dir,'.env'),input=join(dir,'config.json');
 try{
  writeFileSync(env,'POSTGRES_PASSWORD=existing-password\nSESSION_SECRET=existing-session\nOPENAI_API_KEY=old\n');
  const secret='key$literal#`$(echo stolen)`';writeFileSync(input,JSON.stringify({OPENAI_API_KEY:secret,APPLE_PRIVATE_KEY:'line1\nline2'}));
  const r=spawnSync('python3',['scripts/apply-service-config.py',env,input],{encoding:'utf8'});
  assert.equal(r.status,0);assert.ok(!r.stdout.includes(secret));assert.ok(!r.stderr.includes(secret));
  const content=readFileSync(env,'utf8');assert.ok(content.includes('POSTGRES_PASSWORD=existing-password'));assert.ok(content.includes("OPENAI_API_KEY='"+secret+"'"));assert.ok(content.includes("APPLE_PRIVATE_KEY='line1\\nline2'"));assert.equal(statSync(env).mode&0o777,0o600);
  writeFileSync(input,JSON.stringify({DATABASE_URL:'attacker'}));const invalid=spawnSync('python3',['scripts/apply-service-config.py',env,input],{encoding:'utf8'});assert.equal(invalid.status,1);assert.equal(readFileSync(env,'utf8'),content);
  writeFileSync(input,JSON.stringify({OPENAI_API_KEY:'new\nPOSTGRES_PASSWORD=attacker'}));assert.equal(spawnSync('python3',['scripts/apply-service-config.py',env,input]).status,1);assert.equal(readFileSync(env,'utf8'),content);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('generated VAPID keys sign real Web Push requests',async()=>{
 const r=spawnSync(process.execPath,['scripts/bootstrap-web-push.mjs'],{encoding:'utf8'});assert.equal(r.status,0);const config=JSON.parse(r.stdout);
 const webpush=await import('web-push');
 const headers=webpush.default.getVapidHeaders('https://fcm.googleapis.com',config.WEB_PUSH_SUBJECT,config.WEB_PUSH_PUBLIC_KEY,config.WEB_PUSH_PRIVATE_KEY,'aes128gcm');
 assert.ok(headers.Authorization.startsWith('vapid '));assert.equal(config.PUSH_WORKER_TOKEN.length,64);
});
