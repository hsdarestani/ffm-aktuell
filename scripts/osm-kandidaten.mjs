#!/usr/bin/env node
/**
 * Erstkandidaten für FFM Aktuell aus OpenStreetMap/Overpass. Kein automatisches
 * Publizieren, kein "geöffnet" versprechen. Nachweise und Betreiberstatus werden
 * redaktionell nachgeprüft. © OpenStreetMap contributors (ODbL).
 */
import {writeFile, mkdir} from 'node:fs/promises';
const BBOX='50.045,8.555,50.195,8.810'; // Frankfurt Kerngebiet, Overpass lat lon
const osmQuery='[out:json][timeout:65];(nwr["amenity"~"^(cafe|bar|pub|restaurant|fast_food|nightclub|food_court|biergarten)$"]('+BBOX+');nwr["leisure"~"^(sports_centre|pitch|fitness_centre|stadium)$"]('+BBOX+');nwr["tourism"~"^(museum|gallery)$"]('+BBOX+');nwr["sport"~"^(soccer|padel)$"]('+BBOX+');nwr["club"~"^(sport|running|hiking|literature)$"]('+BBOX+'););out center tags;';
const categories=(t)=>{
 const x=[t.amenity,t.leisure,t.tourism,t.sport,t.cuisine,t.name].filter(Boolean).join(' ').toLowerCase();
 if(/shisha|hookah|wasserpfeife/.test(x))return 'Shisha Bars';
 if(t.amenity==='nightclub')return 'Clubs';
 if(t.amenity==='cafe')return 'Cafés';
 if(t.amenity==='restaurant')return 'Restaurants';
 if(t.amenity==='fast_food'||t.amenity==='food_court')return 'Imbiss';
 if(t.amenity==='bar'||t.amenity==='pub'||t.amenity==='biergarten')return 'Bars';
 if(t.tourism==='museum'||t.tourism==='gallery')return 'Museen';
 if(t.sport==='padel')return 'Padel';
 if(t.sport==='soccer')return 'Fußball';
 if(t.leisure)return 'Sport';
 return 'Freizeit';
};
export function isClearlyClosed(t){
 return ['yes','true','1'].some(y=>t.disused===y||t.abandoned===y||t.demolished===y)
 ||t.shop==='vacant'||t['disused:shop']!=null||t['disused:amenity']!=null||t['abandoned:amenity']!=null
 ||t.opening_hours==='closed'||t.lifecycle==='disused';
}
export function candidatesFromOSM(elements){
 const ids=new Set();const result=[];
 for(const e of elements){
  const t=e.tags||{},name=String(t.name||'').trim();
  if(!name||isClearlyClosed(t))continue;
  const osm_id=e.type+'/'+e.id;if(ids.has(osm_id))continue;ids.add(osm_id);
  const latitude=e.lat??e.center?.lat,longitude=e.lon??e.center?.lon;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;
  const address=[t['addr:street'],t['addr:housenumber'],t['addr:postcode'],t['addr:city']].filter(Boolean).join(' ');
  result.push({
   name,category:categories(t),latitude,longitude,address,
   website:t.website||t['contact:website']||null,
   phone:t.phone||t['contact:phone']||null,
   opening_hours:t.opening_hours||null,
   last_osm_check:t['check_date:opening_hours']||t.check_date||null,
   osm_id,osm_url:'https://www.openstreetmap.org/'+e.type+'/'+e.id,
   activity_status:'unknown',verification_status:'unverified',
   note:'Kandidat, kein aktueller Betriebs- oder Öffnungsnachweis'
  });
 }
 return result.sort((a,b)=>a.category.localeCompare(b.category,'de')||a.name.localeCompare(b.name,'de'));
}
async function main(){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),85000);
 try{
  const endpoint=process.env.OVERPASS_ENDPOINT||'https://overpass.kumi.systems/api/interpreter';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'FFMAktuell-EditorialImport/1.0 (manual-review-only)'},body:new URLSearchParams({data:osmQuery}),signal:controller.signal});
  if(!r.ok)throw Error('Overpass HTTP '+r.status);
  const data=await r.json();
  if(!Array.isArray(data.elements))throw Error('Overpass lieferte keine Elemente');
  const records=candidatesFromOSM(data.elements);
  const output=process.env.OUTPUT||'artifacts/osm-kandidaten.json';
  await mkdir(output.split('/').slice(0,-1).join('/')||'.',{recursive:true});
  await writeFile(output,JSON.stringify({generated_at:new Date().toISOString(),source:'© OpenStreetMap contributors · ODbL',editorial_review_required:true,candidates:records},null,2),'utf8');
  console.log('Kandidaten:',records.length,'Datei:',output,'KEINE Veröffentlichung');
 }finally{clearTimeout(timeout)}
}
if(import.meta.url===new URL('file:'+process.argv[1]).href)main().catch(e=>{console.error('Import nicht erfolgreich:',e.message);process.exitCode=1});
