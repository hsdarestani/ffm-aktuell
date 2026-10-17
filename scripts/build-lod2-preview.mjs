import {writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
const bbox='8.674,50.108,8.684,50.113';
let cursor='',list=[];
for(let i=0;i<4;i++){
 const url=new URL('https://api.lodapi.de/v1/buildings');
 url.searchParams.set('bbox',bbox);url.searchParams.set('limit','500');
 if(cursor)url.searchParams.set('cursor',cursor);
 const response=await fetch(url);
 if(!response.ok)throw Error('Building dataset HTTP '+response.status);
 const result=await response.json();
 for(const feature of result.features||[]){
  if(feature.geometry?.type==='MultiPolygon'&&feature.properties?.building_id)
   list.push({b:feature.properties.building_id,s:feature.properties.surface_class,g:feature.geometry.coordinates});
 }
 cursor=result.lodapi?.next||'';
 console.log('Frankfurt 3D surfaces',list.length);
 if(!cursor)break;
}
if(list.length<100)throw Error('Insufficient geometry for city block');
await mkdir('public/lod2',{recursive:true});
await writeFile('public/lod2/frankfurt-preview.json.gz',gzipSync(JSON.stringify({bbox,features:list,source:'HLBG',attribution:'Powered by Lodapi'})));
console.log('Model faces stored',list.length);
