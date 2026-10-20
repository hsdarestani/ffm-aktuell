import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/event-calendar.ts','utf8');
const {eventCalendarContent,confirmedEventEnd}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const event={id:'real-event',title:'Ausstellung',venue:'Frankfurt',description_de:'Echte Veranstaltung',starts_at:'2026-10-25T01:30:00+02:00',ends_at:'2026-10-25T03:30:00+01:00'};
const now=new Date('2026-10-21T10:00:00Z');
const unfold=content=>content.replace(/\r\n /g,'');
test('calendar uses organizer end across the German daylight saving transition',()=>{
 const content=unfold(eventCalendarContent(event,now));
 assert.ok(content.includes('DTSTART:20261024T233000Z\r\n'));
 assert.ok(content.includes('DTEND:20261025T023000Z\r\n'));
 assert.ok(!content.includes('Endzeit nicht bestätigt'));
 assert.ok(content.includes('TRIGGER:-PT60M'));
});
test('missing, invalid and earlier end times are explicitly provisional one hour blocks',()=>{
 for(const ends_at of [null,'bad','2026-10-24T00:00:00Z']){
  const item={...event,ends_at};assert.equal(confirmedEventEnd(item),null);
  const content=unfold(eventCalendarContent(item,now));
  assert.ok(content.includes('DTEND:20261025T003000Z'));
  assert.ok(content.includes('Endzeit nicht bestätigt. Kalenderblock: 1 Stunde.'));
 }
 assert.equal(eventCalendarContent({...event,starts_at:'bad'},now),null);
});
test('calendar text cannot inject properties and Unicode lines stay within 75 UTF-8 octets',()=>{
 const content=eventCalendarContent({...event,title:'Ä🎉'.repeat(50)+'\rATTENDEE:evil',description_de:'Zeile 1\r\nZeile 2; Ort, Text\\Ende'},now);
 for(const line of content.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
 assert.ok(!content.includes('\rATTENDEE:'));
 const plain=unfold(content);assert.ok(plain.includes('\\nATTENDEE:evil'));
 assert.ok(plain.includes('Zeile 1\\nZeile 2\\; Ort\\, Text\\\\Ende'));
 assert.equal(plain.match(/BEGIN:VEVENT/g).length,1);
 assert.ok(!plain.includes('�'));
});
