// Isolated fixtures only. No production account, provider call, purchase or publication.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=3117,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:['ignore','pipe','pipe']});
let browser,logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({headless:true});
 for(const width of [1440,390]){
  const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let eventRequests=0,guideRequests=0;
  await ctx.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /^webgl/.test(type)?null:original.call(this,type,...args)}});
  await ctx.route('**/api/**',route=>{
   const p=new URL(route.request().url()).pathname;let body={items:[]};
   if(p==='/api/me')body={user:null};
   if(p==='/api/location')body={place:{id:'node/8883508132',name:'QA map fixture',category:'Apotheken',address:'Frankfurt',latitude:50.11,longitude:8.68,candidate:true}};
   if(p==='/api/event-explorer'&&new URL(route.request().url()).searchParams.get('from')?.endsWith('-01')&&++eventRequests===1)return route.fulfill({status:503,json:{error:'Isolated retry fixture'}});
   if(p==='/api/guides'&&++guideRequests===1)return route.fulfill({status:503,json:{error:'Isolated retry fixture'}});
   if(p==='/api/recommendations')body={items:[],notice:'Keine passenden unabhängig geprüften Orte.'};
   return route.fulfill({json:body});
  });
  await ctx.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const nav=page.locator(width>1000?'.desktop-nav':'.mobile-bottom');
  await nav.getByRole('button',{name:'Veranstaltungen',exact:true}).click();
  await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click().catch(async e=>{console.error('Rendered page:',await page.locator('body').innerText());console.error('Page errors:',errors);throw e});
  await page.getByText('Für diesen Tag keine bestätigten Events.',{exact:true}).waitFor();
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'});
  const prev=new Date(today.slice(0,7)+'-01T12:00:00Z');prev.setUTCMonth(prev.getUTCMonth()-1);
  const expected=prev.toLocaleDateString('de-DE',{month:'long',year:'numeric',timeZone:'UTC'});
  await page.getByRole('button',{name:'Vorheriger Monat',exact:true}).click();
  assert.equal(await page.locator('.ffm-event-month-nav strong').textContent(),expected);
  assert.match(await page.locator('.ffm-event-result-bar strong').textContent(),/1\./);
  await nav.getByRole('button',{name:'Guides',exact:true}).click();
  await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click().catch(async e=>{console.error('Rendered page:',await page.locator('body').innerText());console.error('Page errors:',errors);throw e});
  await page.getByText('Noch keine passenden Guides veröffentlicht.',{exact:true}).waitFor();
  await nav.getByRole('button',{name:'Matcher',exact:true}).click();
  await page.getByRole('button',{name:'Cafés',exact:true}).click();
  await page.getByRole('button',{name:'Ganz egal',exact:true}).click();
  await page.getByRole('button',{name:'Jederzeit',exact:true}).click();
  await page.getByRole('button',{name:'Meine Matches finden',exact:true}).click();
  await page.getByText('Noch keine passenden verifizierten Orte.',{exact:true}).waitFor();
  await page.locator('.header .ffm-language-toggle').click();
  await page.getByText('FIND YOUR SPOT',{exact:true}).waitFor();
  assert.equal(await page.getByText('Keine passenden unabhängig geprüften Orte.',{exact:true}).count(),0);
  await page.goto(base+'/?ort=node%2F8883508132',{waitUntil:'domcontentloaded'});
  await page.locator('.ffm-place-raster-pin').waitFor();
  const tile=page.locator('.ffm-place-raster-tiles img').first();
  const before=await tile.getAttribute('src');
  await page.locator('.ffm-place-raster-controls button').first().click();
  assert.notEqual(await tile.getAttribute('src'),before,'Raster zoom changes actual map tiles without WebGL');
  assert.equal(await page.locator('.ffm-place-location iframe').count(),0);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await ctx.close();console.log(`Functional recovery, calendar and locale: ${width}px passed`);
 }
}finally{await browser?.close();server.kill('SIGTERM')}
