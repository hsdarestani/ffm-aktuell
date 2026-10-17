import {chromium} from 'playwright';
const base='https://ffm-aktuell.smarbiz.sbs';
let errors=0;
function ok(text,yes,detail=''){console.log((yes?'BESTANDEN':'FEHLER')+' '+text+' '+detail);if(!yes)errors++}
for(const d of [{label:'Mobil',width:390,height:844},{label:'Desktop',width:1440,height:900}]){
 const b=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const p=await b.newPage({viewport:{width:d.width,height:d.height},reducedMotion:'reduce'});
 const pageErrors=[];p.on('pageerror',x=>pageErrors.push(x.message));
 try{
  const data=await p.request.get(base+'/api/discovery?category=Apotheken&limit=2');
  const resp=data.ok()?await data.json():null;
  ok(d.label+' echte Apotheken im Suchindex',data.ok()&&resp?.total>=180,JSON.stringify({total:resp?.total}));
  ok(d.label+' Apotheken ohne falschen Öffnungsstatus',resp?.openingNowAvailable===false&&resp.items.every(x=>x.verification_status==='unverified'));
  const all=await p.request.get(base+'/api/discovery?limit=1');
  const j=all.ok()?await all.json():null;
  ok(d.label+' vollständige Quelle importiert',all.ok()&&j?.total>=4100,'total='+j?.total);
  const model=await p.request.get(base+'/lod2/frankfurt-preview.json');
  const m=model.ok()?await model.json():null;
  ok(d.label+' originale Dach- und Wandgeometrie geladen',model.ok()&&m.features?.length>=980,JSON.stringify({features:m?.features?.length}));
  await p.goto(base+'/atlas?atlasQA=1',{waitUntil:'domcontentloaded',timeout:55000});
  await p.locator('.atlas-map-loading').waitFor({state:'hidden',timeout:60000});
  await p.waitForFunction(()=>document.body.innerText.includes('Echte LoD2 Dach- und Wandflächen'),{timeout:25000}).catch(()=>{});
  const state=await p.evaluate(()=>{const map=window.__ffmAtlasQA;return {layer:!!map?.getLayer('ffm-real-lod2'),visible:map?.getLayoutProperty('ffm-real-lod2','visibility'),url:document.body.innerText.includes('Echte LoD2 Dach- und Wandflächen')}});
  ok(d.label+' echte 3D-LoD2-Flächen im WebGL gerendert',state.layer&&state.url,JSON.stringify(state));
  ok(d.label+' keine JavaScript-Fehler',pageErrors.length===0,JSON.stringify(pageErrors.slice(0,2)));
 }catch(e){errors++;console.error('FEHLER Test '+d.label,String(e).slice(0,550))}
 finally{await p.close();await b.close();}
}
if(errors)process.exitCode=1;
