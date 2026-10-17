import {writeFile,mkdir} from 'node:fs/promises';
// Small officially surveyed Frankfurt LoD2 map fragments. Splitting prevents API 504
// from large dense Innenstadt bounding-box requests.
const boxes=[
 '8.663,50.106,8.665,50.108',
 '8.667,50.107,8.669,50.109',
 '8.671,50.108,8.673,50.110',
 '8.675,50.109,8.677,50.111',
 '8.677,50.109,8.679,50.111'
];
const list=[],seen=new Set(),errors=[];
for(const bbox of boxes){
 let cursor='';
 for(let i=0;i<2;i++){
  const u=new URL('https://api.lodapi.de/v1/buildings');
  u.searchParams.set('bbox',bbox);u.searchParams.set('limit','100');
  if(cursor)u.searchParams.set('cursor',cursor);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),22000);
  try{
   const r=await fetch(u,{signal:ctl.signal,headers:{Accept:'application/json'}});
   if(!r.ok){errors.push(bbox+':HTTP '+r.status);break}
   const data=await r.json();
   for(const feature of data.features||[]){
    const p=feature.properties,g=feature.geometry;
    if(g?.type==='MultiPolygon'&&p?.building_id&&!seen.has(p.surface_id)){
     seen.add(p.surface_id);
     list.push({b:p.building_id,s:p.surface_class,g:g.coordinates});
    }
   }
   cursor=data.lodapi?.next||'';
   console.log('LoD2 city block',bbox,'page',i+1,'faces',list.length);
   if(!cursor)break;
  }catch(e){errors.push(bbox+':'+e.message);break}
  finally{clearTimeout(timer)}
 }
}
if(list.length<100)throw Error('Insufficient authentic LoD2 faces: '+list.length+' '+errors.join(';'));
await mkdir('public/lod2',{recursive:true});
await writeFile('public/lod2/frankfurt-preview.json',JSON.stringify({
 boxes,features:list,source:'HLBG · Hessische Geobasisdaten',
 attribution:'Powered by Lodapi',license:'DL-DE Zero 2.0',partial:true
}));
console.log('Real Frankfurt LoD2 faces',list.length,'issues',errors.join(';')||'none');
