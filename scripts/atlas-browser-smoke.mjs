import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const base=process.env.ATLAS_BASE_URL||'https://ffm-aktuell.smarbiz.sbs';
mkdirSync('artifacts/atlas',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failed=false;
async function check(label,condition){if(!condition){failed=true;console.error('FAIL:',label);}else console.log('PASS:',label);}
async function scenario(name,viewport,url){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:'artifacts/atlas',size:viewport}});
 const page=await context.newPage();
 const errors=[];let tileSuccess=0,tileFailure=0;
 page.on('pageerror',e=>errors.push('JS: '+e.message));
 page.on('response',r=>{if(/tiles\.openfreemap\.org/.test(r.url())){if(r.ok())tileSuccess++;else tileFailure++;}});
 page.on('requestfailed',r=>{if(/tiles\.openfreemap\.org/.test(r.url()))tileFailure++;});
 try{
  console.log('Opening',url,viewport.width);
  const response=await page.goto(url+'?atlasQA=1',{timeout:90000,waitUntil:'domcontentloaded'});
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
  const toneBefore=await page.locator('.atlas-root').first().getAttribute('class');
  await page.locator('.atlas-tone-button').first().click();
  await check(name+' lighting mode switches',await page.locator('.atlas-root').first().getAttribute('class')!==toneBefore);
  await page.locator('.atlas-tone-button').first().click();
  await page.locator('.atlas-district-toggle').first().click();
  await page.locator('.atlas-district-picker button').filter({hasText:'Sachsenhausen'}).first().click();
  await check(name+' district camera selection works',(await page.locator('.atlas-bottom-copy strong').first().textContent())?.includes('Sachsenhausen'));
  await page.locator('.atlas-category-tabs button').filter({hasText:'Kultur'}).first().click();
  await check(name+' category selection works',await page.locator('.atlas-category-tabs button').filter({hasText:'Kultur'}).first().getAttribute('aria-pressed')==='true');
  const anchors=await page.evaluate(async()=>{
    const map=window.__ffmAtlasQA;
    if(!map||!map.getLayer('ffm-poi-dot'))return {reason:'no 3D point layer'};
    const first=map.querySourceFeatures('ffm-curated-geo').find(x=>x.geometry.type==='Point');
    if(!first||first.geometry.type!=='Point')return {reason:'no loaded geo points'};
    const coords=first.geometry.coordinates;
    const hit=()=>{
      const projected=map.project(coords);
      return map.queryRenderedFeatures(projected,{layers:['ffm-poi-dot']}).some(f=>f.properties?.id===first.properties.id);
    };
    map.jumpTo({center:[8.6773,50.1106],pitch:55,bearing:-24,zoom:14.95});
    await new Promise(r=>setTimeout(r,800));
    const before=hit();
    map.panBy([95,62],{duration:0});
    await new Promise(r=>setTimeout(r,800));
    const after=hit();
    const sameSource=map.querySourceFeatures('ffm-curated-geo').some(f=>f.properties.id===first.properties.id&&
      f.geometry.type==='Point'&&f.geometry.coordinates[0]===coords[0]&&f.geometry.coordinates[1]===coords[1]);
    return {before,after,sameSource,coords};
  });
  console.log(name+' geographical pin assertions:',JSON.stringify(anchors));
  await check(name+' pin stays geographically anchored after pan',Boolean(anchors.before&&anchors.after&&anchors.sameSource));
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
 }finally{await context.close();}
}
try{
 await scenario('mobile-390',{width:390,height:844},base+'/atlas');
 await scenario('desktop-1440',{width:1440,height:900},base+'/atlas');
}finally{await browser.close();}
if(failed)process.exitCode=1;
