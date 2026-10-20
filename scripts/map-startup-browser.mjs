// Production-built app, isolated HTTP fixtures, real Chromium + MapLibre.
// No production records are created. Stalled upstreams exercise actual recovery.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const port=3104,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs=(logs+b).slice(-3000));server.stderr.on('data',b=>logs=(logs+b).slice(-3000));
let browser;
try{
 let healthy=false;
 for(let n=0;n<60;n++){
  if(server.exitCode!==null)throw Error('Test server exited: '+logs);
  try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok){healthy=true;break}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(healthy,'Production server did not start: '+logs);
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await mkdir('artifacts/map-startup',{recursive:true});
 async function context(noWebGL=false,signedIn=false){
  const calls=[];let eventSaved=true;
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  await ctx.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let body=path==='/api/me'?{user:signedIn?{id:'00000000-0000-4000-8000-000000000001',email:'browser-test@example.com',display_name:'Test',role:'user'}:null}:path==='/api/discovery-map'?{items:[]}:{items:[],upload_enabled:false};
   if(path==='/api/event-favorites'){
    if(route.request().method()==='POST'){
     const request=route.request().postDataJSON();calls.push(request);eventSaved=request.active;body={saved:eventSaved};
    }else body={items:eventSaved?[{id:'00000000-0000-4000-8000-000000000002',title:'Kalendertest',venue:'Testort Frankfurt',description_de:'Browser Test',starts_at:'2026-11-01T17:00:00+01:00',ends_at:'2026-11-01T20:00:00+01:00',ticket_url:null}]:[]};
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  if(noWebGL)await ctx.addInitScript(()=>{
   const original=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:original.call(this,type,...args)};
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  return {ctx,page,errors,calls};
 }
 {
  const {ctx,page,errors}=await context(true);
  await ctx.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await ctx.route('**/api/discovery-map?*',route=>route.fulfill({json:{items:Array.from({length:100},(_,n)=>({id:'node/'+(70000+n),name:'Testort '+n,category:'Cafés',longitude:8.665+(n%10)*.003,latitude:50.10+Math.floor(n/10)*.002}))}}));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.atlas-2d-native').waitFor({state:'visible'});
  assert.equal(await page.locator('.atlas-map-loading').count(),0,'No WebGL leaves an opaque loader');
  await page.locator('.atlas-2d-pin').first().waitFor({state:'visible'});
  const pinCount=await page.locator('.atlas-2d-pin').count();assert.ok(pinCount>0&&pinCount<=9,'Dense fallback markers must stay readable');
  assert.equal(await page.locator('.atlas-2d-pin-unknown').count(),pinCount,'Raw OSM markers must be labelled unverified');
  const covered=await page.locator('.atlas-2d-pin').evaluateAll(nodes=>{
   const controls=document.querySelector('.atlas-2d-controls').getBoundingClientRect();
   return nodes.some(node=>{const box=node.getBoundingClientRect();return box.left<controls.right&&box.right>controls.left&&box.top<controls.bottom&&box.bottom>controls.top});
  });
  assert.equal(covered,false,'Location labels must stay clear of zoom controls');
  await page.waitForFunction(()=>[...document.querySelectorAll('.atlas-2d-plane img')].every(image=>image.complete&&image.style.visibility==='hidden'));

  assert.equal(await page.locator('.atlas-dim-button').innerText(),'3D neu');
  await page.screenshot({path:'artifacts/map-startup/mobile-no-webgl.png'});
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: default map stays usable on a device without WebGL');
 }
 {
  const {ctx,page,errors}=await context();
  const held=[];
  await ctx.route('https://tiles.openfreemap.org/**',route=>{held.push(route)});
  await ctx.route('https://tile.openstreetmap.org/**',route=>{held.push(route)});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.maplibregl-canvas').waitFor({state:'visible'});
  assert.equal(await page.locator('.atlas-dim-button').getAttribute('aria-pressed'),'true','Landing view must start in 3D');
  await page.clock.fastForward(18001);
  await page.clock.fastForward(10001);
  await page.locator('.atlas-2d-native').waitFor({state:'visible'});
  assert.equal(await page.locator('.atlas-map-loading').count(),0,'Silent upstream must not trap visitors');
  assert.equal(await page.locator('.maplibregl-canvas').count(),0,'Failed GPU map must be released');
  await page.screenshot({path:'artifacts/map-startup/mobile-stalled-upstream.png'});
  await page.locator('.atlas-dim-button').click();
  await page.locator('.maplibregl-canvas').waitFor({state:'visible'});
  assert.equal(await page.locator('.atlas-dim-button').getAttribute('aria-pressed'),'true','Retry should immediately restore 3D intent');
  assert.equal(await page.locator('.atlas-2d-native').count(),0);
  assert.equal(await page.locator('.maplibregl-canvas').count(),1,'Retry must create only one GPU map');
  for(const route of held)await route.abort().catch(()=>{});
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: silent style/raster stalls recover on mobile; 3D retry creates one fresh map');
 }
 {
  const {ctx,page,errors}=await context(true);
  let delayedPage=null;
  const candidate=(id,name)=>({id:'node/'+id,name,category:'Cafés',address:'Frankfurt',candidate:true});
  const initial=Array.from({length:18},(_,n)=>candidate(80000+n,'Erste Auswahl '+n));
  await ctx.route('**/api/explore?*',route=>{
   const params=new URL(route.request().url()).searchParams;
   if(params.get('q')==='Neue Suche')return route.fulfill({json:{places:[],places_total:0,candidates:[candidate(90000,'Neuer Treffer')],candidates_total:1}});
   if(params.get('offset')==='18'){delayedPage=route;return}
   return route.fulfill({json:{places:[],places_total:0,candidates:initial,candidates_total:23}});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.mobile-bottom').getByRole('button',{name:'Entdecken',exact:true}).click();
  await page.getByRole('button',{name:/Weitere Orte anzeigen/}).click();
  await page.waitForFunction(()=>document.querySelector('.ffm-find-load')?.disabled);
  await page.getByRole('searchbox',{name:'Orte oder Stadtteile suchen'}).fill('Neue Suche');
  await page.getByText('Neuer Treffer',{exact:true}).waitFor();
  assert.ok(delayedPage,'Pagination request was not started');
  await delayedPage.fulfill({json:{places:[],candidates:[candidate(99999,'Veralteter Treffer')]}}).catch(()=>{});
  await page.clock.fastForward(1000);
  assert.equal(await page.getByText('Veralteter Treffer',{exact:true}).count(),0,'Stale pagination polluted new filters');
  assert.equal(await page.locator('.ffm-find-list .ffm-find-item').count(),1);
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: changing filters while loading more never mixes old and new results');
 }
 {
  const {ctx,page,errors,calls}=await context(true,true);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Meine Orte',exact:true}).click();
  const events=page.getByRole('region',{name:'Meine Veranstaltungen'});
  await events.getByRole('heading',{name:'Kalendertest'}).waitFor();
  assert.ok((await events.innerText()).includes('18:00')===false,'Test fixture is 17:00 Frankfurt time');
  assert.ok((await events.innerText()).includes('17:00'));
  const downloadPromise=page.waitForEvent('download');
  await events.getByRole('button',{name:'Kalender',exact:true}).click();
  const download=await downloadPromise;
  const calendar=(await readFile(await download.path(),'utf8')).replace(/\r\n /g,'');
  assert.ok(calendar.includes('DTSTART:20261101T160000Z'));
  assert.ok(calendar.includes('DTEND:20261101T190000Z'));
  assert.ok(!calendar.includes('Endzeit nicht bestätigt'));
  await events.getByRole('button',{name:'Veranstaltung nicht mehr merken'}).click();
  await events.getByText('Noch keine anstehenden Veranstaltungen gemerkt.').waitFor();
  assert.equal(calls.length,1);assert.equal(calls[0].active,false);
  await page.screenshot({path:'artifacts/map-startup/mobile-saved-events.png'});
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: private saved events open in profile, use confirmed calendar end and can be removed');
 }
}finally{
 await browser?.close();server.kill('SIGTERM');
}
