import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/event-calendar.ts','utf8');
const {calendarMonthSelection,eventCalendarDate}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
test('previous month selects a date in that month instead of rendering the current month week',()=>{
 assert.deepEqual(calendarMonthSelection('2026-10-01',-1,'2026-10-23'),{month:'2026-09-01',selected:'2026-09-01'});
 assert.deepEqual(calendarMonthSelection('2026-09-01',1,'2026-10-23'),{month:'2026-10-01',selected:'2026-10-23'});
});
test('calendar navigation crosses years and leap-month boundaries',()=>{
 assert.deepEqual(calendarMonthSelection('2027-01-01',-1,'2026-10-23'),{month:'2026-12-01',selected:'2026-12-01'});
 assert.deepEqual(calendarMonthSelection('2028-01-01',1,'2026-10-23'),{month:'2028-02-01',selected:'2028-02-01'});
});
test('Berlin date is canonical ISO across midnight and daylight saving transitions',()=>{
 assert.equal(eventCalendarDate(new Date('2026-10-24T22:30:00Z')),'2026-10-25');
 assert.equal(eventCalendarDate(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
 assert.equal(eventCalendarDate(new Date('2026-01-01T00:30:00Z')),'2026-01-01');
});
