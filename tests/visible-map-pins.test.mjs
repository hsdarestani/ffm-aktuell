import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/visible-map-pins.ts','utf8');
const {visibleMapPins,isRawMapId}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const pins=Array.from({length:160},(_,n)=>({id:'node/'+n,left:30+(n%10)*35,top:80+Math.floor(n/10)*43}));
test('dense mobile map keeps labels separated and clear of controls',()=>{
 const visible=visibleMapPins(pins,390,700);
 assert.ok(visible.length>0&&visible.length<=9);
 for(const pin of visible){
  assert.ok(pin.left>=62&&pin.left<=328&&pin.top>=150&&pin.top<=580);
  for(const other of visible)if(pin!==other)assert.ok(Math.abs(pin.left-other.left)>=112||Math.abs(pin.top-other.top)>=38);
 }
 assert.deepEqual(visible,visibleMapPins([...pins].reverse(),390,700));
});
test('selected on-screen pin is retained and invalid/off-screen points never appear',()=>{
 const selected=pins.find(p=>p.left===170&&p.top===252);
 assert.ok(selected);
 const visible=visibleMapPins(pins,390,700,selected.id);assert.equal(visible[0].id,selected.id);
 assert.deepEqual(visibleMapPins([{id:'a',left:NaN,top:200},{id:'b',left:100,top:-20}],390,700),[]);
});
test('actual OSM identifiers carry the unverified marker styling',()=>{
 for(const id of ['node/1','way/2','relation/3','osm:node/4'])assert.equal(isRawMapId(id),true);
 assert.equal(isRawMapId('00000000-0000-4000-8000-000000000001'),false);
});
