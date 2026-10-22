// Isolated browser fixtures; never creates production accounts or changes live data.
import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const port=3108,base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{stdio:['ignore','pipe','pipe']});
let logs='',browser;server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
const modules=['choices','highlights','tips','assistant','community','news'].map(code=>({code,enabled:true}));
const queues=Object.fromEntries(['businesses','claims','places','deals','posts','reports','reviews','reviewReports','comments','branchChanges'].map(k=>[k,[]]));
const nav=['Heute','Orte prüfen','Freigaben','Erstellen','Startseite','Kategorien','Stadttipps','Datenqualität','Werbung','Treuekarten','Teamplätze','Tarife','Konten','Berechtigungen','Dienste'];
try{
 for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({headless:true});await mkdir('artifacts/admin-workspace',{recursive:true});
 const failures=[];
 for(const width of [1440,390]){
  const ctx=await browser.newContext({viewport:{width,height:960}}),page=await ctx.newPage(),errors=[],writes=[];let layout=structuredClone(modules);
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let body={items:[]};
   if(path==='/api/me')body={user:{id:'test-admin',email:'admin@example.test',display_name:'Test admin',role:'admin'}};
   if(path==='/api/admin/validation')body={stats:{kandidaten:0,rueckfragen:0,offen_zur_pruefung:0,aktuell_geprueft:0},recheck:[]};
   if(path==='/api/admin/queue')body=queues;
   if(path==='/api/admin/candidates')body={items:[],total:0};
   if(path==='/api/home-layout'){if(req.method()==='POST'){layout=req.postDataJSON().modules;writes.push({path,body:layout})}body={modules:layout}}
   if(path==='/api/tips')body={items:[],places:[]};
   if(path==='/api/loyalty')body={programs:[]};
   if(path==='/api/admin/business-seats')body={items:[{id:'business-test',name:'Testbetrieb',used_seats:1,team_seat_limit:2,status:'approved'}]};
   if(path==='/api/admin/content')body={items:[],types:['post','review','comment']};
   if(path==='/api/admin/roles')body={roles:[{code:'editorial',label:'Redaktion',permissions:['editorial']}],assignments:[]};
   if(path==='/api/admin/data-quality')body={items:[],total:0,overview:{total:0},notice:''};
   if(path==='/api/admin/billing-ledger')body={ads:[],subscriptions:[],invoices:[],credits:[]};
   if(path==='/api/admin/service-status')body={phone:{configured:false},weather:{configured:false},google:{configured:false},apple:{configured:false},assistant:{configured:false},web_push:{configured:true,devices:0},media:{configured:false,scanner_reachable:false},billing:{configured:false,reason:'Konfiguration fehlt'},inventory:{total:0,current_verified:0},checked_at:new Date().toISOString()};
   if(path==='/api/admin/accounts')body={items:[{id:'account-test',email:'person@example.test',display_name:'Test account',suspended_at:null,suspension_reason:null}]};
   if(path==='/api/plans')body={items:[{code:'test',title_de:'Testtarif',title_en:'Test plan',features:[],monthly_price_cents:null,annual_price_cents:null,trial_days:0,staff_seats:0,branch_limit:1,status:'draft',legal_terms_url:null}]};
   return route.fulfill({json:body});
  });
  await page.goto(base+'/admin');await page.locator('.ffm-studio').waitFor();
  async function open(label){if(width<851)await page.getByRole('button',{name:'Menü öffnen',exact:true}).click();await page.locator('.ffm-studio-rail-nav').getByRole('button',{name:label,exact:true}).click();await page.waitForTimeout(350)}
  for(const label of nav){
   console.log('CHECK',width,label);
   try{await open(label)}catch(e){await page.screenshot({path:'artifacts/admin-workspace/failure.png',fullPage:true});console.log(await page.locator('body').innerText());console.log(errors);throw e}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${label} horizontal overflow`);
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
   if(axe.violations.length)failures.push({width,label,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
   if(['Startseite','Konten','Berechtigungen','Dienste','Tarife'].includes(label))await page.screenshot({path:`artifacts/admin-workspace/${width}-${nav.indexOf(label)}.png`,fullPage:true});
  }
  await open('Startseite');const first=await page.locator('.ffm-home-module label').first().innerText();
  await page.locator('.ffm-home-module').first().getByRole('button',{name:/nach unten/}).click();assert.equal(await page.locator('.ffm-home-module label').nth(1).innerText(),first);
  await page.locator('.ffm-home-module input').first().uncheck();await page.getByRole('button',{name:'Startseite speichern',exact:true}).click();await page.getByRole('status').filter({hasText:'gespeichert'}).waitFor();assert.equal(writes.at(-1).body[0].enabled,false);assert.equal(writes.at(-1).body[1].code,'choices');
  await open('Heute');await open('Startseite');assert.equal(await page.locator('.ffm-home-module input').first().isChecked(),false);
  const check=await page.locator('.ffm-home-module input').first().boundingBox();assert.ok(check.width<=24&&check.height<=24,'Checkbox stretched into a text field');
  await open('Konten');await page.getByLabel('Konto',{exact:true}).fill('person@example.test');await page.getByRole('button',{name:'Suchen',exact:true}).click();await page.getByRole('heading',{name:'Test account',exact:true}).waitFor();assert.ok((await page.getByRole('button',{name:'Suchen',exact:true}).boundingBox()).height>=40);
  if(width<851){const opener=page.getByRole('button',{name:'Menü öffnen',exact:true});await opener.click();await page.getByRole('dialog').waitFor();await page.screenshot({path:'artifacts/admin-workspace/mobile-menu.png',fullPage:true});const menuAudit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();if(menuAudit.violations.length)failures.push({width,label:'mobile-menu',violations:menuAudit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await opener.evaluate(e=>e===document.activeElement),true)}
  await ctx.route('**/api/home-layout',route=>route.fulfill({status:503,json:{error:'Test unavailable'}}));await open('Startseite');await page.locator('.ffm-home-editor').getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Startseite speichern',exact:true}).isDisabled(),true,'Failed load must not overwrite saved layout with defaults');await open('Konten');
  await page.locator('.ffm-language-toggle').click();await page.getByRole('heading',{name:'Manage accounts'}).waitFor();
  await page.screenshot({path:`artifacts/admin-workspace/${width}-accounts-en.png`,fullPage:true});
  assert.deepEqual(errors,[]);await ctx.close();console.log(`PASS: ${width}px all 15 admin pages, saved module order/visibility, account lookup, menu keyboard and no overflow`);
 }
 await writeFile('artifacts/admin-workspace/accessibility.json',JSON.stringify(failures,null,2));assert.deepEqual(failures,[],'Admin accessibility violations: '+JSON.stringify(failures));
}finally{await browser?.close();server.kill('SIGTERM')}
