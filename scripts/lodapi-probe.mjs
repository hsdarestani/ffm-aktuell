import {writeFile,mkdir} from 'node:fs/promises';
const urls=[
'https://api.lodapi.de/v1/buildings?bbox=8.677,50.109,8.679,50.111&limit=30',
'https://api.lodapi.de/v1/tilesets?bbox=8.677,50.109,8.679,50.111'
];
await mkdir('artifacts/lodapi',{recursive:true});
for(let i=0;i<urls.length;i++){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{
  const r=await fetch(urls[i],{headers:{Accept:'application/json'},signal:controller.signal});
  const body=await r.text();
  const out={url:urls[i],status:r.status,contentType:r.headers.get('content-type'),body:body.slice(0,36000)};
  await writeFile('artifacts/lodapi/'+i+'.json',JSON.stringify(out,null,2));
  if(r.ok){const j=JSON.parse(body);console.log('Lodapi',i,'keys',Object.keys(j),'features',j.features?.length,'first',JSON.stringify(j.features?.[0]||j.tilesets?.[0]||j.lodapi).slice(0,1400))}
  else console.log('Lodapi HTTP',r.status,body.slice(0,250));
 }catch(e){console.log('Lodapi unavailable',i,e.message)}
 finally{clearTimeout(timeout)}
}
