#!/usr/bin/env node
// Probe official Hessen INSPIRE LoD2 feature JSON geometry; never fabricate building models.
import {writeFile,mkdir} from 'node:fs/promises';
const root='https://www.geoportal.hessen.de/spatial-objects/831/collections/bu-core3d:Building/items';
const url=root+'?bbox=8.672,50.107,8.674,50.109&limit=3&f=json';
const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
try{
 const res=await fetch(url,{signal:ctl.signal,headers:{Accept:'application/geo+json,application/json'}});
 const body=await res.text();
 const output={url,status:res.status,contentType:res.headers.get('content-type'),sample:body.slice(0,28000)};
 await mkdir('artifacts/lod2',{recursive:true});
 await writeFile('artifacts/lod2/inspector.json',JSON.stringify(output,null,2));
 console.log('LoD2 probe HTTP:',res.status,'mime:',output.contentType,'bytes:',body.length);
 if(res.ok){
  const j=JSON.parse(body);
  console.log('keys',Object.keys(j),'features',j.features?.length??null,'geometry',JSON.stringify(j.features?.[0]?.geometry||{}).slice(0,650));
 }
}catch(e){console.warn('LoD2 API sample unavailable:',e.message)}
finally{clearTimeout(timer)}
