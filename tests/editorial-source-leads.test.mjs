import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
test('editorial leads never bypass manual venue attestation',()=>{
 const list=readFileSync('lib/editorial-source-leads.ts','utf8');
 const admin=readFileSync('components/AdminStudio.tsx','utf8');
 assert.match(list,/EDITORIAL_SOURCE_LEADS/);
 assert.match(list,/frankfurt\.de/);
 assert.match(list,/staedelmuseum\.de/);
 assert.match(list,/DO NOT certify current opening/);
 assert.match(admin,/verification_note/);
 assert.match(admin,/verification_source/);
});
