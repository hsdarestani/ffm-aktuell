import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const base=process.env.ATLAS_BASE_URL||'https://ffm-aktuell.smarbiz.sbs';
mkdirSync('artifacts/atlas',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failed=false;
async function check(label,condition){if(!condition){failed=true;console.error('FAIL:',label);}else console.log('PASS:',label);}
async function scenario(name,viewport,url){
 const page=await browser.newPage({viewport,deviceScaleFactor:1});
 const errors=[];let tileSuccess=0,tileFailure=0;
 page.on('pageerror',e=>errors.push('JS: '+e.message));
 page.on('response',r=>{if(/tiles\.openfreemap\.org/.test(r.url())){if(r.ok())tileSuccess++;else tileFailure++;}});
 page.on('requestfailed',r=>{if(/tiles\.openfreemap\.org/.test(r.url()))tileFailure++;});
 try{
  console.log('Opening',url,viewport.width);
  const response=await page.goto(url,{timeout:90000,waitUntil:'domcontentloaded'});
  await check(name+' HTTP status',response?.status()===200);
  await page.locator('.atlas-map-host canvas').first().waitFor({state:'visible',timeout:55000});
  await page.locator('.atlas-map-loading').waitFor({state:'hidden',timeout:55000});
  await page.waitForTimeout(4500);
  await check(name+' map canvas rendered',await page.locator('.maplibregl-canvas').count()>0);
  await check(name+' WebGL tile requests succeeded',tileSuccess>0);
  const dimension=page.locator('.atlas-dim-button').first();
  await check(name+' defaults to 3D',await dimension.getAttribute('aria-pressed')==='true');
  await dimension.click();
  await check(name+' 2D switch works',await dimension.getAttribute('aria-pressed')==='false');
  await dimension.click();
  await check(name+' 3D switch works',await dimension.getAttribute('aria-pressed')==='true');
  await page.locator('.atlas-tone-button').first().click();
  await check(name+' evening toggle works',await page.locator('.atlas-tone-golden').count()>0);
  await page.locator('.atlas-district-toggle').first().click();
  await page.locator('.atlas-district-picker button').filter({hasText:'Sachsenhausen'}).first().click();
  await check(name+' district camera selection works',(await page.locator('.atlas-bottom-copy strong').first().textContent())?.includes('Sachsenhausen'));
  await page.locator('.atlas-category-tabs button').filter({hasText:'Kultur'}).first().click();
  await check(name+' category selection works',await page.locator('.atlas-category-tabs button').filter({hasText:'Kultur'}).first().getAttribute('aria-pressed')==='true');
  const p=await page.evaluate(async()=>{const r=await fetch('/api/places');return {status:r.status,data:await r.json()};});
  await check(name+' real places API',p.status===200&&Array.isArray(p.data.items));
  await page.screenshot({path:'artifacts/atlas/'+name+'.png',fullPage:false});
  if(viewport.width<500){
   const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,window:innerWidth}));
   await check('mobile horizontal overflow',(widths.scroll-widths.window)<3);
  }
  await check(name+' no critical JavaScript errors',errors.length===0);
  console.log(name+' source requests:',{tileSuccess,tileFailure},'API places count:',p.data.items?.length,'console errors:',errors);
 }catch(e){
  failed=true;console.error(name+' fatal:',e);
  await page.screenshot({path:'artifacts/atlas/'+name+'-failure.png',fullPage:false}).catch(()=>{});
 }finally{await page.close();}
}
try{
 await scenario('mobile-390',{width:390,height:844},base+'/atlas');
 await scenario('desktop-1440',{width:1440,height:900},base+'/atlas');
}finally{await browser.close();}
if(failed)process.exitCode=1;
