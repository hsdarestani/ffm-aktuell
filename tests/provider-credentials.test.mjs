import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=p=>readFileSync(p,'utf8');
function compile(p,mocks={}){
 const output=ts.transpileModule(source(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};new Function('require','module','exports',output)(name=>name in mocks?mocks[name]:require(name),module,module.exports);return module.exports;
}
test('provider keys are encrypted with authenticated encryption and secret-key rotation makes old ciphertext unusable',()=>{
 const old=process.env.SESSION_SECRET;
 try{
  process.env.SESSION_SECRET='ffm-test-private-application-session-secret-must-never-be-committed';
  const {encryptCredential,decryptCredential}=compile('lib/provider-credentials.ts',{'@/lib/db':{query:async()=>({rows:[]})}});
  const a=encryptCredential('an-example-credential-for-tests-only'),b=encryptCredential('an-example-credential-for-tests-only');
  assert.notEqual(a,b,'unique random authenticated nonces');
  assert.equal(decryptCredential(a),'an-example-credential-for-tests-only');
  assert.ok(!a.includes('an-example-credential'));
  assert.throws(()=>decryptCredential(a.slice(0,-8)+'AAAAAAAA'));
  process.env.SESSION_SECRET='rotated-application-key-that-is-long-enough-to-protect-secrets';
  assert.throws(()=>decryptCredential(a));
 }finally{if(old===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=old}
});
test('remote configuration only accepts a precisely authorized FFM workflow and named keys',()=>{
 const handler=source('app/api/internal/github-provider-sync/route.ts');
 for(const value of ['jwtVerify','RS256','repository_id','workflow_ref','jti','service_credentials','github_oidc_receipts','encryptCredential','OPENAI_API_KEY','OPENWEATHER_API_KEY'])assert.ok(handler.includes(value),value);
 assert.match(handler,/maxTokenAge:'3m'/);
 assert.match(handler,/hsdarestani@45485005\/ffm-aktuell@1423074676/);
 assert.match(handler,/repository_owner_id/);
 assert.match(handler,/\bCOMMIT\b/);
 assert.doesNotMatch(handler,/console\.log|process\.env\.OPENAI_API_KEY|process\.env\.OPENWEATHER_API_KEY/);
 const workflow=source('.github/workflows/ffm-provider-sync.yml');
 assert.match(workflow,/id-token: write/);
 assert.match(workflow,/secrets\.OPENAI_API_KEY/);
 assert.match(workflow,/secrets\.OPENWEATHER_API_KEY/);
 assert.doesNotMatch(workflow,/echo "\$OPENAI_API_KEY"|echo "\$OPENWEATHER_API_KEY"|set -x/);
 const schema=source('db/schema.sql');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS service_credentials/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS github_oidc_receipts/);
});
