'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useRef} from 'react';
export type MapPlace={id:string,name:string,latitude:number|null,longitude:number|null,category:string};
export default function CityMap({places,onSelect}:{places:MapPlace[],onSelect:(id:string)=>void}){
 const ui=useUiText();
 const el=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   if(!el.current)return;
   let cancelled=false;let dispose=()=>{};
   import('maplibre-gl').then(({default:maplibregl})=>{
     if(cancelled||!el.current)return;
     const map=new maplibregl.Map({container:el.current,center:[8.6821,50.1109],zoom:12.1,
       style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]}})
     map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
     const markers=places.filter(p=>p.latitude!=null&&p.longitude!=null).map(p=>{
       const button=document.createElement('button');button.type='button';button.className='map-pin';button.title=p.name;button.textContent='✳';button.addEventListener('click',()=>onSelect(p.id));
       return new maplibregl.Marker({element:button}).setLngLat([p.longitude as number,p.latitude as number]).addTo(map);
     });
     dispose=()=>{markers.forEach(m=>m.remove());map.remove();};
   }).catch(()=>{if(el.current)el.current.textContent='Map unavailable';});
   return ()=>{cancelled=true;dispose();};
 },[places,onSelect]);
 return <div className="city-map" ref={el} aria-label={ui("Frankfurt map")}/>;
}

