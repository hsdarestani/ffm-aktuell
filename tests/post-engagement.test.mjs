import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
const schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts'),page=read('app/page.tsx');
const ui=read('components/PostEngagement.tsx'),admin=read('components/AdminStudio.tsx');
const ci=read('scripts/ci-admin-activation-e2e.mjs'),css=read('app/post-engagement.css');
const section=(begin,end)=>api.slice(api.indexOf(begin),api.indexOf(end,api.indexOf(begin)));
test('persistent likes and replies target real posts and belong to real users',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS post_likes/);
 assert.match(schema,/PRIMARY KEY\(user_id,post_id\)/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS post_comments/);
 assert.match(schema,/CHECK\(char_length\(body\) BETWEEN 3 AND 800\)/);
 assert.match(schema,/CHECK\(status IN \('pending','published','rejected'\)\)/);
});
test('public feed counts published replies only and session-specific likes',()=>{
 const code=section("if(method==='GET'&&path==='posts'","if(method==='GET'&&path==='comments'");
 assert.match(code,/SELECT count\(\*\)::int FROM post_likes/);
 assert.match(code,/c.status='published'/);
 assert.match(code,/EXISTS\(SELECT 1 FROM post_likes/);
 assert.match(code,/l.user_id=\$1/);
 assert.match(code,/p.status='published'/);
});
test('reply list and like writes check published target, never demo posts',()=>{
 const list=section("if(method==='GET'&&path==='comments'","if(method==='GET'&&path==='deals'");
 assert.match(list,/post_id=\$1 AND c.status='published'/);
 assert.match(list,/posts WHERE id=\$1 AND status='published'/);
 const likes=section("if(method==='POST'&&path==='post-likes'","if(method==='POST'&&path==='comments'");
 assert.match(likes,/rate\(req,'post-like'\)/);
 assert.match(likes,/const u=need\(user\)/);
 assert.match(likes,/INSERT INTO post_likes/);
 assert.match(likes,/ON CONFLICT DO NOTHING/);
 assert.match(likes,/DELETE FROM post_likes/);
 const comments=section("if(method==='POST'&&path==='comments'","if(method==='POST'&&path==='posts'");
 assert.match(comments,/rate\(req,'post-comment'\)/);
 assert.match(comments,/z.string\(\)\.trim\(\)\.min\(3\)\.max\(800\)/);
 assert.match(comments,/INSERT INTO post_comments/);
 assert.match(comments,/comment:submitted/);
});
test('admin moderation supports real comments and cannot approve demo posts',()=>{
 assert.match(api,/comment:\['post_comments','published'\]/);
 assert.match(api,/SELECT c.id,c.body,LEFT\(p.body,80\) AS title FROM post_comments/);
 assert.match(admin,/key:'comments',title:'Kommentare'/);
});
test('accessible compact interactions are only attached to non-demo posts',()=>{
 assert.match(page,/p.demo\?<span className="v3-demo-label"/);
 assert.match(page,/<PostEngagement postId=\{p.id\}/);
 assert.match(ui,/aria-pressed=\{likedNow\}/);
 assert.match(ui,/aria-expanded=\{expanded\}/);
 assert.match(ui,/id=\{'ffm-comment-'\+postId\}/);
 assert.match(ui,/Kommentare/);
 assert.match(css,/@media\(max-width:540px\)/);
});
test('database-backed CI covers pending, approval and aggregate counts',()=>{
 assert.match(ci,/post\('post-likes'/);
 assert.match(ci,/post\('comments'/);
 assert.match(ci,/get\('comments\?post_id='/);
 assert.match(ci,/type:'comment'/);
 assert.match(ci,/Unapproved comment leaked/);
});
