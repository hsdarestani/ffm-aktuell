import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=path=>readFileSync(path,'utf8');
const schema=get('db/schema.sql'),api=get('app/api/[[...path]]/route.ts'),page=get('app/page.tsx'),
 profile=get('components/ProfileSettings.tsx'),actions=get('components/EventActions.tsx'),
 e2e=get('scripts/ci-admin-activation-e2e.mjs'),css=get('app/account-events.css');
test('events are private and only published events may be bookmarked',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS event_favorites/);
 assert.match(schema,/PRIMARY KEY\(user_id,event_id\)/);
 assert.match(schema,/ON DELETE CASCADE/);
 assert.match(api,/if\(method==='POST'&&path==='event-favorites'\)/);
 assert.match(api,/status='published' AND e.starts_at>=now\(\)-interval '1 day'/);
 assert.match(api,/ON CONFLICT DO NOTHING/);
 assert.match(api,/if\(method==='GET'&&path==='event-favorites'\)/);
 assert.match(api,/const u=need\(user\)/);
});
test('calendar exporter uses real UTC time, labels unknown event end and explicit reminder',()=>{
 const calendar=get('lib/event-calendar.ts');
 assert.match(calendar,/BEGIN:VCALENDAR/);
 assert.match(calendar,/DTSTART:/);
 assert.match(calendar,/DTEND:/);
 assert.match(calendar,/TRIGGER:-PT60M/);
 assert.match(calendar,/Endzeit nicht bestätigt/);
 assert.match(calendar,/new Date\(event.starts_at\)/);
 assert.match(actions,/event.demo/);
 assert.match(actions,/navigator.clipboard|URL.createObjectURL/);
});
test('profile preferences opt-in and no public activity by default',()=>{
 assert.match(schema,/CREATE TABLE IF NOT EXISTS user_preferences/);
 assert.match(schema,/share_activity boolean NOT NULL DEFAULT false/);
 assert.match(schema,/notify_events boolean NOT NULL DEFAULT false/);
 assert.match(api,/if\(method==='POST'&&path==='me\/preferences'\)/);
 assert.match(api,/new Set\(v\)/);
 assert.match(profile,/share_activity/);
 assert.match(profile,/<PushSettings/);
 assert.match(profile,/Für Push zusätzlich dieses Gerät/);
});
test('export excludes stored password hashes and deletions require exact confirmation',()=>{
 const a=api.slice(api.indexOf("if(method==='GET'&&path==='me/export'"),api.indexOf("if(method==='GET'&&path==='places'"));
 assert.match(a,/Cache-Control','no-store, private'/);
 assert.match(a,/confirmation:z.literal\('KONTO LÖSCHEN'\)/);
 assert.match(a,/verifyPassword\(b.password,saved.rows\[0\].password_hash\)/);
 assert.match(a,/Administrators need an editorial handover/);
 assert.match(a,/Transfer or close your verified business/);
 assert.match(a,/DELETE FROM users WHERE id=\$1/);
 assert.doesNotMatch(a,/SELECT \* FROM users/);
 assert.match(profile,/window.confirm/);
});
test('event cards and profile are directly reachable without dense nav',()=>{
 assert.match(page,/<EventsExplorer /);assert.match(get('components/EventsExplorer.tsx'),/<EventActions event=\{e\}/);
 assert.match(page,/page==='profile'&&<>/);
 assert.match(page,/<ProfileSettings user=/);
 assert.match(page,/<MediaRightsPanel onNotice=/);
 assert.match(page,/Mein Profil/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(e2e,/Guest could read private event bookmarks/);
 assert.match(e2e,/Account deletion accepted bad password/);
});

