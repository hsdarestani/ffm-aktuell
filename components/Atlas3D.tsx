'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Layers3,LocateFixed,Minus,Plus,Check,X,Sun,Sunset} from 'lucide-react';
import type {Map as LibreMap,GeoJSONSource} from 'maplibre-gl';
import {KATEGORIEN,passendeRubrik} from '@/lib/ortskategorien';

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
const INTRO_CENTER:[number,number]=[8.6666,50.1074];
const POI_SOURCE='ffm-curated-geo';
const DISTRICTS:Area[]=[
 {id:'city',de:'Frankfurt',en:'Frankfurt',center:CENTER,zoom:14.55,bearing:-23},
 {id:'altstadt',de:'Altstadt',en:'Old Town',center:[8.6832,50.1101],zoom:16.25,bearing:-28},
 {id:'sachsenhausen',de:'Sachsenhausen',en:'Sachsenhausen',center:[8.6859,50.1014],zoom:15.8,bearing:24},
 {id:'westend',de:'Westend',en:'Westend',center:[8.6620,50.1182],zoom:15.7,bearing:-13},
 {id:'nordend',de:'Nordend',en:'Nordend',center:[8.6994,50.1202],zoom:15.6,bearing:35},
 {id:'bornheim',de:'Bornheim',en:'Bornheim',center:[8.7118,50.1256],zoom:15.7,bearing:-26},
 {id:'ostend',de:'Ostend',en:'Ostend',center:[8.7095,50.1097],zoom:15.5,bearing:16}
];
const CATS=KATEGORIEN;
const UI={
 de:{title:'Frankfurt entdecken.',subtitle:'Eine Stadt. Unzählige Perspektiven.',focus:'Deine Stadt in 3D',hint:'Ziehen, drehen und zoomen',map:'3D Stadtatlas',places:'Orte',district:'Viertel',select:'Ort ansehen',choose:'Stadtteil wählen',view:'Ansicht',day:'Tag',golden:'Abend',zoomIn:'Vergrößern',zoomOut:'Verkleinern',reset:'Frankfurt zentrieren',mode3d:'3D',mode2d:'2D',loading:'Die Stadt wird geladen …',error:'Die Karte konnte nicht geladen werden.',retry:'Neu laden',empty:'In dieser Auswahl gibt es noch keine veröffentlichten Orte.',tip:'Gebäudehöhen aus OpenStreetMap, wo vorhanden',credit:'© OpenStreetMap · OpenMapTiles · OpenFreeMap',back:'Zurück zur Stadt'},
 en:{title:'Discover Frankfurt.',subtitle:'One city. A thousand perspectives.',focus:'Your city in 3D',hint:'Drag, rotate and zoom',map:'3D City Atlas',places:'Places',district:'Neighborhoods',select:'View place',choose:'Choose a district',view:'View',day:'Day',golden:'Evening',zoomIn:'Zoom in',zoomOut:'Zoom out',reset:'Center Frankfurt',mode3d:'3D',mode2d:'2D',loading:'Loading your city …',error:'The map could not be loaded.',retry:'Reload map',empty:'There are no published places in this category yet.',tip:'Building heights from OpenStreetMap where available',credit:'© OpenStreetMap · OpenMapTiles · OpenFreeMap',back:'Back to the city'}
};
const VECTOR_STYLE='https://tiles.openfreemap.org/styles/bright';
// Official Hessian 20cm orthophotos. Free use under Datenlizenz Deutschland Zero 2.0.
// This imagery is aerial photography (2D), NOT textured 3D / live satellite data.
const LUFTBILD='https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows?language=ger&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=he_dop_rgb&STYLES=&FORMAT=image/jpeg&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512';
function addLuftbild(map:LibreMap){
 if(map.getSource('ffm-hessen-dop'))return;
 map.addSource('ffm-hessen-dop',{type:'raster',tiles:[LUFTBILD],tileSize:512,minzoom:0,maxzoom:19,
  attribution:'© Hessische Verwaltung für Bodenmanagement und Geoinformation · DOP20 (dl-zero-de/2.0)'});
 const under=map.getLayer('ffm-architecture')?'ffm-architecture':map.getStyle().layers?.find(l=>l.type==='symbol')?.id;
 map.addLayer({id:'ffm-luftbild',type:'raster',source:'ffm-hessen-dop',layout:{visibility:'none'},paint:{'raster-opacity':1,'raster-fade-duration':280}},under);
}

const fallbackRaster={
 version:8 as const,
 sources:{osm:{type:'raster' as const,tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},
 layers:[{id:'osm',type:'raster' as const,source:'osm'}]
};
const validCoords=(p:AtlasPlace)=>p.latitude!=null&&p.longitude!=null&&Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&p.latitude>=49.95&&p.latitude<=50.25&&p.longitude>=8.35&&p.longitude<=8.95;
function isSelectedCategory(p:AtlasPlace,cat:string){return passendeRubrik(p,cat);}
/** MapLibre's existing vector data is recolored in place. Unlike a tinted raster
 * overlay, this preserves 3D geometry and legible vector streets at every bearing. */
function setColorScheme(map:LibreMap,mode:AtlasMode){
 const dusk=mode==='golden';
 const layers=map.getStyle().layers??[];
 for(const layer of layers){
  const id=layer.id.toLowerCase();
  if(id.startsWith('ffm-'))continue;
  try{
   if(layer.type==='symbol'){
    // Remove commercial-style map noise (road shields, transit icons, POI spam).
    // City and neighborhood context stays visible beneath our curated locations.
    const keep=/(?:^|[-_])(place|city|town|suburb|neighbourhood|neighborhood|district|village|settlement|waterway|river)(?:$|[-_])/.test(id)
      && !/(shield|road|motorway|airport|bus|train|station|stop)/.test(id);
    map.setLayoutProperty(layer.id,'visibility',keep?'visible':'none');
    if(keep){
     map.setPaintProperty(layer.id,'text-color',dusk?'#444f4b':'#465b55');
     map.setPaintProperty(layer.id,'text-halo-color',dusk?'#e9ddd2':'#eaf0e8');
     map.setPaintProperty(layer.id,'text-halo-width',1.5);
    }
    continue;
   }
   if(layer.type==='background'){
    map.setPaintProperty(layer.id,'background-color',dusk?'#e7dacf':'#edf0e8');
   }else if(layer.type==='fill'){
    if(/water|river|lake|ocean|sea/.test(id))map.setPaintProperty(layer.id,'fill-color',dusk?'#82a9ae':'#96babe');
    else if(/park|wood|grass|forest|landcover|landuse|garden|green/.test(id))map.setPaintProperty(layer.id,'fill-color',dusk?'#b8c5ad':'#cbdac8');
    else if(/building/.test(id))map.setPaintProperty(layer.id,'fill-color',dusk?'#d4c5bb':'#d8dfd5');
    else if(/land|residential|industrial/.test(id))map.setPaintProperty(layer.id,'fill-color',dusk?'#ebdfd3':'#eef0e9');
   }else if(layer.type==='line'){
    if(/water/.test(id))map.setPaintProperty(layer.id,'line-color',dusk?'#8eaeb1':'#a6c6c6');
    else if(/road|street|bridge|highway|motorway|transport|rail|tunnel/.test(id)){
     const casing=/casing|outline|case/.test(id);
     map.setPaintProperty(layer.id,'line-color',casing?(dusk?'#d1c5b9':'#d7ded3'):(dusk?'#faf0e3':'#ffffff'));
    }
   }
  }catch(e){console.warn('Atlas optional paint layer:',layer.id,e);}
 }
 if(map.getLayer('ffm-architecture')){
  map.setPaintProperty('ffm-architecture','fill-extrusion-color',
   ['interpolate',['linear'],['coalesce',['get','render_height'],['get','height'],12],
    0,dusk?'#d8cbbd':'#d9e0d7',35,dusk?'#b8aba2':'#b9cbc2',
    110,dusk?'#908d8b':'#97aaa5',250,dusk?'#636c70':'#687e7c']);
  map.setPaintProperty('ffm-architecture','fill-extrusion-opacity',dusk?0.96:0.93);
 }
 // Soft directional lighting reveals tower mass and silhouettes without textures.
 try{
  const lightMap=map as unknown as {setLight?:(light:{anchor:string,color:string,intensity:number,position:number[]})=>void};
  lightMap.setLight?.({anchor:'viewport',color:dusk?'#fff1d9':'#f4fbf8',intensity:dusk?0.66:0.52,position:[1.5,210,38]});
 }catch{}
}
function add3DBuildings(map:LibreMap){
 if(map.getLayer('ffm-architecture'))return;
 if(!map.getSource('ffm-openmaptiles')){
  map.addSource('ffm-openmaptiles',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors'});
 }
 // Base footprints remain behind; 3D towers share the real map projection.
 const firstLabel=map.getStyle().layers?.find(l=>l.type==='symbol');
 map.addLayer({
  id:'ffm-architecture',type:'fill-extrusion',source:'ffm-openmaptiles','source-layer':'building',minzoom:13.5,
  paint:{
   'fill-extrusion-color':'#c6beb5',
   'fill-extrusion-height':['interpolate',['linear'],['zoom'],13.5,0,15.1,['coalesce',['get','render_height'],['get','height'],12]],
   'fill-extrusion-base':['interpolate',['linear'],['zoom'],13.5,0,15.1,['coalesce',['get','render_min_height'],['get','min_height'],0]],
   'fill-extrusion-opacity':0.96,'fill-extrusion-vertical-gradient':true
  }
 },firstLabel?.id);
}
function geoFeatures(places:AtlasPlace[]){
 return {type:'FeatureCollection' as const,features:places.map(p=>({
  type:'Feature' as const,id:p.id,properties:{id:p.id,name:p.name,category:p.category},
  geometry:{type:'Point' as const,coordinates:[p.longitude as number,p.latitude as number]}
 }))};
}
function addGeoPins(map:LibreMap){
 if(map.getSource(POI_SOURCE))return;
 map.addSource(POI_SOURCE,{type:'geojson',data:geoFeatures([])});
 // All rings are MapLibre GPU layers with a single GeoJSON coordinate source:
 // stable with pitch, bearing, zoom, container resize and mobile touch rotation.
 map.addLayer({id:'ffm-poi-halo',type:'circle',source:POI_SOURCE,
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,12,17,23],
   'circle-color':'#72575d','circle-opacity':0.13,
   'circle-blur':0.35,'circle-pitch-alignment':'map'}});
 map.addLayer({id:'ffm-poi-dot',type:'circle',source:POI_SOURCE,
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,6,17,10],
   'circle-color':'#805965','circle-stroke-color':'#fff8ee',
   'circle-stroke-width':3,'circle-pitch-alignment':'map'}});
 map.addLayer({id:'ffm-poi-labels',type:'symbol',source:POI_SOURCE,minzoom:16.3,
  layout:{'text-field':['get','name'],'text-size':12,'text-anchor':'top','text-offset':[0,1.25],
   'text-allow-overlap':false,'text-optional':true},
  paint:{'text-color':'#34423c','text-halo-color':'#f8f4ed','text-halo-width':2}});
 map.addLayer({id:'ffm-poi-selected-label',type:'symbol',source:POI_SOURCE,
  filter:['==',['get','id'],'__none__'],
  layout:{'text-field':['get','name'],'text-size':14,'text-anchor':'top','text-offset':[0,1.45],
   'text-allow-overlap':true},
  paint:{'text-color':'#26362f','text-halo-color':'#f9f6f0','text-halo-width':2}});
}
const OSM_SOURCE='ffm-osm-raw-pois';
function geoCandidateFeatures(places:AtlasPlace[]){
 return {type:'FeatureCollection' as const,features:places.filter(validCoords).map(p=>({
  type:'Feature' as const,properties:{id:p.id,name:p.name,category:p.category,
   address:p.address||'',verified:'false'},
  geometry:{type:'Point' as const,coordinates:[p.longitude as number,p.latitude as number]}
 }))};
}
function addCandidatePins(map:LibreMap){
 if(map.getSource(OSM_SOURCE))return;
 map.addSource(OSM_SOURCE,{type:'geojson',data:geoCandidateFeatures([]),
  cluster:true,clusterMaxZoom:16,clusterRadius:47});
 map.addLayer({id:'ffm-osm-clusters',type:'circle',source:OSM_SOURCE,
  filter:['has','point_count'],paint:{
   'circle-color':'#345448','circle-opacity':0.86,
   'circle-radius':['step',['get','point_count'],17,30,24,120,31],
   'circle-stroke-color':'#fff7e9','circle-stroke-width':2}});
 map.addLayer({id:'ffm-osm-cluster-count',type:'symbol',source:OSM_SOURCE,
  filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],
   'text-size':12,'text-allow-overlap':true},
  paint:{'text-color':'#fff9f1'}});
 map.addLayer({id:'ffm-osm-points',type:'circle',source:OSM_SOURCE,
  filter:['!', ['has','point_count']],
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,3.5,17,7],
   'circle-color':['case',['==',['get','category'],'Apotheken'],'#257a73','#8b6a57'],
   'circle-opacity':0.95,'circle-stroke-color':'#fff7e9','circle-stroke-width':1.5,
   'circle-pitch-alignment':'map'}});
}
function updateSelectedPin(map:LibreMap,selected:string|null){
 if(!map.getLayer('ffm-poi-dot'))return;
 const match=['==',['get','id'],selected??'__none__'];
 map.setPaintProperty('ffm-poi-dot','circle-color',['case',match,'#223d39','#805965']);
 map.setPaintProperty('ffm-poi-dot','circle-radius',['case',match,12,['interpolate',['linear'],['zoom'],12,6,17,10]]);
 map.setPaintProperty('ffm-poi-halo','circle-opacity',['case',match,0.3,0.13]);
 map.setFilter('ffm-poi-selected-label',['==',['get','id'],selected??'__none__']);
}

export default function Atlas3D({places,lang='de',variant='full',onSelect}:Props){
 const t=UI[lang];
 const mapDiv=useRef<HTMLDivElement>(null),mapRef=useRef<LibreMap|null>(null);
 const latestCandidates=useRef<AtlasPlace[]>([]);
 const latestPlaces=useRef(places),activeSelect=useRef<(p:AtlasPlace)=>void>(()=>{});
 latestPlaces.current=places;
 const [rawCandidates,setRawCandidates]=useState<AtlasPlace[]>([]);
 const [luftbild,setLuftbild]=useState(false),[luftbildFehler,setLuftbildFehler]=useState(false);
 const [area,setArea]=useState('city'),[cat,setCat]=useState('Alle'),[mode,setMode]=useState<AtlasMode>('golden'),[is3D,set3D]=useState(true),[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<string|null>(null),[showDistricts,setShowDistricts]=useState(false);
 const state=useRef({mode:'golden' as AtlasMode,is3D:true});
 const selectedPlace=[...places,...rawCandidates].find(p=>p.id===selected);
 const selectedIsOSM=Boolean(selectedPlace&&/^(node|way|relation)\//.test(selectedPlace.id));
 const filtered=useMemo(()=>places.filter(p=>validCoords(p)&&isSelectedCategory(p,cat)),[places,cat]);
 const moveTo=useCallback((place:AtlasPlace)=>{
  setSelected(place.id);
  if(validCoords(place)){mapRef.current?.flyTo({center:[place.longitude as number,place.latitude as number],zoom:Math.max(mapRef.current.getZoom(),16.1),pitch:state.current.is3D?56:0,bearing:state.current.is3D?-22:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1350,offset:[0,variant==='hero'?-48:-66]});}
 },[variant]);
 activeSelect.current=moveTo;
 const chooseCategory=useCallback((next:string)=>{
  setCat(next);setSelected(null);
  if(next==='Alle')return;
  const candidates=latestPlaces.current.filter(p=>validCoords(p)&&isSelectedCategory(p,next));
  if(candidates.length===1){
   // A category with one featured POI should never present an empty-looking map.
   // Its geo anchored dot and detail drawer are made immediately discoverable.
   activeSelect.current(candidates[0]);
  }else if(candidates.length>1&&mapRef.current){
   const lons=candidates.map(p=>p.longitude as number),lats=candidates.map(p=>p.latitude as number);
   const sw:[number,number]=[Math.min(...lons),Math.min(...lats)];
   const ne:[number,number]=[Math.max(...lons),Math.max(...lats)];
   const camera=mapRef.current.cameraForBounds([sw,ne],{padding:{top:150,bottom:190,left:54,right:54},maxZoom:15.6});
   if(camera?.center&&camera.zoom!=null)mapRef.current.flyTo({
    center:camera.center,zoom:camera.zoom,bearing:state.current.is3D?-22:0,
    pitch:state.current.is3D?53:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1180
   });
  }
 },[]);
 const goDistrict=useCallback((id:string)=>{
  setArea(id);setShowDistricts(false);setSelected(null);
  const d=DISTRICTS.find(x=>x.id===id)||DISTRICTS[0];
  const prefersLess=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  mapRef.current?.flyTo({center:d.center,zoom:d.zoom,bearing:state.current.is3D?d.bearing:0,pitch:state.current.is3D?56:0,duration:prefersLess?0:1700,essential:true});
 },[]);
 const zoom=useCallback((delta:number)=>mapRef.current?.zoomTo(Math.max(10.5,Math.min(19,mapRef.current.getZoom()+delta)),{duration:350}),[]);
 useEffect(()=>{
  if(!mapDiv.current)return;
  let cancelled=false,hasStyle=false,triedRaster=false,revealed=false;
  let revealTimer:number|undefined;
  import('maplibre-gl').then(({default:maplibre})=>{
   if(cancelled||!mapDiv.current)return;
   const canvas=document.createElement('canvas');
   let supported=false;try{supported=Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl'));}catch{}
   if(!supported){setError(true);return;}
   const map=new maplibre.Map({
    container:mapDiv.current,style:VECTOR_STYLE,center:INTRO_CENTER,zoom:14.1,pitch:49,bearing:-21,
    maxZoom:19,minZoom:10.8,maxPitch:75,attributionControl:false,
    canvasContextAttributes:{antialias:true},fadeDuration:250
   });
   mapRef.current=map;
   const revealScene=()=>{
    if(cancelled||revealed)return;
    revealed=true;
    if(revealTimer!==undefined)window.clearTimeout(revealTimer);
    setReady(true);
    if(!triedRaster&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
     // The first camera shot plays only once actual street and building tiles
     // have painted. No blank canvas or flying into unloaded skyscrapers.
     requestAnimationFrame(()=>{if(!cancelled)map.flyTo({
      center:CENTER,zoom:14.95,pitch:58,bearing:-24,
      duration:2250,curve:1.3,essential:true
     });});
    }else map.jumpTo({center:CENTER,zoom:14.95,pitch:state.current.is3D?58:0,bearing:-24});
   };
   const onStyle=()=>{
    if(cancelled)return;
    hasStyle=true;setError(false);
    try{
     if(!triedRaster){add3DBuildings(map);addLuftbild(map);setColorScheme(map,state.current.mode);addGeoPins(map);addCandidatePins(map);}
    }catch(e){console.warn('FFM Atlas optional 3D scene:',e);}
    // MapLibre 'style.load' only means style metadata loaded, NOT tiles.
    // 'idle' means the visible tile region has finished rendering.
    map.once('idle',revealScene);
    revealTimer=window.setTimeout(revealScene,15000); // recover from slow/blocking tiles
   };
   map.on('style.load',onStyle);
      map.on('click',e=>{
    if(map.getLayer('ffm-osm-clusters')){
     const cluster=map.queryRenderedFeatures(e.point,{layers:['ffm-osm-clusters']})[0];
     if(cluster){const id=Number(cluster.properties?.cluster_id);const g=cluster.geometry;
      if(g.type==='Point'&&Number.isFinite(id)){(map.getSource(OSM_SOURCE) as import('maplibre-gl').GeoJSONSource)
        .getClusterExpansionZoom(id).then(zoom=>map.easeTo({center:g.coordinates as [number,number],zoom:Math.min(zoom,19),duration:650})).catch(()=>{});}
      return;
     }
    }
    if(map.getLayer('ffm-osm-points')){
      const point=map.queryRenderedFeatures(e.point,{layers:['ffm-osm-points']})[0];
      if(point){const id=String(point.properties?.id||'');const p=latestCandidates.current.find(v=>v.id===id);
       if(p){setSelected(p.id);map.flyTo({center:[p.longitude as number,p.latitude as number],zoom:Math.max(15.8,map.getZoom()),duration:800})}return;}
    }
    if(!map.getLayer('ffm-poi-dot'))return;
    const feature=map.queryRenderedFeatures(e.point,{layers:['ffm-poi-dot']})[0];
    const id=feature?.properties?.id as string|undefined;
    if(!id)return;
    const place=latestPlaces.current.find(p=>p.id===id);
    if(place)activeSelect.current(place);
   });
   map.on('mousemove',e=>{
    if(map.getLayer('ffm-poi-dot'))map.getCanvas().style.cursor=
     (map.queryRenderedFeatures(e.point,{layers:['ffm-poi-dot']}).length||(map.getLayer('ffm-osm-points')&&map.queryRenderedFeatures(e.point,{layers:['ffm-osm-points','ffm-osm-clusters']}).length))?'pointer':'';
   });
   // E2E-only inspection, never activated on ordinary visitor pages.
   if(new URLSearchParams(window.location.search).has('atlasQA')){
    (window as unknown as {__ffmAtlasQA?:LibreMap}).__ffmAtlasQA=map;
   }
   map.on('error',e=>{
    if(cancelled)return;
    if(String(e.error?.message||'').includes('gds-srv.hessen.de')){setLuftbildFehler(true);setLuftbild(false);return;}
    if(hasStyle)return;
    console.warn('FFM Atlas base map:',e.error);
    if(!triedRaster){
     triedRaster=true;setFallback(true);
     map.setStyle(fallbackRaster);
    }else{setError(true);}
   });
   map.addControl(new maplibre.AttributionControl({compact:true}),'bottom-right');
  }).catch(()=>{if(!cancelled)setError(true);});
  return()=>{cancelled=true;if(revealTimer!==undefined)window.clearTimeout(revealTimer);mapRef.current?.remove();mapRef.current=null;};
 },[]);
 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  state.current={mode,is3D};
  if(!fallback)setColorScheme(map,mode);
  map.easeTo({pitch:is3D?56:0,bearing:is3D?(DISTRICTS.find(x=>x.id===area)?.bearing??-23):0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:850});
  if(!fallback&&map.getLayer('ffm-architecture'))map.setLayoutProperty('ffm-architecture','visibility',is3D&&!luftbild?'visible':'none');
  if(map.getLayer('ffm-luftbild'))map.setLayoutProperty('ffm-luftbild','visibility',luftbild?'visible':'none');
 },[mode,is3D,area,ready,fallback,luftbild]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!ready||fallback||!map||!map.getSource(OSM_SOURCE))return;
  let cancelled=false,timer:number|undefined,active:AbortController|null=null;
  const load=()=>{
   if(cancelled)return;
   active?.abort();active=new AbortController();
   const b=map.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
   if(bounds[0]<8.2||bounds[2]>9.1||bounds[1]<49.7||bounds[3]>50.4)return;
   const params=new URLSearchParams({bbox:bounds.join(','),category:cat});
   fetch('/api/discovery-map?'+params,{signal:active.signal})
    .then(r=>r.ok?r.json():Promise.reject(new Error('Kartendaten fehlen')))
    .then(data=>{
      if(cancelled||!map.getSource(OSM_SOURCE))return;
      const items=(data.items||[]).map((x:AtlasPlace)=>({...x,description_de:
       'Eintrag aus OpenStreetMap. Öffnungszeiten und Betriebsstatus nicht aktuell bestätigt.'}));
      latestCandidates.current=items;setRawCandidates(items);
      (map.getSource(OSM_SOURCE) as GeoJSONSource).setData(geoCandidateFeatures(items));
    }).catch(()=>{});
  };
  const moved=()=>{if(timer!==undefined)window.clearTimeout(timer);timer=window.setTimeout(load,280)};
  map.on('moveend',moved);load();
  return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer);active?.abort();map.off('moveend',moved)};
 },[ready,fallback,cat]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!ready||!map||!map.getSource(POI_SOURCE))return;
  (map.getSource(POI_SOURCE) as GeoJSONSource).setData(geoFeatures(filtered));
 },[ready,filtered]);
 useEffect(()=>{
  const map=mapRef.current;
  if(ready&&map&&!fallback)updateSelectedPin(map,selected);
 },[ready,selected,fallback]);
 const counts=filtered.length;
 return <section className={'atlas-root atlas-'+variant+' atlas-tone-'+mode} aria-label={t.map}>
  <div className="atlas-map-host" ref={mapDiv} aria-label={t.map} role="application"/>
  <div className="atlas-veil" aria-hidden="true"/>
  <div className="atlas-topbar">
   <div className="atlas-brand"><span className="atlas-brand-id">ffm<span>.</span></span><div><small>FRANKFURT AM MAIN</small><strong>{lang==='de'?'Deine Stadt. Neu entdeckt.':'Rediscover your city.'}</strong></div></div>
   <div className="atlas-tools">
    <button type="button" className={'atlas-tone-button'+(mode==='golden'?' active':'')} onClick={()=>setMode(x=>x==='day'?'golden':'day')} title={mode==='day'?t.golden:t.day} aria-label={mode==='day'?t.golden:t.day}>{mode==='day'?<Sunset size={17}/>:<Sun size={17}/>}<span>{mode==='day'?t.golden:t.day}</span></button>
    <button type="button" className={'atlas-air-button'+(luftbild?' active':'')} aria-pressed={luftbild} onClick={()=>{setLuftbildFehler(false);if(!luftbild)set3D(false);else set3D(true);setLuftbild(v=>!v)}} title="Amtliche Luftbilder statt Kartenzeichnung">{luftbild?'Stadtplan':'Luftbild'}</button>
    <button type="button" className="atlas-dim-button" aria-pressed={is3D} onClick={()=>{if(luftbild){setLuftbild(false);set3D(true)}else set3D(x=>!x)}} title={t.view}>{is3D?'3D':'2D'}</button>
   </div>
  </div>
  <div className="atlas-micro"><span className="atlas-red-dot"/> FRANKFURT AM MAIN <span className="atlas-micro-separator"/> 50°06&apos; N · 08°41&apos; E</div>
  <div className="atlas-category-tabs" role="group" aria-label={t.places}>
   {CATS.map(item=><button type="button" key={item.id} className={cat===item.id?'selected':''} onClick={()=>chooseCategory(item.id)} aria-pressed={cat===item.id}>{item.label}</button>)}
  </div>
  <div className="atlas-map-utilities">
   <button aria-label={t.zoomIn} title={t.zoomIn} onClick={()=>zoom(1)}><Plus size={20}/></button>
   <button aria-label={t.zoomOut} title={t.zoomOut} onClick={()=>zoom(-1)}><Minus size={20}/></button>
   <button aria-label={t.reset} title={t.reset} onClick={()=>goDistrict('city')}><LocateFixed size={20}/></button>
  </div>
  <div className="atlas-bottom">
   {selectedPlace?<div className="atlas-selection" role="region" aria-label={selectedPlace.name}>
     <button type="button" onClick={()=>setSelected(null)} className="atlas-selection-close" aria-label="Schließen"><X size={17}/></button>
     <div className="atlas-selection-text"><span>{selectedPlace.district||'Frankfurt'} · {selectedPlace.category}</span><strong>{selectedPlace.name}</strong><small>{selectedIsOSM?'Noch nicht geprüfter OSM-Eintrag · kein bestätigter Öffnungsstatus':(lang==='de'?selectedPlace.description_de||selectedPlace.address:selectedPlace.description_en||selectedPlace.address)}</small></div>
     <button type="button" onClick={()=>{if(selectedIsOSM){const p=selectedPlace.id.split('/');window.open('https://www.openstreetmap.org/'+p[0]+'/'+p[1],'_blank','noopener,noreferrer')}else onSelect?.(selectedPlace.id)}} className="atlas-selection-cta">{selectedIsOSM?'OSM-Quelle ansehen':t.select}<span className="atlas-selection-circle"><Plus size={18}/></span></button>
    </div>:<div className="atlas-explore-card">
     <div className="atlas-bottom-copy"><span>{lang==='de'?'DEIN NÄCHSTER STADT-MOMENT':'YOUR NEXT CITY MOMENT'}</span><strong>{DISTRICTS.find(d=>d.id===area)?.[lang]||'Frankfurt'}</strong><small>{ready?`${counts} ${lang==='de'?'Orte entdecken':'places to explore'}`:t.loading}</small></div>
     <button type="button" onClick={()=>setShowDistricts(x=>!x)} className="atlas-district-toggle" aria-expanded={showDistricts}><Layers3 size={18}/><span>{t.choose}</span><span className="atlas-mini-plus"><Plus size={15}/></span></button>
    </div>}
   {showDistricts&&<div className="atlas-district-picker" role="group" aria-label={t.district}>
    {DISTRICTS.map(d=><button type="button" key={d.id} onClick={()=>goDistrict(d.id)} className={area===d.id?'active':''}><span>{lang==='de'?d.de:d.en}</span>{area===d.id?<Check size={16}/>:<span className="atlas-district-dot"/>}</button>)}
   </div>}
  </div>
  <div className="atlas-credits"><span>{luftbild?'Luftbild: © Land Hessen · DOP20 · Datenlizenz Deutschland Zero 2.0':t.credit}</span><span>{luftbild?'Amtliches Luftbild, keine Fototexturen auf Gebäuden':t.tip}</span></div>
  {luftbildFehler&&<div className="atlas-luftbild-warning" role="status">Luftbild gerade nicht verfügbar. Stadtplan wird angezeigt.</div>}
  {!ready&&!error&&<div className="atlas-map-loading" role="status"><div className="atlas-loading-mark"><span/></div><strong>FFM ATLAS</strong><small>{t.loading}</small></div>}
  {error&&<div className="atlas-map-loading atlas-map-error" role="alert"><strong>{t.error}</strong><button onClick={()=>window.location.reload()}>{t.retry}</button></div>}
 </section>;
}
