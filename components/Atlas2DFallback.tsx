'use client';
import {useUiText} from '@/lib/ui-locale';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {AtlasPlace} from './Atlas3D';
import {LocateFixed,Minus,Plus} from 'lucide-react';
import {visibleMapPins,isRawMapId} from '@/lib/visible-map-pins';

type Coordinates=[number,number];
type Props={
 selectedId?:string|null;places:AtlasPlace[];category:string;lang:'de'|'en';center:Coordinates;initialZoom:number;
 onPick:(place:AtlasPlace)=>void;onCandidates:(items:AtlasPlace[])=>void;
};
const TILE=256,PI=Math.PI;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const xy=([lng,lat]:Coordinates,z:number)=>{
 const sin=Math.sin(clamp(lat,-85,85)*PI/180);
 const scale=TILE*2**z;
 return {x:(lng+180)/360*scale,y:(0.5-Math.log((1+sin)/(1-sin))/(4*PI))*scale};
};
const lngLat=(x:number,y:number,z:number):Coordinates=>{
 const scale=TILE*2**z,n=PI*(1-2*y/scale);
 return [((x/scale)*360-180+540)%360-180,180/PI*Math.atan(Math.sinh(n))];
};
const good=(p:AtlasPlace)=>Number.isFinite(p.longitude)&&Number.isFinite(p.latitude)&&
 p.longitude!==null&&p.latitude!==null&&Math.abs(p.longitude)<=180&&Math.abs(p.latitude)<=85;

export default function Atlas2DFallback({places,category,lang,center,initialZoom,onPick,onCandidates,selectedId}:Props){
 const ui=useUiText();
 const host=useRef<HTMLDivElement>(null),pointer=useRef<{x:number;y:number;center:Coordinates}|null>(null);
 const seen=useRef(new Set<string>()),[size,setSize]=useState({w:900,h:560});
 const [at,setAt]=useState<Coordinates>(center),[zoom,setZoom]=useState(clamp(Math.round(initialZoom),12,17));
 const [candidates,setCandidates]=useState<AtlasPlace[]>([]),[loaded,setLoaded]=useState(0),[tileMissing,setTileMissing]=useState(false);
 useEffect(()=>{setAt(center);setZoom(clamp(Math.round(initialZoom),12,17))},[center[0],center[1],initialZoom]);
 useEffect(()=>{
  if(!host.current)return;
  const observer=new ResizeObserver(entries=>{
   const r=entries[0]?.contentRect;
   if(r&&r.width>0&&r.height>0)setSize({w:r.width,h:r.height});
  });
  observer.observe(host.current);
  return()=>observer.disconnect();
 },[]);
 const centerXY=useMemo(()=>xy(at,zoom),[at,zoom]);
 const bounds=useMemo(()=>{
  const halfW=size.w/2,halfH=size.h/2;
  const left=clamp(Math.floor((centerXY.x-halfW)/TILE),0,2**zoom-1);
  const right=clamp(Math.floor((centerXY.x+halfW)/TILE),0,2**zoom-1);
  const top=clamp(Math.floor((centerXY.y-halfH)/TILE),0,2**zoom-1);
  const bottom=clamp(Math.floor((centerXY.y+halfH)/TILE),0,2**zoom-1);
  return {left,right,top,bottom};
 },[size,centerXY,zoom]);
 const tiles=useMemo(()=>{
  const arr:{key:string;x:number;y:number;left:number;top:number}[]=[];
  for(let y=bounds.top;y<=bounds.bottom;y++)for(let x=bounds.left;x<=bounds.right;x++)
   arr.push({key:zoom+'-'+x+'-'+y,x,y,left:x*TILE-centerXY.x+size.w/2,top:y*TILE-centerXY.y+size.h/2});
  return arr;
 },[bounds,centerXY,zoom,size]);
 const visible=useMemo(()=>{
  const dedup=new Map<string,AtlasPlace>();
  for(const p of [...places,...candidates])if(good(p))dedup.set(p.id,p);
  const projected=[...dedup.values()].map(p=>{
   const pt=xy([p.longitude as number,p.latitude as number],zoom);
   return {id:p.id,place:p,left:pt.x-centerXY.x+size.w/2,top:pt.y-centerXY.y+size.h/2};
  });
  return visibleMapPins(projected,size.w,size.h,selectedId);
 },[places,candidates,zoom,centerXY,size,selectedId]);
 useEffect(()=>{
  seen.current.clear();setLoaded(0);setTileMissing(false);
  const timer=window.setTimeout(()=>{if(seen.current.size===0)setTileMissing(true)},6500);
  return()=>window.clearTimeout(timer);
 },[zoom,Math.round(centerXY.x/256),Math.round(centerXY.y/256)]);
 useEffect(()=>{
  const ctl=new AbortController(),timer=window.setTimeout(async()=>{
   const west=lngLat(centerXY.x-size.w/2,centerXY.y+size.h/2,zoom);
   const east=lngLat(centerXY.x+size.w/2,centerXY.y-size.h/2,zoom);
   if(west[0]<8.2||east[0]>9.1||west[1]<49.7||east[1]>50.4)return;
   try{
    const r=await fetch('/api/discovery-map?'+new URLSearchParams({bbox:[west[0],west[1],east[0],east[1]].join(','),category}),{signal:ctl.signal});
    if(!r.ok)throw Error(ui("Candidate loading failed"));
    const d=await r.json();
    const found=(Array.isArray(d.items)?d.items:[]).filter((p:AtlasPlace)=>good(p)).slice(0,130) as AtlasPlace[];
    setCandidates(found);onCandidates(found);
   }catch(e){if(!ctl.signal.aborted)console.warn('FFM fallback candidate data unavailable',e)}
  },240);
  return()=>{window.clearTimeout(timer);ctl.abort()};
 },[centerXY.x,centerXY.y,zoom,size.w,size.h,category,onCandidates]);
 const move=useCallback((dx:number,dy:number,start:Coordinates=at)=>{
  const p=xy(start,zoom);setAt(lngLat(p.x-dx,p.y-dy,zoom));
 },[at,zoom]);
 const clickZoom=(delta:number)=>setZoom(z=>clamp(z+delta,12,17));
 return <div ref={host} className="atlas-2d-native" aria-label={lang==='de'?ui("Frankfurt Stadtplan mit Orten"):ui("Frankfurt city map with places")}>
  <div className="atlas-2d-plane" onPointerDown={e=>{
   if(e.button!==0)return;pointer.current={x:e.clientX,y:e.clientY,center:at};e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={e=>{
   if(!pointer.current)return;const p=pointer.current;move(e.clientX-p.x,e.clientY-p.y,p.center);
  }} onPointerUp={e=>{pointer.current=null;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}}
   onPointerCancel={()=>{pointer.current=null}}>
   <div className="atlas-2d-grid" aria-hidden="true"/>
   {tiles.map(t=><img key={t.key} src={'https://tile.openstreetmap.org/'+zoom+'/'+t.x+'/'+t.y+'.png'}
    alt="" draggable={false} decoding="async"
    onLoad={e=>{e.currentTarget.style.visibility='visible';if(seen.current.has(t.key))return;seen.current.add(t.key);setLoaded(seen.current.size);setTileMissing(false)}}
    onError={e=>{e.currentTarget.style.visibility='hidden'}}
    style={{position:'absolute',width:TILE,height:TILE,left:t.left,top:t.top,pointerEvents:'none'}}/>)}
   {visible.map(({place,left,top})=><button type="button" key={place.id}
    className={'atlas-2d-pin'+(isRawMapId(place.id)?' atlas-2d-pin-unknown':'')}
    style={{left,top}} title={place.name} aria-label={ui("Ort: ")+place.name+(isRawMapId(place.id)?ui(" · Ungeprüft"):'')}
    onPointerDown={e=>e.stopPropagation()}
    onClick={e=>{e.stopPropagation();onPick(place)}}>
    <span aria-hidden="true">●</span><span>{place.name}</span>
   </button>)}
  </div>
  <div className="atlas-2d-status" role="status">
   {tileMissing?(lang==='de'?ui("Straßenkarten derzeit nicht erreichbar. Orte lassen sich trotzdem wählen."):ui("Street tiles unavailable. Places remain selectable.")):
    lang==='de'?ui("2D Stadtplan · Ziehen und Orte antippen"):ui("2D city map · Drag and select places")}
  </div>
  <div className="atlas-2d-controls">
   <button type="button" title={ui("Zoom in")} aria-label={ui("Vergrößern")} onClick={()=>clickZoom(1)}><Plus size={17}/></button>
   <button type="button" title={ui("Zoom out")} aria-label={ui("Verkleinern")} onClick={()=>clickZoom(-1)}><Minus size={17}/></button>
   <button type="button" title={ui("Zurück zu Frankfurt")} aria-label={ui("Frankfurt zentrieren")} onClick={()=>{setAt(center);setZoom(clamp(Math.round(initialZoom),12,17))}}><LocateFixed size={17}/></button>
  </div>
  <div className="atlas-2d-credit">{loaded>0?ui("© OpenStreetMap contributors · ODbL"):ui("Ortskoordinaten: OpenStreetMap · ODbL")}
    <a href={'https://www.openstreetmap.org/#map='+zoom+'/'+at[1].toFixed(5)+'/'+at[0].toFixed(5)} target="_blank" rel="noopener noreferrer">{ui("In OpenStreetMap öffnen")}</a>
  </div>
 </div>;
}

