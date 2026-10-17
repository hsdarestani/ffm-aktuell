#!/usr/bin/env node
/** Imports pharmacies from Geofabrik's current ODbL Hessen extract.
 * This never sets an emergency-duty or "open now" flag.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const src=process.argv[2]||'artifacts/pharmacies.geojson',out=process.argv[3]||'data/apotheken-import.sql';
const features=JSON.parse(await readFile(src,'utf8')).features||[];
console.log('Geofabrik sample pharmacy feature:',JSON.stringify(features[0]||{}).slice(0,1000));
const q=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''").replaceAll('\u0000','').slice(0,1800)+"'";
function center(g){
 if(g?.type==='Point')return g.coordinates;
 const points=[];
 function walk(x){if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')points.push(x);else x.forEach(walk)}
 walk(g?.coordinates);
 if(points.length<2)return null;
 return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
}
let inserted=0;
const rows=['BEGIN;','-- Apotheken-Quelle: Geofabrik Hessen OSM © OpenStreetMap-Mitwirkende · ODbL. Notdienst unbekannt.'];
const seen=new Set();
for(const f of features){
 const t=f.properties||{},name=String(t.name||'').trim(),pos=center(f.geometry);
 if(!name||!pos||pos[0]<8.555||pos[0]>8.810||pos[1]<50.045||pos[1]>50.195)continue;
 if(t.disused==='yes'||t.abandoned==='yes'||t['disused:amenity']||t['abandoned:amenity'])continue;
 let uid=String(f.id||t['@id']||'');
 let match=uid.match(/^([nwr])(\d+)$/)||uid.match(/^(node|way|relation)\/(\d+)$/);
 if(!match)continue;
 const type={n:'node',w:'way',r:'relation'}[match[1]]||match[1],id=type+'/'+match[2];
 if(seen.has(id))continue;seen.add(id);
 const addr=[t['addr:street'],t['addr:housenumber'],t['addr:postcode'],t['addr:city']].filter(Boolean).join(' ');
 const url='https://www.openstreetmap.org/'+id;
 rows.push('INSERT INTO discovery_candidates(osm_id,name,category,latitude,longitude,address,website,phone,opening_hours,last_osm_check,osm_url) VALUES('+
 [q(id),q(name),q('Apotheken'),pos[1],pos[0],q(addr),q(t.website||t['contact:website']),q(t.phone||t['contact:phone']),q(t.opening_hours),q(t['check_date:opening_hours']||t.check_date),q(url)].join(',')+
 ") ON CONFLICT(osm_id) DO UPDATE SET category='Apotheken',name=EXCLUDED.name,latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,address=EXCLUDED.address,website=EXCLUDED.website,phone=EXCLUDED.phone,opening_hours=EXCLUDED.opening_hours WHERE discovery_candidates.reviewed_status='unverified';");
 inserted++;
}
if(inserted<30)throw Error('Expected at least 30 Frankfurt pharmacy records, got '+inserted+' out of '+features.length);
rows.push('COMMIT;');
await mkdir('data',{recursive:true});
await writeFile(out,rows.join('\n')+'\n');
await writeFile('data/apotheken-import-summary.json',JSON.stringify({pharmacies:inserted,source:'Geofabrik Hessen / OpenStreetMap · ODbL',currentDutyUnknown:true,realTimeOpeningUnknown:true},null,2));
console.log('Pharmacies added to import source:',inserted,'No notdienst / openNow assertion');
