// Production build with isolated local HTTP fixtures; no production writes.
import {chromium} from 'playwright';
import {AxeBuilder} from '@axe-core/playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3110',server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3110'],{stdio:['ignore','pipe','pipe']});let browser,logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
try{
 for(let n=0;n<80;n++){try{if((await fetch(base)).ok)break}catch{}if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({headless:true});await mkdir('artifacts/site-design',{recursive:true});const findings=[];
 for(const width of [1440,390,320]){
  const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return /^webgl/.test(t)?null:get.call(this,t,...args)}});
  await ctx.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;let body={items:[]};
   if(path==='/api/me')body={user:{id:'00000000-0000-4000-8000-000000000001',email:'design-fixture@example.test',display_name:'Design test',role:'user'}};
   if(path==='/api/explore')body={places:[],candidates:[],places_total:0,candidates_total:0,districts:[]};
   if(path==='/api/me/preferences')body={preferences:{interests:[],districts:[]}};
   if(path==='/api/me/account-security')body={social_providers:[],requires_password:true,social_deletion_available:false};
   if(path==='/api/me/push')body={available:false,public_key:'',devices:0};
   if(path==='/api/me/phone')body={configured:false,phone_verified:false};
   if(path==='/api/billing/status')body={configured:false,subscriptions:[],invoices:[],credits:[],refunds:[]};
   if(path==='/api/businesses')body={items:[{id:'00000000-0000-4000-8000-000000000002',name:'Testbetrieb Frankfurt',status:'approved'}]};
   if(path==='/api/business/overview')body={places:[],changes:[],claims:[],deals:[]};
   if(path==='/api/business/team')body={business:{id:'fixture',name:'Testbetrieb',team_seat_limit:0},members:[],invites:[],places:[],mail_enabled:false};
   if(path==='/api/business/insights')body={business:{name:'Testbetrieb'},active_places:0,current_deals:0,coupons_claimed:0,coupons_redeemed:0,published_posts:0,followers:null,campaign_pending:0,campaign_reviewed_not_paid:0,disclaimer:'Isolated test data only.'};
   if(path==='/api/loyalty')body={programs:[],cards:[],visits:[],program:null};
   if(path==='/api/media/status')body={upload_enabled:false};
   if(path==='/api/plans')body={items:['business','user'].map(audience=>({code:audience+'-fixture',audience,title_de:'Testtarif',title_en:'Fixture plan',monthly_price_cents:1999,annual_price_cents:19900,trial_days:0,legal_terms_url:'https://example.test/terms',staff_seats:2,branch_limit:1})),checkout_available:false};
   return route.fulfill({json:body});
  });
  await ctx.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await ctx.route('https://images.unsplash.com/**',route=>route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.locator('.atlas-2d-native').waitFor();
  const primary=()=>page.locator(width>=1000?'.desktop-nav':'.mobile-bottom');
  async function home(){await primary().getByRole('button').nth(0).click();await page.locator('.ffm-quick-home').waitFor()}
  async function audit(name){await page.waitForTimeout(500);const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const b=e.getBoundingClientRect();return b.width&&b.right>innerWidth+2&&getComputedStyle(e).position!=='fixed'&&!e.closest('.atlas-root')}).map(e=>({tag:e.tagName,class:String(e.className),right:e.getBoundingClientRect().right})).slice(0,8));const horizontal=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();findings.push({width,name,horizontal,overflow,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});await page.screenshot({path:`artifacts/site-design/${width}-${name}.png`,fullPage:true});console.log('CHECK',width,name,horizontal,axe.violations.length)}
  await home();await audit('home');if(process.env.SITE_DESIGN_VERIFY==='1'){const b=await page.locator('.ffm-intent-optin input').first().boundingBox();assert.ok(b.width<=24&&b.height<=24,'Oversized assistant checkbox')}
  await primary().getByRole('button').nth(1).click();await audit('discover');
  await home();await page.getByRole('button',{name:'Veranstaltungen',exact:true}).first().click();await audit('events');
  await home();await page.getByRole('button',{name:'Miteinander entdecken',exact:true}).click();await audit('community');
  await page.locator('.user-button').click();await page.locator('.ffm-profile-page').waitFor();await audit('profile');
  await page.locator('.ffm-profile-shortcuts button').first().click();await audit('saved');
  await page.locator('.user-button').click();await page.locator('.ffm-profile-shortcuts button').nth(1).click();await audit('tours');
  await home();await page.getByRole('button',{name:'Für Unternehmen',exact:true}).last().click();await page.locator('.business-status').waitFor();await audit('business');
  if(process.env.SITE_DESIGN_VERIFY==='1'){
   // Shared navigation must still expose all business tasks after layout changes.
   const tabs=page.locator('.ffm-business-nav button');
   assert.equal(await tabs.count(),5);
   for(let i=0;i<await tabs.count();i++){await tabs.nth(i).click();await audit('business-'+i)}
   await tabs.nth(1).click();await page.locator('#business-content input[name=title]').fill('Unsent fixture draft');await tabs.nth(2).click();await tabs.nth(1).click();assert.equal(await page.locator('#business-content input[name=title]').inputValue(),'Unsent fixture draft','Changing business task loses the draft');
   await page.locator('.ffm-business-examples summary').click();await page.locator('.ffm-business-examples img[data-image-fallback=true]').first().waitFor();await audit('business-examples');
   await page.locator('.header .ffm-language-toggle').click();await audit('business-en');await page.locator('.header .ffm-language-toggle').click();
   await ctx.route('**/api/businesses',route=>route.fulfill({json:{items:[]}}));await page.reload({waitUntil:'domcontentloaded'});await home();await page.getByRole('button',{name:'Für Unternehmen',exact:true}).last().click();await audit('business-register');
   await ctx.route('**/api/me',route=>route.fulfill({json:{user:null}}));await page.reload({waitUntil:'domcontentloaded'});await home();await audit('home-guest');await page.locator('.user-button').click();await page.getByRole('dialog').waitFor();await audit('auth-guest');await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Für Unternehmen',exact:true}).last().click();await audit('business-guest');
   assert.deepEqual(errors,[],'Client runtime errors: '+errors.join('\n'));
  }
  console.log('ERRORS',JSON.stringify(errors));await ctx.close();
 }
 await writeFile('artifacts/site-design/findings.json',JSON.stringify(findings,null,2));
 if(process.env.SITE_DESIGN_VERIFY==='1')assert.deepEqual(findings.filter(x=>x.horizontal||x.violations.length),[],'Site layout/accessibility findings: '+JSON.stringify(findings.filter(x=>x.horizontal||x.violations.length)));
}finally{await browser?.close();server.kill('SIGTERM')}
