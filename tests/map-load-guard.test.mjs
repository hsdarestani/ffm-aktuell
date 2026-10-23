import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/map-load-guard.ts','utf8');
const {createMapLoadGuard}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
function scenario(){
 let now=0,seq=0;const timers=new Map(),events=[];
 const guard=createMapLoadGuard({
  schedule:(fn,delay)=>{const id=++seq;timers.set(id,{at:now+delay,fn});return id},
  cancel:id=>timers.delete(id),
  onVectorTimeout:()=>{events.push('raster');guard.useRaster()},
  onRasterTimeout:()=>{events.push('dom');guard.dispose()}
 });
 const advance=ms=>{const target=now+ms;for(;;){const pending=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;now=pending[1].at;timers.delete(pending[0]);pending[1].fn()}now=target};
 return {guard,events,advance,timers};
}
test('silent style request recovers without ever receiving style.load',()=>{
 const s=scenario();s.advance(17999);assert.deepEqual(s.events,[]);
 s.advance(1);assert.deepEqual(s.events,['raster']);
 s.advance(10000);assert.deepEqual(s.events,['raster','dom']);assert.equal(s.timers.size,0);
});
test('real vector tiles cancel recovery and a later raster switch has its own deadline',()=>{
 const s=scenario();s.advance(500);s.guard.ready();s.advance(30000);assert.deepEqual(s.events,[]);
 s.guard.useRaster();s.advance(9999);assert.deepEqual(s.events,[]);s.advance(1);assert.deepEqual(s.events,['dom']);
});
test('raster tiles cancel their deadline and repeated stage notifications cannot extend it',()=>{
 const s=scenario();s.guard.useRaster();s.advance(9000);s.guard.useRaster();s.advance(1000);assert.deepEqual(s.events,['dom']);
 const ok=scenario();ok.guard.useRaster();ok.advance(200);ok.guard.ready();ok.advance(60000);assert.deepEqual(ok.events,[]);
});
test('unmount or retry disposes all pending recovery callbacks',()=>{
 const s=scenario();s.guard.dispose();s.guard.useRaster();s.advance(60000);assert.deepEqual(s.events,[]);assert.equal(s.timers.size,0);
});
