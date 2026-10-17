'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Layers3,LocateFixed,Minus,Plus,MapPin,Check,SlidersHorizontal,X,Sun,Sunset} from 'lucide-react';
import type {Map as LibreMap,Marker as LibreMarker} from 'maplibre-gl';

export type AtlasPlace={
 id:string;name:string;latitude:number|null;longitude:number|null;category:string;
 district?:string|null;description_de?:string|null;description_en?:string|null;address?:string|null;
};
export type AtlasMode='day'|'golden';
type Props={
 places:AtlasPlace[];
 lang?:'de'|'en';
 variant?:'hero'|'full';
 onSelect?:(id:string)=>void;
};
type Area={id:string,de:string,en:string,center:[number,number],zoom:number,bearing:number};
const CENTER:[number,number]=[8.6773,50.1106];
const DISTRICTS:Area[]=[
 {id:'city',de:'Frankfurt',en:'Frankfurt',center:CENTER,zoom:14.55,bearing:-23},
 {id:'altstadt',de:'Altstadt',en:'Old Town',center:[8.6832,50.1101],zoom:16.25,bearing:-28},
 {id:'sachsenhausen',de:'Sachsenhausen',en:'Sachsenhausen',center:[8.6859,50.1014],zoom:15.8,bearing:24},
 {id:'westend',de:'Westend',en:'Westend',center:[8.6620,50.1182],zoom:15.7,bearing:-13},
 {id:'nordend',de:'Nordend',en:'Nordend',center:[8.6994,50.1202],zoom:15.6,bearing:35},
 {id:'bornheim',de:'Bornheim',en:'Bornheim',center:[8.7118,50.1256],zoom:15.7,bearing:-26},
 {id:'ostend',de:'Ostend',en:'Ostend',center:[8.7095,50.1097],zoom:15.5,bearing:16}
];
const CATS=[
 {value:'Alle',de:'Alle',en:'All'},
 {value:'Restaurants',de:'Essen',en:'Food'},
 {value:'Kultur',de:'Kultur',en:'Culture'},
 {value:'Natur',de:'Draußen',en:'Outdoors'},
 {value:'Sehenswürdigkeiten',de:'Highlights',en:'Highlights'}
] as const;
const UI={
 de:{title:'Frankfurt entdecken.',subtitle:'Eine Stadt. Unzählige Perspektiven.',focus:'Deine Stadt in 3D',hint:'Ziehen, drehen und zoomen',map:'3D Stadtatlas',places:'Orte',district:'Viertel',select:'Ort ansehen',choose:'Stadtteil wählen',view:'Ansicht',day:'Tag',golden:'Abend',zoomIn:'Vergrößern',zoomOut:'Verkleinern',reset:'Frankfurt zentrieren',mode3d:'3D',mode2d:'2D',loading:'Die Stadt wird geladen …',error:'Die Karte konnte nicht geladen werden.',retry:'Neu laden',empty:'In dieser Auswahl gibt es noch keine veröffentlichten Orte.',tip:'Gebäudehöhen aus OpenStreetMap, wo vorhanden',credit:'© OpenStreetMap · OpenMapTiles · OpenFreeMap',back:'Zurück zur Stadt'},
 en:{title:'Discover Frankfurt.',subtitle:'One city. A thousand perspectives.',focus:'Your city in 3D',hint:'Drag, rotate and zoom',map:'3D City Atlas',places:'Places',district:'Neighborhoods',select:'View place',choose:'Choose a district',view:'View',day:'Day',golden:'Evening',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Center Frankfurt',mode3d:'3D',mode2d:'2D',loading:'Loading your city …',error:'The map could not be loaded.',retry:'Reload map',empty:'There are no published places in this category yet.',tip:'Building heights from OpenStreetMap where available',credit:'© OpenStreetMap · OpenMapTiles · OpenFreeMap',back:'Back to the city'}
};
const VECTOR_STYLE='https://tiles.openfreemap.org/styles/bright';
const fallbackRaster={
 version:8 as const,
 sources:{osm:{type:'raster' as const,tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},
 layers:[{id:'osm',type:'raster' as const,source:'osm'}]
};
const validCoords=(p:AtlasPlace)=>p.latitude!=null&&p.longitude!=null&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=49.95&&p.latitude<=50.25&&p.longitude>=8.35&&p.longitude<=8.95;
function isSelectedCategory(p:AtlasPlace,cat:string){
 if(cat==='Alle')return true;
 const c=p.category.toLowerCase();
 if(cat==='Restaurants')return /restaurant|café|cafe|brunch|bar|food|essen|gastronom/i.test(c);
 if(cat==='Kultur')return /kultur|museum|kunst|theater|music|musik|kultur/i.test(c);
 if(cat==='Natur')return /natur|park|garden|garten|outdoor|grün/i.test(c);
 if(cat==='Sehenswürdigkeiten')return /sehenswürd|sight|attraktion|landmark|monument/i.test(c);
 return c===cat.toLowerCase();
}
function setColorScheme(map:LibreMap,mode:AtlasMode){
 // Only existing underlying vector layers are changed; keep accurate roads and POIs.
 const layers=map.getStyle().layers;
 if(!layers)return;
 for(const layer of layers){
  if(layer.type==='fill'&&/water|river|lake/i.test(layer.id)){
   try{map.setPaintProperty(layer.id,'fill-color',mode==='golden'?'#91adb3':'#9cbfc3')}catch{}
  }
  if(layer.type==='fill'&&/park|landcover|grass|wood|forest/i.test(layer.id)){
   try{map.setPaintProperty(layer.id,'fill-color',mode==='golden'?'#b9bea8':'#d1dece')}catch{}
  }
 }
 if(map.getLayer('ffm-architecture'))map.setPaintProperty('ffm-architecture','fill-extrusion-color',mode==='golden'
 ? ['interpolate',['linear'],['coalesce',['get','render_height'],['get','height'],12],0,'#d9cab8',90,'#be9f91',260,'#8b7778']
 : ['interpolate',['linear'],['coalesce',['get','render_height'],['get','height'],12],0,'#dfddd6',90,'#b9c4c2',260,'#899e9d']);
}
function add3DBuildings(map:LibreMap){
 if(map.getLayer('ffm-architecture'))return;
 if(!map.getSource('ffm-openmaptiles')){
  map.addSource('ffm-openmaptiles',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors'});
 }
 const labels=map.getStyle().layers?.find(l=>l.type==='symbol'&&Boolean(l.layout&&('text-field' in l.layout)));
 map.addLayer({
  id:'ffm-architecture',
  type:'fill-extrusion',
  source:'ffm-openmaptiles',
  'source-layer':'building',
  minzoom:14,
  filter:['!=',['get','hide_3d'],true],
  paint:{
   'fill-extrusion-color':'#d5d7d1',
   'fill-extrusion-height':['interpolate',['linear'],['zoom'],14.0,0,15.25,['coalesce',['get','render_height'],['get','height'],12]],
   'fill-extrusion-base':['interpolate',['linear'],['zoom'],14.0,0,15.25,['coalesce',['get','render_min_height'],['get','min_height'],0]],
   'fill-extrusion-opacity':0.95,
   'fill-extrusion-vertical-gradient':true
  }
 },labels?.id);
}
function textLang(de:string,en:string,lang:'de'|'en'){return lang==='de'?de:en}

export default function Atlas3D({places,lang='de',variant='full',onSelect}:Props){
 const t=UI[lang];
 const mapDiv=useRef<HTMLDivElement>(null), mapRef=useRef<LibreMap|null>(null), markersRef=useRef<LibreMarker[]>([]);
 const [area,setArea]=useState('city'),[cat,setCat]=useState('Alle'),[mode,setMode]=useState<AtlasMode>('day'),[is3D,set3D]=useState(true),[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<string|null>(null),[showDistricts,setShowDistricts]=useState(false);
 const state=useRef({mode:'day' as AtlasMode,is3D:true});
 const selectedPlace=places.find(p=>p.id===selected);
 const filtered=useMemo(()=>places.filter(p=>validCoords(p)&&isSelectedCategory(p,cat)),[places,cat]);
 const moveTo=useCallback((place:AtlasPlace)=>{
  setSelected(place.id);
  if(validCoords(place)){mapRef.current?.flyTo({center:[place.longitude as number,place.latitude as number],zoom:Math.max(mapRef.current.getZoom(),16.1),pitch:state.current.is3D?56:0,bearing:state.current.is3D?-22:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1350,padding:{top:110,bottom:variant==='hero'?190:240,left:24,right:24}});}
 },[variant]);
 const goDistrict=useCallback((id:string)=>{
  setArea(id);setShowDistricts(false);setSelected(null);
  const d=DISTRICTS.find(x=>x.id===id)||DISTRICTS[0];
  const prefersLess=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  mapRef.current?.flyTo({center:d.center,zoom:d.zoom,bearing:state.current.is3D?d.bearing:0,pitch:state.current.is3D?56:0,duration:prefersLess?0:1700,essential:true});
 },[]);
 const zoom=useCallback((delta:number)=>mapRef.current?.zoomTo(Math.max(10.5,Math.min(19,mapRef.current.getZoom()+delta)),{duration:350}),[]);
 useEffect(()=>{
  if(!mapDiv.current)return;
  let cancelled=false,hasStyle=false,triedRaster=false;
  import('maplibre-gl').then(({default:maplibre})=>{
   if(cancelled||!mapDiv.current)return;
   if(!maplibre.supported()){setError(true);return;}
   const map=new maplibre.Map({
    container:mapDiv.current,style:VECTOR_STYLE,center:CENTER,zoom:14.55,pitch:55,bearing:-23,
    maxZoom:19,minZoom:10.8,maxPitch:75,attributionControl:{compact:true},
    canvasContextAttributes:{antialias:true},fadeDuration:250
   });
   mapRef.current=map;
   const onStyle=()=>{
    if(cancelled)return;
    hasStyle=true;setError(false);setReady(true);
    try{
     if(!triedRaster){add3DBuildings(map);setColorScheme(map,state.current.mode);}
    }catch(e){console.warn('FFM Atlas building layer unavailable:',e);}
   };
   map.on('load',onStyle);
   map.on('error',e=>{
    if(cancelled||hasStyle)return;
    console.warn('FFM Atlas base map:',e.error);
    if(!triedRaster){
     triedRaster=true;setFallback(true);
     map.setStyle(fallbackRaster);
    }else{setError(true);}
   });
   map.addControl(new maplibre.AttributionControl({compact:true}),'bottom-right');
  }).catch(()=>{if(!cancelled)setError(true);});
  return()=>{cancelled=true;markersRef.current.forEach(m=>m.remove());markersRef.current=[];mapRef.current?.remove();mapRef.current=null;};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  state.current={mode,is3D};
  if(!fallback)setColorScheme(map,mode);
  map.easeTo({pitch:is3D?56:0,bearing:is3D?(DISTRICTS.find(x=>x.id===area)?.bearing??-23):0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:850});
  if(!fallback&&map.getLayer('ffm-architecture'))map.setLayoutProperty('ffm-architecture','visibility',is3D?'visible':'none');
 },[mode,is3D,area,ready,fallback]);
 useEffect(()=>{
  let dead=false;
  import('maplibre-gl').then(({default:maplibre})=>{
   if(dead||!mapRef.current||!ready)return;
   markersRef.current.forEach(marker=>marker.remove());
   markersRef.current=filtered.map(p=>{
    const el=document.createElement('button');el.type='button';el.className='atlas-pin'+(p.id===selected?' is-selected':'');
    el.setAttribute('aria-label',p.name);el.title=p.name;
    const center=document.createElement('span');center.className='atlas-pin-core';el.appendChild(center);
    const tag=document.createElement('span');tag.className='atlas-pin-label';tag.textContent=p.name;el.appendChild(tag);
    el.addEventListener('click',()=>moveTo(p));
    return new maplibre.Marker({element:el,anchor:'bottom'}).setLngLat([p.longitude as number,p.latitude as number]).addTo(mapRef.current!);
   });
  });
  return()=>{dead=true;markersRef.current.forEach(m=>m.remove());markersRef.current=[];};
 },[ready,filtered,moveTo,selected]);
 const counts=filtered.length;
 return <section className={'atlas-root atlas-'+variant+' atlas-tone-'+mode} aria-label={t.map}>
  <div className="atlas-map-host" ref={mapDiv} aria-label={t.map} role="application"/>
  <div className="atlas-veil" aria-hidden="true"/>
  <div className="atlas-topbar">
   <div className="atlas-brand"><span className="atlas-brand-id">ffm<span>.</span></span><div><small>{t.focus}</small><strong>{t.title}</strong></div></div>
   <div className="atlas-tools">
    <button type="button" className={'atlas-tone-button'+(mode==='golden'?' active':'')} onClick={()=>setMode(x=>x==='day'?'golden':'day')} title={mode==='day'?t.golden:t.day} aria-label={mode==='day'?t.golden:t.day}>{mode==='day'?<Sunset size={17}/>:<Sun size={17}/>}<span>{mode==='day'?t.golden:t.day}</span></button>
    <button type="button" className="atlas-dim-button" aria-pressed={is3D} onClick={()=>set3D(x=>!x)} title={t.view}>{is3D?'3D':'2D'}</button>
   </div>
  </div>
  <div className="atlas-micro"><span className="atlas-red-dot"/> FRANKFURT AM MAIN <span className="atlas-micro-separator"/> 50°06&apos; N · 08°41&apos; E</div>
  <div className="atlas-category-tabs" role="group" aria-label={t.places}>
   {CATS.map(item=><button type="button" key={item.value} className={cat===item.value?'selected':''} onClick={()=>{setCat(item.value);setSelected(null);}} aria-pressed={cat===item.value}>{lang==='de'?item.de:item.en}</button>)}
  </div>
  <div className="atlas-map-utilities">
   <button aria-label={t.zoomIn} title={t.zoomIn} onClick={()=>zoom(1)}><Plus size={20}/></button>
   <button aria-label={t.zoomOut} title={t.zoomOut} onClick={()=>zoom(-1)}><Minus size={20}/></button>
   <button aria-label={t.reset} title={t.reset} onClick={()=>goDistrict('city')}><LocateFixed size={20}/></button>
  </div>
  <div className="atlas-bottom">
   {selectedPlace?<div className="atlas-selection" role="region" aria-label={selectedPlace.name}>
     <button type="button" onClick={()=>setSelected(null)} className="atlas-selection-close" aria-label="Close"><X size={17}/></button>
     <div className="atlas-selection-text"><span>{selectedPlace.district||'Frankfurt'} · {selectedPlace.category}</span><strong>{selectedPlace.name}</strong><small>{lang==='de'?selectedPlace.description_de||selectedPlace.address:selectedPlace.description_en||selectedPlace.address}</small></div>
     <button type="button" onClick={()=>onSelect?.(selectedPlace.id)} className="atlas-selection-cta">{t.select}<span className="atlas-selection-circle"><Plus size={18}/></span></button>
    </div>:<div className="atlas-explore-card">
     <div className="atlas-bottom-copy"><span>{t.subtitle}</span><strong>{DISTRICTS.find(d=>d.id===area)?.[lang]||'Frankfurt'}</strong><small>{fallback?t.tip:ready?t.hint:t.loading}</small></div>
     <button type="button" onClick={()=>setShowDistricts(x=>!x)} className="atlas-district-toggle" aria-expanded={showDistricts}><Layers3 size={18}/><span>{t.choose}</span><span className="atlas-mini-plus"><Plus size={15}/></span></button>
    </div>}
   {showDistricts&&<div className="atlas-district-picker" role="group" aria-label={t.district}>
    {DISTRICTS.map(d=><button type="button" key={d.id} onClick={()=>goDistrict(d.id)} className={area===d.id?'active':''}><span>{lang==='de'?d.de:d.en}</span>{area===d.id?<Check size={16}/>:<span className="atlas-district-dot"/>}</button>)}
   </div>}
  </div>
  <div className="atlas-credits"><span>{t.credit}</span><span>{t.tip}</span></div>
  {!ready&&!error&&<div className="atlas-map-loading" role="status"><div className="atlas-loading-mark"><span/></div><strong>FFM ATLAS</strong><small>{t.loading}</small></div>}
  {error&&<div className="atlas-map-loading atlas-map-error" role="alert"><strong>{t.error}</strong><button onClick={()=>window.location.reload()}>{t.retry}</button></div>}
 </section>;
}
