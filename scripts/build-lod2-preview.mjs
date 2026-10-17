import {writeFile,mkdir} from 'node:fs/promises';
const bbox='8.663,50.106,8.679,50.114';
let cursor='',list=[],attrib=[];
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
 attrib=result.lodapi?.attribution||[];
 cursor=result.lodapi?.next||'';
 console.log('Frankfurt 3D surfaces',list.length);
 if(!cursor)break;
}
if(list.length<100)throw Error('Insufficient geometry for city block');
await mkdir('public/lod2',{recursive:true});
await writeFile('public/lod2/frankfurt-preview.json',JSON.stringify({bbox,features:list,source:'HLBG · Hessische Geobasisdaten',attribution:attrib,api:'Powered by Lodapi',partial:Boolean(cursor)}));
console.log('Model faces stored',list.length);
