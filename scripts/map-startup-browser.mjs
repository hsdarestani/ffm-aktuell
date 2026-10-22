// Production-built app, isolated HTTP fixtures, real Chromium + MapLibre.
// No production records are created. Stalled upstreams exercise actual recovery.
import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const port=3104,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs=(logs+b).slice(-3000));server.stderr.on('data',b=>logs=(logs+b).slice(-3000));
let browser;
try{
 const accessibilityFindings=[];
 let healthy=false;
 for(let n=0;n<60;n++){
  if(server.exitCode!==null)throw Error('Test server exited: '+logs);
  try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok){healthy=true;break}}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(healthy,'Production server did not start: '+logs);
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 await mkdir('artifacts/map-startup',{recursive:true});
 async function audit(page,name){
  await page.clock.runFor(800);
  await page.waitForFunction(()=>Math.abs(window.scrollY)<1).catch(async error=>{console.log('AUDIT_SCROLL '+name+': '+JSON.stringify(await page.evaluate(()=>({y:window.scrollY,restoration:history.scrollRestoration,active:document.activeElement?.tagName}))));throw error});
  const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  await writeFile('artifacts/map-startup/accessibility-'+name+'.json',JSON.stringify(report,null,2));
  console.log('AXE '+name+': '+JSON.stringify(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));
  accessibilityFindings.push({name,violations:report.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
 }
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
  await events.getByRole('button',{name:/Veranstaltung nicht mehr merken$/}).click();
  await events.getByText('Noch keine anstehenden Veranstaltungen gemerkt.').waitFor();
  assert.equal(calls.length,1);assert.equal(calls[0].active,false);
  await page.screenshot({path:'artifacts/map-startup/mobile-saved-events.png'});
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: private saved events open in profile, use confirmed calendar end and can be removed');
 }
 {
  const {ctx,page,errors}=await context(true);
  let requested=null;
  await ctx.route('**/api/explore?*',route=>{requested=new URL(route.request().url()).searchParams;return route.fulfill({json:{places:[],places_total:0,candidates:[],candidates_total:0}})});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.mobile-bottom').getByRole('button',{name:'Entdecken',exact:true}).click();
  await page.getByText('Merkmale, Preisniveau und Bewertung',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Familienfreundlich',exact:true}).check();
  await page.getByRole('checkbox',{name:'Laut Tagesplan jetzt geöffnet',exact:true}).check();
  await page.getByRole('combobox',{name:'Maximales Preisniveau'}).selectOption('2');
  await page.getByRole('combobox',{name:'Mindestbewertung'}).selectOption('4');
  await page.waitForFunction(()=>!document.querySelector('.ffm-find-list'));
  await page.waitForTimeout(800);
  assert.equal(requested.get('open_now'),'1');assert.deepEqual(requested.getAll('feature'),['family_friendly']);assert.equal(requested.get('price_max'),'2');assert.equal(requested.get('rating_min'),'4');
  await page.getByRole('button',{name:'Filter löschen',exact:true}).click();
  await page.waitForTimeout(800);assert.equal(requested.has('open_now'),false);assert.equal(requested.has('feature'),false);assert.equal(requested.has('price_max'),false);assert.equal(requested.has('rating_min'),false);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS: factual filters reach the server, suppress unsupported OSM rows and reset completely');
 }
 {
  const {ctx,page,errors}=await context(true,true);let asked=null;const receipts=[],requestedPlacements=[];
  await ctx.route('**/api/advertising?*',route=>{const placement=new URL(route.request().url()).searchParams.get('placement');requestedPlacements.push(placement);return route.fulfill({json:{items:placement==='home'?[{token:'b'.repeat(64),title:'Bezahlte Anzeige',body:'Ein tatsächliches Angebot des Testbetriebs.',place_id:'00000000-0000-4000-8000-000000000002',place_name:'Testbetrieb',business_name:'Testbetrieb'}]:[]}})});
  await ctx.route('**/api/advertising',route=>{receipts.push(route.request().postDataJSON());return route.fulfill({json:{recorded:true}})});
  await ctx.route('**/api/recommendations?*',route=>{asked=new URL(route.request().url()).searchParams;return route.fulfill({json:{items:[],events:[{id:'fixture-event',title:'Passender Eintritt',starts_at:'2026-11-01T16:00:00Z',price_cents:500,price_source_url:'https://example.org/tickets'}],mode:'editorial',notice:'Nur belegte Angaben.',weather:null}})});
  await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});
  await page.locator('.mobile-bottom').getByRole('button',{name:'Start',exact:true}).click();
  const sponsored=page.getByRole('complementary',{name:'Werbung'});await sponsored.waitFor();
  const visibleReceipt=page.waitForResponse(r=>r.url()===base+'/api/advertising'&&r.request().method()==='POST'&&r.request().postDataJSON()?.kind==='impression');
  await sponsored.scrollIntoViewIfNeeded();await page.clock.runFor(1500);await visibleReceipt;
  assert.equal(receipts.filter(r=>r.kind==='impression').length,1);assert.ok(requestedPlacements.includes('new_openings'));
  await page.locator('#ffm-intent').fill('Ein ruhiger Nachmittag');
  await page.getByText('Datum, Budget und Anlass',{exact:true}).click();await page.getByLabel('Datum',{exact:true}).fill('2026-11-01');
  await page.getByRole('combobox',{name:'Preisniveau bis'}).selectOption('2');await page.getByLabel('Eintritt höchstens in Euro').fill('6');await page.getByRole('combobox',{name:'Anlass',exact:true}).selectOption('quiet');
  await page.getByRole('button',{name:'Ideen finden',exact:true}).click();await page.getByText('Passender Eintritt',{exact:true}).waitFor();
  assert.equal(asked.get('date'),'2026-11-01');assert.equal(asked.get('budget'),'2');assert.equal(asked.get('event_budget'),'6');assert.equal(asked.get('occasion'),'quiet');assert.equal(asked.get('ai'),'0');
  assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/map-startup/mobile-context-and-advertising.png'});await ctx.close();
  console.log('PASS: mobile context fields, event results and one visible sponsored impression');
 }
 {
  const {ctx,page,errors}=await context(true);
  await page.goto(base+'/?page=home',{waitUntil:'domcontentloaded'});
  await audit(page,'map-de');
  await page.locator('.mobile-bottom').getByRole('button',{name:'Start',exact:true}).click();
  await audit(page,'home-de');
  await page.locator('.header .user-button').click();
  await page.getByRole('dialog',{name:'Willkommen bei FFM',exact:true}).waitFor();
  await audit(page,'auth-de');await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.locator('.mobile-bottom').getByRole('button',{name:'Entdecken',exact:true}).click();
  await audit(page,'discovery-de');
  await page.locator('.mobile-bottom').getByRole('button',{name:'Start',exact:true}).click();
  await page.getByRole('button',{name:/Switch to English$/}).click();
  await page.locator('html[lang="en"]').waitFor({state:'attached'});
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.getByText('Date, budget and occasion',{exact:true}).click();
  await page.getByLabel('Maximum entry price in euros',{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Time of day',exact:true}).selectOption('evening');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/Switch to German$/}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.locator('.mobile-bottom').getByRole('button',{name:'Home',exact:true}).click();
  await audit(page,'home-en');
  await page.locator('.mobile-bottom').getByRole('button',{name:'Explore',exact:true}).click();
  await audit(page,'discovery-en');
  await page.locator('.mobile-bottom').getByRole('button',{name:'Home',exact:true}).click();
  const opener=page.locator('.header .user-button');await opener.click();
  const dialog=page.getByRole('dialog',{name:'Welcome to FFM',exact:true});await dialog.waitFor();
  assert.equal(await page.evaluate(()=>document.querySelector('[role="dialog"]').contains(document.activeElement)),true);
  await audit(page,'auth-en');
  for(let n=0;n<15;n++){await page.keyboard.press(n%2?'Shift+Tab':'Tab');assert.equal(await page.evaluate(()=>document.querySelector('[role="dialog"]').contains(document.activeElement)),true)}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await opener.evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.locator('[inert]').count(),0);
  const unnamed=await page.locator('button').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length&&!el.textContent.trim()&&!el.getAttribute('aria-label')&&!el.getAttribute('title')).map(el=>el.outerHTML));assert.deepEqual(unnamed,[]);
  assert.equal(await page.locator('img:not([alt])').count(),0);
  await page.getByRole('button',{name:/Switch to German$/}).click();
  await page.getByRole('button',{name:/Switch to English$/}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'de');
  assert.deepEqual(errors,[]);await page.screenshot({path:'artifacts/map-startup/english-and-keyboard.png'});await ctx.close();
  console.log('PASS: English context controls, persisted locale, named controls, trapped modal keyboard focus, Escape and opener restoration');
 }
 {
  const {ctx,page,errors}=await context(true,true);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Meine Orte',exact:true}).click();
  await page.getByRole('region',{name:'Meine Veranstaltungen'}).waitFor();
  await audit(page,'account-de');
  await page.getByRole('button',{name:/Switch to English$/}).click();
  await page.locator('html[lang="en"]').waitFor({state:'attached'});
  await audit(page,'account-en');
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: German and English account accessibility');
 }

 {
  const {ctx,page,errors}=await context(true);
  await ctx.route('**/api/places',route=>route.fulfill({json:{items:[{id:'00000000-0000-4000-8000-000000000002',name:'Keyboard venue',category:'Cafés',latitude:50.1114,longitude:8.6813,description_de:'Testort',description_en:'Test venue'}]}}));
  await page.goto(base+'/atlas',{waitUntil:'domcontentloaded'});
  await audit(page,'standalone-map-de');
  await page.getByRole('button',{name:/Switch to English$/}).click();
  await page.locator('html[lang="en"]').waitFor({state:'attached'});
  await audit(page,'standalone-map-en');
  const marker=page.locator('.atlas-2d-pin').first();await marker.click();
  const details=page.getByRole('dialog',{name:'Keyboard venue',exact:true});await details.waitFor();
  assert.equal(await details.evaluate(el=>el.contains(document.activeElement)),true);
  await audit(page,'standalone-details-en');
  await page.keyboard.press('Tab');assert.equal(await details.evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await details.waitFor({state:'hidden'});
  assert.equal(await marker.evaluate(el=>el===document.activeElement),true);
  await page.goto(base+'/admin/aktivieren',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Activate editorial access',exact:true}).waitFor();
  await audit(page,'activation-en');
  await page.getByRole('button',{name:/Switch to German$/}).click();
  await audit(page,'activation-de');
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: standalone atlas and unavailable-invitation screen in both languages');
 }

 assert.deepEqual(accessibilityFindings.filter(x=>x.violations.length),[],'Accessibility violations across all audited German/English screens');
 console.log('PASS: all audited German/English screens have no automated WCAG A/AA violations');
}finally{
 await browser?.close();server.kill('SIGTERM');
}
