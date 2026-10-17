import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';

// Official surveyed LoD2 is fetched on demand only for zoomed-in districts.
// The entire city has a separate vector building 3D fallback on the map.
const WEST=8.4,SOUTH=49.98,DX=.0018,DY=.0013;
const DAY_MS=86400000;
type Face={s:number;g:number[][][][]};
type Tiles={faces:Face[];partial:boolean;source:string};
const tracker=globalThis as typeof globalThis & { ffmLod2Budget?:{day:number,used:number};ffmLod2Pending?:Map<string,Promise<Tiles>> };
const pending=tracker.ffmLod2Pending??new Map<string,Promise<Tiles>>();
tracker.ffmLod2Pending=pending;
function consume(){
 const day=Math.floor(Date.now()/DAY_MS);
 const b=tracker.ffmLod2Budget??{day,used:0};
 if(b.day!==day){b.day=day;b.used=0}
 // The anonymous Lodapi free tier has finite quotas. Stay within a deliberately
 // conservative budget; never cascade failures to OSM building rendering.
 if(b.used>=24)return false;
 b.used++;
 tracker.ffmLod2Budget=b;
 return true;
}
function validCoord(raw:string|null,min:number,max:number){
 if(!raw||!/^\d{1,3}$/.test(raw))return null;
 const n=Number(raw);
 return Number.isInteger(n)&&n>=min&&n<=max?n:null;
}
async function sourceTile(x:number,y:number):Promise<Tiles>{
 const a=WEST+x*DX,b=SOUTH+y*DY;
 const bounds=[a,b,a+DX,b+DY].map(n=>n.toFixed(6)).join(',');
 const faces:Face[]=[], seen=new Set<number>();
 let cursor='',partial=false;
 for(let i=0;i<2;i++){
  if(!consume())throw Error('Lodapi Tagesbudget erreicht');
  const u=new URL('https://api.lodapi.de/v1/buildings');
  u.searchParams.set('bbox',bounds);u.searchParams.set('limit','350');
  if(cursor)u.searchParams.set('cursor',cursor);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),10500);
  try{
   const r=await fetch(u,{headers:{Accept:'application/json'},signal:ctl.signal,cache:'no-store'});
   if(!r.ok)throw Error('LoD2 Quelle HTTP '+r.status);
   const raw=await r.json();
   if(!Array.isArray(raw.features))throw Error('LoD2 Format ungültig');
   for(const f of raw.features){
    const props=f?.properties;
    if(![709,710,712].includes(props?.surface_class)||!Number.isInteger(props?.surface_id)||seen.has(props.surface_id)||f.geometry?.type!=='MultiPolygon')continue;
    if(!Array.isArray(f.geometry.coordinates))continue;
    seen.add(props.surface_id);faces.push({s:props.surface_class,g:f.geometry.coordinates});
   }
   cursor=typeof raw.lodapi?.next==='string'?raw.lodapi.next:'';
   partial=Boolean(cursor);
   if(!cursor)break;
  }finally{clearTimeout(timer)}
 }
 return {faces,partial,source:'Amtliche Geobasisdaten Hessen · Powered by Lodapi'};
}
export async function GET(req:NextRequest){
 const x=validCoord(req.nextUrl.searchParams.get('x'),35,240);
 const y=validCoord(req.nextUrl.searchParams.get('y'),10,185);
 if(x==null||y==null)return NextResponse.json({error:'Kartenausschnitt außerhalb Frankfurt'},{status:400});
 const key=x+':'+y;
 try{
  const cached=await query<{data:Tiles}>('SELECT data FROM lod2_tiles WHERE tile_id=$1 AND fetched_at>now()-interval \'180 days\'',[key]);
  if(cached.rows[0])return NextResponse.json({...cached.rows[0].data,cached:true},{headers:{'Cache-Control':'public, max-age=3600, stale-while-revalidate=86400'}});
  if(pending.size>=3&&!pending.has(key))return NextResponse.json({error:'LoD2 ausgelastet'},{status:503,headers:{'Retry-After':'60'}});
  let job=pending.get(key);
  if(!job){
   job=sourceTile(x,y);
   pending.set(key,job);
   void job.finally(()=>pending.delete(key)).catch(()=>{});
  }
  const data=await job;
  if(!data.partial){
   await query('INSERT INTO lod2_tiles(tile_id,data) VALUES($1,$2::jsonb) ON CONFLICT(tile_id) DO UPDATE SET data=EXCLUDED.data,fetched_at=now()', [key,JSON.stringify(data)]);
  }
  return NextResponse.json({...data,cached:false},{headers:{'Cache-Control':data.partial?'no-store':'public, max-age=3600'}});
 }catch(e){
  console.warn('FFM LoD2 Kachel: ',e instanceof Error?e.message:'Fehler');
  return NextResponse.json({error:'Amtliches LoD2 gerade nicht verfügbar; Stadtplan bleibt aktiv'},{status:503,headers:{'Retry-After':'120'}});
 }
}
