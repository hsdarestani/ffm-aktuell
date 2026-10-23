'use client';
import {useState} from 'react';
import {MapPin,Plus,Minus} from 'lucide-react';
import {useUiText} from '@/lib/ui-locale';
/** OSM raster tiles work without WebGL. The marker stays on the supplied coordinates. */
export default function PlaceRasterMap({name,latitude,longitude}:{name:string;latitude:number;longitude:number}){
 const ui=useUiText(),[zoom,setZoom]=useState(16),[failed,setFailed]=useState(false);
 const scale=2**zoom,sin=Math.sin(latitude*Math.PI/180);
 const x=(longitude+180)/360*scale,y=(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale;
 const tx=Math.floor(x),ty=Math.floor(y);
 const tiles=Array.from({length:25},(_,i)=>({x:tx+i%5-2,y:ty+Math.floor(i/5)-2}));
 return <div className="ffm-place-raster" role="region" aria-label={ui('Kartenposition: ')+name}>
  <div className="ffm-place-raster-tiles" aria-hidden="true">{tiles.map(t=><img key={`${zoom}/${t.x}/${t.y}`} alt="" draggable={false} loading="lazy" src={`https://tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png`}
   style={{position:'absolute',width:256,height:256,maxWidth:'none',left:`calc(50% + ${(t.x-x)*256}px)`,top:`calc(50% + ${(t.y-y)*256}px)`}} onError={()=>setFailed(true)}/>)}</div>
  <MapPin className="ffm-place-raster-pin" size={36} fill="#fff" aria-hidden="true"/>
  <div className="ffm-place-raster-controls"><button type="button" disabled={zoom===18} aria-label={ui('Vergrößern')} onClick={()=>{setFailed(false);setZoom(z=>Math.min(18,z+1))}}><Plus size={19}/></button><button type="button" disabled={zoom===12} aria-label={ui('Verkleinern')} onClick={()=>{setFailed(false);setZoom(z=>Math.max(12,z-1))}}><Minus size={19}/></button></div>
  {failed&&<p className="ffm-place-raster-error" role="status">{ui('Kartendaten derzeit nicht erreichbar. Bitte Karte extern öffnen.')}</p>}
 </div>;
}
