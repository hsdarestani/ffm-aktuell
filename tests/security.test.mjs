import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('no published status bypass in place queries',()=>{
 const s=readFileSync('app/api/[[...path]]/route.ts','utf8');
 assert.match(s,/status='published'/);
 assert.match(s,/trustedOrigin\(req\)/);
 assert.match(s,/admin\/review/);
});
test('database owns session and moderation state',()=>{
 const sql=readFileSync('db/schema.sql','utf8');
 for(const table of ['users','sessions','businesses','places','events','news','posts','favorites','claims','deals','audit_log']){
   assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS '+table));
 }
});
test('session cookie settings are hardened',()=>{
 const s=readFileSync('lib/auth.ts','utf8');
 assert.match(s,/httpOnly:true/);
 assert.match(s,/sameSite:'lax'/);
});
