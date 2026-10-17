#!/usr/bin/env node
/** Converts original Oct-17 artifact plus live OSM pharmacy query into idempotent SQL.
  * A source inventory is never a business approval or opening-now declaration.
  */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {candidatesFromOSM} from './osm-kandidaten.mjs';
const file=process.argv[2]||'artifacts/import/osm-kandidaten.json';
const dest=process.argv[3]||'data/osm-discovery.sql';
const original=JSON.parse(await readFile(file,'utf8'));
if(!Array.isArray(original.candidates)||original.candidates.length<3000)throw Error('Original artifact missing expected 3000+ candidates');
const entries=new Map(original.candidates.map(x=>[x.osm_id,x]));
let pharmacyCount=0;
const query='[out:json][timeout:70];(nwr["amenity"="pharmacy"](50.045,8.555,50.195,8.810););out center tags;';
const base=process.env.OVERPASS_ENDPOINT||'https://overpass-api.de/api/interpreter';
const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),85000);
try{
 const r=await fetch(base,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'FFM-Aktuell-POI-Import/1.0'},body:new URLSearchParams({data:query}),signal:ctl.signal});
 if(!r.ok)throw Error('Pharmacy Overpass HTTP '+r.status);
 const data=await r.json();
 if(!Array.isArray(data.elements))throw Error('Pharmacy source invalid');
 for(const p of candidatesFromOSM(data.elements)){p.category='Apotheken';entries.set(p.osm_id,p);pharmacyCount++}
}finally{clearTimeout(t)}
if(pharmacyCount<50)throw Error('Pharmacy results incomplete: '+pharmacyCount);
const q=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''").replaceAll('\u0000','').slice(0,2000)+"'";
const out=['BEGIN;','-- OSM Kandidaten. Nicht verifiziert; niemals als Notdienst oder geöffnet kennzeichnen.','-- Quelle: © OpenStreetMap-Mitwirkende (ODbL).'];
let accepted=0;
for(const p of entries.values()){
 if(!/^(node|way|relation)\/\d+$/.test(p.osm_id))continue;
 if(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||p.latitude<49.7||p.latitude>50.4||p.longitude<8.2||p.longitude>9.1)continue;
 if(!p.name||!p.category)continue;
 out.push('INSERT INTO discovery_candidates (osm_id,name,category,latitude,longitude,address,website,phone,opening_hours,last_osm_check,osm_url) VALUES ('+
  [q(p.osm_id),q(p.name),q(p.category),Number(p.latitude),Number(p.longitude),q(p.address||''),q(p.website),q(p.phone),q(p.opening_hours),q(p.last_osm_check),q(p.osm_url)].join(',')+
  ") ON CONFLICT(osm_id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, address=EXCLUDED.address, website=EXCLUDED.website, phone=EXCLUDED.phone, opening_hours=EXCLUDED.opening_hours, last_osm_check=EXCLUDED.last_osm_check, osm_url=EXCLUDED.osm_url WHERE discovery_candidates.reviewed_status='unverified';");
 accepted++;
}
out.push('COMMIT;');
await mkdir(dirname(dest),{recursive:true});
await writeFile(dest,out.join('\n')+'\n');
await writeFile('data/osm-import-summary.json',JSON.stringify({original:original.candidates.length,pharmacies:pharmacyCount,merged:entries.size,accepted,source:'© OpenStreetMap-Mitwirkende · ODbL',verified:false},null,2));
console.log('Imported source artifact:',original.candidates.length,'Pharmacies from Overpass:',pharmacyCount,'Staged SQL rows:',accepted);
