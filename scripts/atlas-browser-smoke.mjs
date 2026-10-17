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
  const p=await page.evaluate(async()=>{const r=await fetch('/api/places');return {status:r.status,data:await r.json()};});
  await check(name+' real places API',p.status===200&&Array.isArray(p.data.items));
  const target=p.data.items?.find(x=>x.name==='Städel Museum')||p.data.items?.find(x=>x.category==='Kultur');
  const anchors=await page.evaluate(async(target)=>{
    const map=window.__ffmAtlasQA;
    if(!map||!map.getLayer('ffm-poi-dot'))return {reason:'missing MapLibre geo dot layer'};
    if(!target)return {reason:'missing a culture place'};
    const original=[Number(target.longitude),Number(target.latitude)];
    if(original.some(n=>!Number.isFinite(n)))return {reason:'invalid catalogue coordinates'};
    // Measure the ground-projected hit itself, not the asynchronous tile cursor.
    // In flat view a pin's center MUST match the point obtained from map.project.
    const ready=()=>new Promise(r=>{let resolved=false;
      const done=()=>{if(!resolved){resolved=true;r();}};
      map.once('idle',done);setTimeout(done,2200);
    });
    map.jumpTo({center:original,zoom:16.8,pitch:0,bearing:0});
    await ready();
    const match=()=>{
      const pos=map.project(original);
      const around=[[pos.x-7,pos.y-7],[pos.x+7,pos.y+7]];
      const hits=map.queryRenderedFeatures(around,{layers:['ffm-poi-dot']});
      return hits.some(f=>String(f.properties?.id)===String(target.id));
    };
    const before=match();
    const sourceMatches=map.querySourceFeatures('ffm-curated-geo').some(f=>
      String(f.properties?.id)===String(target.id)&&f.geometry.type==='Point'&&
      Math.abs(f.geometry.coordinates[0]-original[0])<0.0001&&
      Math.abs(f.geometry.coordinates[1]-original[1])<0.0001);
    map.panBy([65,40],{duration:0});
    await ready();
    const after=match();
    return {before,after,sourceMatches,original};
  },target);
  console.log(name+' geographical pin assertions:',JSON.stringify(anchors));
  await check(name+' pin stays geographically anchored after pan',Boolean(anchors.before&&anchors.after&&anchors.sourceMatches));
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
