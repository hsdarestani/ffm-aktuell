import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const schema=read('db/schema.sql'),api=read('app/api/[[...path]]/route.ts'),
 page=read('app/page.tsx'),button=read('components/FollowButton.tsx'),
 integration=read('scripts/ci-admin-activation-e2e.mjs'),style=read('app/following.css');

test('private relationships and cascading deletion, without public profiles',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS user_follows/);
 assert.match(schema,/PRIMARY KEY\(follower_id,followed_id\)/);
 assert.match(schema,/CHECK\(follower_id<>followed_id\)/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS business_follows/);
 assert.match(schema,/PRIMARY KEY\(follower_id,business_id\)/);
 assert.match(schema,/REFERENCES users\(id\) ON DELETE CASCADE/);
 assert.match(schema,/REFERENCES businesses\(id\) ON DELETE CASCADE/);
});
test('only published authors and approved real public businesses may be followed',()=>{
 assert.match(api,/if\(method==='POST'&&path==='follows'\)/);
 assert.match(api,/rate\(req,'follow'\)/);
 assert.match(api,/target_type:z.enum\(\['user','business'\]\)/);
 assert.match(api,/if\(b.target_id===u.id\)return bad\('Cannot follow yourself'\)/);
 assert.match(api,/AND status='published'\) ON CONFLICT DO NOTHING/);
 assert.match(api,/b.status='approved' AND b.owner_id!=\$1/);
 assert.match(api,/EXISTS\(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published'/);
 assert.match(api,/ON CONFLICT DO NOTHING/);
});
test('following feed is personal, has no unpublished posts and uses exact follow identity',()=>{
 const i=api.indexOf("if(method==='GET'&&path==='posts'");
 const j=api.indexOf("if(method==='GET'&&path==='follows'",i);
 const section=api.slice(i,j);
 assert.match(section,/following&&!user/);
 assert.match(section,/p.status='published'/);
 assert.match(section,/uf.followed_id=p.user_id/);
 assert.match(section,/bf.business_id=bu.id/);
 assert.match(section,/bu.status='approved'/);
 assert.match(section,/p.user_id AS author_id/);
 assert.match(section,/AS following_author/);
 assert.match(api,/if\(method==='GET'&&path==='follows'\)[\s\S]{0,100}const u=need\(user\)/);
});
test('no public profile link; actions are tiny and accessible',()=>{
 assert.match(button,/aria-pressed=\{following\}/);
 assert.match(button,/if\(!loggedIn\)\{onLogin\(\);return;\}/);
 assert.match(page,/<FollowButton key=\{p.author_id\}/);
 assert.match(page,/<FollowButton key=\{selected.business_id\}/);
 assert.match(page,/followingOnly\?posts:\[\.\.\.posts,\.\.\.vorschauPosts\]/);
 assert.match(page,/posts\?scope=/);
 assert.match(style,/@media\(max-width:540px\)/);
});
test('real-db CI covers follow privacy, auth, feed gating, person and business',()=>{
 assert.match(integration,/await get\('posts\?scope=following',reader\)/);
 assert.match(integration,/await get\('follows'\)/);
 assert.match(integration,/await post\('follows',reader/);
 assert.match(integration,/businessPost/);
 assert.match(integration,/Pending business was followable/);
 assert.match(integration,/Pending business post leaked/);
});
