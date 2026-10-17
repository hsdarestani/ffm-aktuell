import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const base=process.env.FFM_URL||'https://ffm-aktuell.smarbiz.sbs/';
mkdirSync('artifacts/vorschau',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let fail=false;
const assert=(label,ok)=>{console.log((ok?'BESTANDEN ':'FEHLER ')+label);if(!ok)fail=true;};
const pages=[
 {id:'start',nav:'Start',selector:'.atlas-home-stage',min:1},
 {id:'entdecken',nav:'Entdecken',selector:'.v3-place-card',min:10},
 {id:'veranstaltungen',nav:'Veranstaltungen',selector:'.v3-event-card',min:4},
 {id:'miteinander',nav:'Miteinander',selector:'.v3-post-card',min:4}
];
for(const device of [{name:'mobil',width:390,height:844},{name:'rechner',width:1440,height:900}]){
 const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1});
 const page=await context.newPage(),exceptions=[];
 page.on('pageerror',e=>exceptions.push(e.message));
 try{
  const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
  assert(device.name+' Startseite erreichbar',response?.status()===200);
  await page.locator('.v3-preview-strip').waitFor({state:'visible',timeout:15000});
  for(const [index,v] of pages.entries()){
   if(index){
    const nav=device.width<800?'.mobile-bottom button':'.desktop-nav button';
    await page.locator(nav).filter({hasText:v.nav}).first().click();
   }
   await page.locator(v.selector).first().waitFor({state:'visible',timeout:20000});
   await page.waitForTimeout(index===0?1600:450);
   assert(device.name+' '+v.nav+' vollständig',await page.locator(v.selector).count()>=v.min);
   const body=(await page.locator('body').innerText()).replace(/\s+/g,' ');
   assert(device.name+' '+v.nav+' keine englischen Rubriken',!/CITY JOURNAL|THE PEOPLE|YOUR CITY|COMMUNITY\s*\/\s*POST|LOCAL BUSINESS|MEMBER ACCESS|DISCOVER FRANKFURT|PLACES\s*\/\s*FRANKFURT/i.test(body));
   assert(device.name+' Vorschau klar gekennzeichnet',body.includes('VORSCHAU'));
   if(v.id==='entdecken')assert(device.name+' Ortsmuster gekennzeichnet',body.includes('Musterort'));
   if(v.id==='veranstaltungen')assert(device.name+' Mustertermine und Angebote klar markiert',body.includes('Musterveranstaltung')&&body.includes('NICHT EINLÖSBAR'));
   if(v.id==='miteinander')assert(device.name+' Mustereinträge klar markiert',body.includes('Musterbeitrag'));
   const images=page.locator(v.id==='start'?'.atlas-home-place-art img':v.id==='entdecken'?'.v3-place-card img':v.id==='veranstaltungen'?'.v3-event-card img':'.v3-post-card img');
   const imgCount=await images.count();
   assert(device.name+' '+v.nav+' Bildkarten vorhanden',imgCount>=Math.min(4,v.min));
   // Exercise lazy-load on first four images; fail visibly broken previews.
   for(let i=0;i<Math.min(imgCount,4);i++)await images.nth(i).scrollIntoViewIfNeeded();
   await page.waitForTimeout(1400);
   const imageStates=await images.evaluateAll(nodes=>nodes.slice(0,4).map(i=>({ok:i instanceof HTMLImageElement&&i.complete&&i.naturalWidth>0,src:i.getAttribute('src')})));
   assert(device.name+' '+v.nav+' erste Bilder geladen',imageStates.every(x=>x.ok));
   if(!imageStates.every(x=>x.ok))console.warn('BILDPROBLEME',JSON.stringify(imageStates));
   try{await page.screenshot({path:'artifacts/vorschau/'+device.name+'-'+v.id+'.png',fullPage:false,animations:'allow',timeout:12000});}catch(e){console.warn('Bildschirmfoto nicht verfügbar:',v.id,String(e).slice(0,180));}
   if(device.width<800){
    const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,fenster:innerWidth}));
    assert(device.name+' '+v.nav+' ohne waagrechten Überlauf',widths.page<=widths.fenster+3);
   }
  }
  assert(device.name+' keine JavaScript-Ausnahmen',exceptions.length===0);
  if(exceptions.length)console.error('JS-AUSNAHMEN',exceptions);
 }catch(error){
  fail=true;console.error('FEHLER beim Durchlauf',device.name,error);
  await page.screenshot({path:'artifacts/vorschau/'+device.name+'-fehler.png',fullPage:false}).catch(()=>{});
 }finally{await context.close();}
}
await browser.close();
if(fail)process.exitCode=1;
