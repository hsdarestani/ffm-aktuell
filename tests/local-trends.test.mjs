import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const mod={exports:{}};new Function('exports',ts.transpileModule(readFileSync('lib/local-trends.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports);
test('local trends require independent opted-in recent accounts and current public venue evidence',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec(readFileSync('db/schema.sql','utf8'));
 const users=(await db.query("INSERT INTO users(email,password_hash) SELECT 'trend'||i||'@test.invalid','test' FROM generate_series(1,4) i RETURNING id")).rows;
 const place=(await db.query("INSERT INTO places(name,category,district,status,verification_status,activity_status,verified_at) VALUES('Actual venue','Cafés','Westend','published','verified','operating',now()) RETURNING id")).rows[0].id;
 const post=(await db.query("INSERT INTO posts(user_id,place_id,body,status) VALUES($1,$2,'Public actual experience','published') RETURNING id",[users[0].id,place])).rows[0].id;
 for(const u of users){await db.query('INSERT INTO user_preferences(user_id,share_activity) VALUES($1,true)',[u.id]);await db.query('INSERT INTO post_likes(user_id,post_id) VALUES($1,$2)',[u.id,post])}
 const trends=(district='',category='')=>db.query(mod.exports.localTrendsQuery,[district,category]);
 assert.equal((await trends()).rows[0].accounts,3);assert.equal((await trends('Nordend')).rows.length,0);assert.equal((await trends('Westend','Cafés')).rows.length,1);
 await db.query('UPDATE user_preferences SET share_activity=false WHERE user_id=$1',[users[1].id]);assert.equal((await trends()).rows.length,0);
 await db.query('UPDATE user_preferences SET share_activity=true WHERE user_id=$1',[users[1].id]);
 await db.query('UPDATE users SET suspended_at=now() WHERE id=$1',[users[1].id]);assert.equal((await trends()).rows.length,0);
 await db.query('UPDATE users SET suspended_at=NULL WHERE id=$1',[users[1].id]);
 await db.query("UPDATE post_likes SET created_at=now()-interval '8 days' WHERE user_id=$1",[users[1].id]);assert.equal((await trends()).rows.length,0);
 await db.query('UPDATE post_likes SET created_at=now()');await db.query("UPDATE posts SET status='rejected' WHERE id=$1",[post]);assert.equal((await trends()).rows.length,0);
 await db.query("UPDATE posts SET status='published' WHERE id=$1",[post]);await db.query("UPDATE places SET verified_at=now()-interval '31 days' WHERE id=$1",[place]);assert.equal((await trends()).rows.length,0);
 }finally{await db.close()}
});
