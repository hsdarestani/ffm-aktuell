import {chromium} from 'playwright';
const base=process.env.ATLAS_BASE_URL||'https://ffm-aktuell.smarbiz.sbs';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let failure=false;
function verify(name,pass,detail){console.log((pass?'BESTANDEN ':'FEHLER ')+name,detail||'');if(!pass)failure=true;}
for(const d of [{name:'Mobil',width:390,height:844},{name:'Desktop',width:1440,height:900}]){
 const page=await browser.newPage({viewport:{width:d.width,height:d.height}});
 let good=0,bad=0,requests=0,reason=[];
 page.on('response',r=>{if(/gds-srv\.hessen\.de/.test(r.url())){requests++;if(r.status()===200)good++;else {bad++;reason.push('HTTP '+r.status())}}});
 page.on('requestfailed',r=>{if(/gds-srv\.hessen\.de/.test(r.url())){bad++;reason.push(r.failure()?.errorText||'network')}});
 try{
  await page.goto(base+'/atlas?atlasQA=1',{waitUntil:'domcontentloaded',timeout:65000});
  await page.locator('.atlas-map-loading').waitFor({state:'hidden',timeout:55000});
  const button=page.locator('.atlas-air-button');
  await button.waitFor({state:'visible',timeout:10000});
  await button.click({timeout:15000});
  await page.waitForTimeout(13000);
  const layer=await page.evaluate(()=>{
   const map=window.__ffmAtlasQA;
   return {source:!!map?.getSource('ffm-hessen-dop'),layer:map?.getLayoutProperty('ffm-luftbild','visibility'),loaded:map?.isSourceLoaded('ffm-hessen-dop')};
  });
  verify(d.name+' WMS-Modus einschaltbar',await button.getAttribute('aria-pressed')==='true');
  verify(d.name+' Luftbild-Layer tatsächlich sichtbar',layer?.source&&layer.layer==='visible',JSON.stringify(layer));
  verify(d.name+' amtliche Hessen-Bildkacheln geladen',good>0&&layer.loaded===true,JSON.stringify({good,bad,requests,layer,reason:reason.slice(0,4)}));
  verify(d.name+' keine sichtbare Fehlermeldung',await page.locator('.atlas-luftbild-warning').count()===0);
 }catch(e){failure=true;console.error('FEHLER '+d.name,String(e).slice(0,800))}
 finally{await page.close();}
}
await browser.close();
if(failure)process.exitCode=1;
