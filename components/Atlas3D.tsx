'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Layers3,LocateFixed,Minus,Plus,Check,X,Sun,Sunset} from 'lucide-react';
import type {Map as LibreMap,GeoJSONSource} from 'maplibre-gl';
import {KATEGORIEN,passendeRubrik} from '@/lib/ortskategorien';
import {addRealLod2Layer} from '@/lib/real-lod2-layer';
import {addCitywideLod2Layer} from '@/lib/citywide-lod2-layer';
import {createMapLoadGuard} from '@/lib/map-load-guard';
import Atlas2DFallback from './Atlas2DFallback';
import '@/app/atlas-dom-fallback.css';

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
const CENTER:[number,number]=[8.6813,50.1114];
const INTRO_CENTER:[number,number]=[8.6666,50.1074];
const CITY_PITCH=37; // 3D remains default; street network and rivers stay legible
const NEAR_PITCH=41;
// At wider zoom levels the projected buildings shrink to a flat looking map.
// Bound the 3D camera to where height and streets remain perceptible; users can
// still select 2D explicitly for a whole-region overview.
const MIN_3D_ZOOM=13.15;
const MIN_2D_ZOOM=10.8;
const POI_SOURCE='ffm-curated-geo';
const DISTRICTS:Area[]=[
 {id:'city',de:'Frankfurt',en:'Frankfurt',center:CENTER,zoom:14.35,bearing:-14},
 {id:'altstadt',de:'Altstadt',en:'Old Town',center:[8.6832,50.1101],zoom:16.25,bearing:-28},
 {id:'sachsenhausen',de:'Sachsenhausen',en:'Sachsenhausen',center:[8.6859,50.1014],zoom:15.8,bearing:24},
 {id:'westend',de:'Westend',en:'Westend',center:[8.6620,50.1182],zoom:15.7,bearing:-13},
 {id:'nordend',de:'Nordend',en:'Nordend',center:[8.6994,50.1202],zoom:15.6,bearing:35},
 {id:'bornheim',de:'Bornheim',en:'Bornheim',center:[8.7118,50.1256],zoom:15.7,bearing:-26},
 {id:'ostend',de:'Ostend',en:'Ostend',center:[8.7095,50.1097],zoom:15.5,bearing:16},
 {id:'bockenheim',de:'Bockenheim',en:'Bockenheim',center:[8.6425,50.1200],zoom:15.3,bearing:14},
 {id:'roedelheim',de:'Rödelheim',en:'Rödelheim',center:[8.6096,50.1260],zoom:15.0,bearing:-15},
 {id:'hoechst',de:'Höchst',en:'Höchst',center:[8.5504,50.1008],zoom:15.3,bearing:-17},
 {id:'niederrad',de:'Niederrad',en:'Niederrad',center:[8.6490,50.0887],zoom:15.4,bearing:18},
 {id:'oberursel',de:'Bonames',en:'Bonames',center:[8.6605,50.185],zoom:15,bearing:-20},
 {id:'seckbach',de:'Seckbach',en:'Seckbach',center:[8.725,50.139],zoom:15.3,bearing:15},
 {id:'fechenheim',de:'Fechenheim',en:'Fechenheim',center:[8.763,50.123],zoom:15.2,bearing:-17},
 {id:'bergen',de:'Bergen Enkheim',en:'Bergen Enkheim',center:[8.776,50.154],zoom:15.1,bearing:12},
 {id:'kalbach',de:'Kalbach',en:'Kalbach',center:[8.636,50.181],zoom:15.2,bearing:22},
 {id:'gallus',de:'Gallus',en:'Gallus',center:[8.641,50.105],zoom:15.4,bearing:-25},
 {id:'griesheim',de:'Griesheim',en:'Griesheim',center:[8.611,50.095],zoom:15.2,bearing:21}
];
const CATS=KATEGORIEN;
const UI={
 de:{title:'Frankfurt entdecken.',subtitle:'Eine Stadt. Unzählige Perspektiven.',focus:'Deine Stadt in 3D',hint:'Ziehen, drehen und zoomen',map:'3D Stadtatlas',places:'Orte',district:'Viertel',select:'Ort ansehen',choose:'Stadtteil wählen',view:'Ansicht',day:'Tag',golden:'Abend',zoomIn:'Vergrößern',zoomOut:'Verkleinern',reset:'Frankfurt zentrieren',mode3d:'3D',mode2d:'2D',loading:'Die Stadt wird geladen …',error:'Die Karte konnte nicht geladen werden.',retry:'Neu laden',empty:'In dieser Auswahl gibt es noch keine veröffentlichten Orte.',tip:'3D Gebäude in ganz Frankfurt · genaue LoD2 Dächer werden bei Nähe geladen',credit:'© OpenStreetMap · OpenMapTiles · OpenFreeMap · HLBG · Powered by Lodapi',back:'Zurück zur Stadt'},
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
  map.setPaintProperty('ffm-architecture','fill-extrusion-opacity',dusk?0.91:0.90);
 }
 // Soft directional lighting reveals tower mass and silhouettes without textures.
 try{
  const lightMap=map as unknown as {setLight?:(light:{anchor:string,color:string,intensity:number,position:number[]})=>void};
  lightMap.setLight?.({anchor:'viewport',color:dusk?'#fff1d9':'#f4fbf8',intensity:dusk?0.66:0.52,position:[1.5,210,38]});
 }catch{}
}
function add3DBuildings(map:LibreMap){
 if(map.getLayer('ffm-architecture'))return;
 // Reuse the primary vector source. Adding a duplicate planet source can
 // fail independently and must not disable an already working 3D map.
 const mainVector=Object.entries(map.getStyle().sources||{})
  .find(([id,src])=>id!=='ffm-openmaptiles'&&src.type==='vector')?.[0];
 const buildingSource=mainVector||'ffm-openmaptiles';
 if(!map.getSource(buildingSource)){
  map.addSource(buildingSource,{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenStreetMap contributors'});
 }
 // Base footprints remain behind; 3D towers share the real map projection.
 const firstLabel=map.getStyle().layers?.find(l=>l.type==='symbol');
 map.addLayer({
  id:'ffm-architecture',type:'fill-extrusion',source:buildingSource,'source-layer':'building',minzoom:12.2,
  paint:{
   'fill-extrusion-color':'#c6beb5',
   'fill-extrusion-height':['interpolate',['linear'],['zoom'],12.2,['*',0.45,['coalesce',['get','render_height'],['get','height'],12]],14.4,['coalesce',['get','render_height'],['get','height'],12]],
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
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,10,17,17],
   'circle-color':'#72575d','circle-opacity':0.13,
   'circle-blur':0.25,'circle-pitch-alignment':'viewport'}});
 map.addLayer({id:'ffm-poi-dot',type:'circle',source:POI_SOURCE,
  paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,6,17,10],
   'circle-color':'#805965','circle-stroke-color':'#fff8ee',
   'circle-stroke-width':2.4,'circle-pitch-alignment':'viewport'}});
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
/** One easy-to-read point per screen region. The original OSM candidates
 * remain in memory for details; this only reduces map marker density.
 * Work in pixels, not lat/lng grid, because the map starts pitched in 3D. */
export function readableMapCandidates(places:AtlasPlace[],map:Pick<LibreMap,'project'|'getContainer'|'getZoom'>,selected:string|null){
 const w=map.getContainer().clientWidth||390,h=map.getContainer().clientHeight||700;
 const narrow=w<=640;
 const spacing=narrow?118:132;
 const max=narrow?9:15;
 const reservedTop=narrow?133:135,reservedBottom=narrow?90:75;
 const used=new Set<string>(),shown:AtlasPlace[]=[];
 const candidates=places.filter(validCoords);
 const indexed=candidates.map(p=>({p,pt:map.project([p.longitude as number,p.latitude as number])}));
 // Prefer a stable ordering that doesn't jump when records are returned in
 // a different order. A selected place is always drawn while on screen.
 indexed.sort((a,b)=>{
  if(a.p.id===selected)return -1;
  if(b.p.id===selected)return 1;
  return a.p.id.localeCompare(b.p.id);
 });
 for(const {p,pt} of indexed){
  if(pt.x<18||pt.x>w-18||pt.y<reservedTop||pt.y>h-reservedBottom)continue;
  const cell=Math.floor(pt.x/spacing)+':'+Math.floor((pt.y-reservedTop)/spacing);
  if(used.has(cell))continue;
  used.add(cell);shown.push(p);
  if(shown.length>=max)break;
 }
 return shown;
}
type MarkerIcon='coffee'|'food'|'bar'|'pharmacy'|'museum'|'pin';
function markerIcon(category:string):MarkerIcon{
 if(category==='Cafés'||category==='Brunch')return 'coffee';
 if(category==='Restaurants'||category==='Imbiss')return 'food';
 if(category==='Bars'||category==='Clubs'||category==='Shisha Bars')return 'bar';
 if(category==='Apotheken'||category==='Apotheken Notdienst')return 'pharmacy';
 if(category==='Museen')return 'museum';
 return 'pin';
}
/** Tiny vector drawings rendered to WebGL sprites. No misleading stock photography,
 * no glyph font/network dependency, and no cryptic C/E/M marker letters. */
function createMapIcon(icon:MarkerIcon):ImageData{
 const canvas=document.createElement('canvas');canvas.width=72;canvas.height=72;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw new Error('Marker canvas unavailable');
 const palette:Record<MarkerIcon,string>={
  coffee:'#8d644c',food:'#356e56',bar:'#685a80',pharmacy:'#35796e',museum:'#557789',pin:'#3b7055'
 };
 ctx.beginPath();ctx.arc(36,36,29,0,Math.PI*2);ctx.fillStyle=palette[icon];ctx.fill();
 ctx.strokeStyle='#fffef8';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
 const line=(...coords:number[])=>{ctx.beginPath();ctx.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)ctx.lineTo(coords[i],coords[i+1]);ctx.stroke()};
 switch(icon){
  case 'coffee':
   ctx.strokeRect(23,28,20,19);
   ctx.beginPath();ctx.arc(45,34,7,-Math.PI/2,Math.PI/2);ctx.stroke();
   line(21,51,48,51);break;
  case 'food':
   line(27,23,27,49);line(21,23,21,37,33,37,33,23);
   line(45,23,45,49);
   ctx.beginPath();ctx.arc(45,28,6,Math.PI,0);ctx.stroke();break;
  case 'bar':
   line(23,25,49,25,36,40,36,51);line(28,51,44,51);break;
  case 'pharmacy':
   ctx.fillStyle='#fffef8';ctx.fillRect(31,22,10,28);ctx.fillRect(22,31,28,10);break;
  case 'museum':
   line(21,29,36,21,51,29);line(23,32,49,32);
   for(const x of [27,36,45])line(x,35,x,47);
   line(21,50,51,50);break;
  default:
   ctx.beginPath();ctx.arc(36,34,9,Math.PI,3*Math.PI);ctx.stroke();
   line(27,34,36,51,45,34);break;
 }
 return ctx.getImageData(0,0,72,72);
}
function addMarkerSprites(map:LibreMap){
 for(const icon of ['coffee','food','bar','pharmacy','museum','pin'] as const){
  const id='ffm-marker-'+icon;
  if(!map.hasImage(id))map.addImage(id,createMapIcon(icon),{pixelRatio:2});
 }
}
function geoCandidateFeatures(places:AtlasPlace[]){
 return {type:'FeatureCollection' as const,features:places.filter(validCoords).map(p=>({
  type:'Feature' as const,properties:{id:p.id,name:p.name,category:p.category,
   address:p.address||'',verified:'false',icon:'ffm-marker-'+markerIcon(p.category)},
  geometry:{type:'Point' as const,coordinates:[p.longitude as number,p.latitude as number]}
 }))};
}
function addCandidatePins(map:LibreMap){
 if(map.getSource(OSM_SOURCE))return;
 addMarkerSprites(map);
 map.addSource(OSM_SOURCE,{type:'geojson',data:geoCandidateFeatures([])});
 map.addLayer({id:'ffm-osm-points',type:'symbol',source:OSM_SOURCE,
  layout:{'icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],12,.8,17,1.08],
   'icon-allow-overlap':true,'icon-ignore-placement':true,
   'icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport'}});
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
 const safeMapRef=useRef<()=>void>(()=>{});
 const latestCandidates=useRef<AtlasPlace[]>([]);
 const latestPlaces=useRef(places),activeSelect=useRef<(p:AtlasPlace)=>void>(()=>{});
 const selectionRef=useRef<string|null>(null);
 latestPlaces.current=places;
 const [rawCandidates,setRawCandidates]=useState<AtlasPlace[]>([]),[lod2Triangles,setLod2Triangles]=useState(0);
 
 const [luftbild,setLuftbild]=useState(false),[luftbildFehler,setLuftbildFehler]=useState(false);
 const [area,setArea]=useState('city'),[cat,setCat]=useState('Alle'),[mode,setMode]=useState<AtlasMode>('golden'),[is3D,set3D]=useState(true),[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[domFallback,setDomFallback]=useState(false),[error,setError]=useState(false),[selected,setSelected]=useState<string|null>(null),[showDistricts,setShowDistricts]=useState(false),[retryKey,setRetryKey]=useState(0);
 const state=useRef({mode:'golden' as AtlasMode,is3D:true});
 selectionRef.current=selected;
 const selectedPlace=[...places,...rawCandidates].find(p=>p.id===selected);
 const selectedIsOSM=Boolean(selectedPlace&&/^(node|way|relation)\//.test(selectedPlace.id));
 const filtered=useMemo(()=>places.filter(p=>validCoords(p)&&isSelectedCategory(p,cat)),[places,cat]);
 const moveTo=useCallback((place:AtlasPlace)=>{
  setSelected(place.id);
  if(validCoords(place)){mapRef.current?.flyTo({center:[place.longitude as number,place.latitude as number],zoom:Math.max(mapRef.current.getZoom(),15.25),pitch:state.current.is3D?NEAR_PITCH:0,bearing:state.current.is3D?-13:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1350,offset:[0,variant==='hero'?-48:-66]});}
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
    pitch:state.current.is3D?CITY_PITCH:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:1180
   });
  }
 },[]);
 const goDistrict=useCallback((id:string)=>{
  setArea(id);setShowDistricts(false);setSelected(null);
  const d=DISTRICTS.find(x=>x.id===id)||DISTRICTS[0];
  const prefersLess=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  mapRef.current?.flyTo({center:d.center,zoom:d.zoom,bearing:state.current.is3D?d.bearing:0,pitch:state.current.is3D?CITY_PITCH:0,duration:prefersLess?0:1700,essential:true});
 },[]);
 const receiveFallbackCandidates=useCallback((items:AtlasPlace[])=>{latestCandidates.current=items;setRawCandidates(items)},[]);
 const selectFallbackPlace=useCallback((p:AtlasPlace)=>{setSelected(p.id);if(!p.id.startsWith('osm:')&&places.some(x=>x.id===p.id))activeSelect.current(p)},[places]);
 const retry3D=useCallback(()=>{
  // Recovery is a new controlled MapLibre initialization. Do not force
  // users to refresh the whole app and lose their selected discovery state.
  setDomFallback(false);setFallback(false);setReady(false);setError(false);
  state.current={mode:state.current.mode,is3D:true};
  set3D(true);setLuftbild(false);setRetryKey(v=>v+1);
 },[]);
 const zoom=useCallback((delta:number)=>{
  const map=mapRef.current;if(!map)return;
  const min=state.current.is3D?MIN_3D_ZOOM:MIN_2D_ZOOM;
  map.zoomTo(Math.max(min,Math.min(19,map.getZoom()+delta)),{duration:350});
 },[]);
 useEffect(()=>{
  if(!mapDiv.current)return;
  let cancelled=false,hasStyle=false,triedRaster=false,revealed=false;
  let baseTileErrors=0,vectorTileSeen=false,rasterTileSeen=false;
  let baseVectorSource='openmaptiles',lastFeatureProbe=0;
  const showDOM=()=>{
   if(cancelled)return;
   cancelled=true;guard.dispose();
   mapRef.current?.remove();mapRef.current=null;
   setDomFallback(true);setReady(true);setError(false);
  };
  let recoverVector=showDOM;
  const guard=createMapLoadGuard({onVectorTimeout:()=>recoverVector(),onRasterTimeout:showDOM});
  import('maplibre-gl').then(({default:maplibre})=>{
   if(cancelled||!mapDiv.current)return;
   const canvas=document.createElement('canvas');
   let supported=false;try{
    const probe=canvas.getContext('webgl2')||canvas.getContext('webgl');
    supported=Boolean(probe);
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
   }catch{}
   if(!supported){showDOM();return;}
   const map=new maplibre.Map({
    container:mapDiv.current,style:VECTOR_STYLE,center:INTRO_CENTER,zoom:14.1,pitch:CITY_PITCH,bearing:-14,
    maxZoom:19,minZoom:MIN_3D_ZOOM,maxPitch:75,attributionControl:false,
    canvasContextAttributes:{antialias:true},fadeDuration:250
   });
   mapRef.current=map;
   const switchToSafeMap=()=>{
    if(cancelled||triedRaster)return;
    triedRaster=true;revealed=false;hasStyle=false;guard.useRaster();
    setFallback(true);set3D(false);setLuftbild(false);setReady(false);
    try{map.setStyle(fallbackRaster);}catch{showDOM();}
   };
   recoverVector=switchToSafeMap;safeMapRef.current=switchToSafeMap;
   map.on('webglcontextlost',showDOM);
   // Loading a style or an empty background is not proof of real tiles.
   map.on('sourcedata',event=>{
    if(cancelled)return;
    // MapLibre's successful source events are not guaranteed to include coord
    // (metadata/idle and source-complete events can omit it). Requiring coord
    // kept the full-screen loader above fully usable raster tiles and all pins.
    const e=event as unknown as {sourceId?:string;sourceDataType?:string;coord?:unknown;tile?:unknown;isSourceLoaded?:boolean};
    if(!['content','idle'].includes(e.sourceDataType||''))return;
    const finishedTile=Boolean(e.tile||e.coord||e.isSourceLoaded);
    if(!finishedTile)return;
    if(triedRaster&&e.sourceId==='osm'){rasterTileSeen=true;guard.ready();}
    if(!triedRaster&&e.sourceId===baseVectorSource)vectorTileSeen=true;
   });
   const revealScene=()=>{
    if(cancelled||revealed)return;
    if(triedRaster?!rasterTileSeen:!vectorTileSeen)return;
    revealed=true;
    guard.ready();
    setReady(true);
    if(!triedRaster&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
     // The first camera shot plays only once actual street and building tiles
     // have painted. No blank canvas or flying into unloaded skyscrapers.
     requestAnimationFrame(()=>{if(!cancelled)map.flyTo({
      center:CENTER,zoom:14.35,pitch:CITY_PITCH,bearing:-14,
      duration:2250,curve:1.3,essential:true
     });});
    }else map.jumpTo({center:CENTER,zoom:14.35,pitch:state.current.is3D?CITY_PITCH:0,bearing:-14});
   };
   const switchLoD2=()=>{if(map.getLayer('ffm-real-lod2'))map.setLayoutProperty('ffm-real-lod2','visibility',state.current.is3D&&map.getZoom()<16.15?'visible':'none')};
   map.on('zoomend',switchLoD2);
   const onStyle=()=>{
    if(cancelled)return;
    hasStyle=true;setError(false);
    baseVectorSource=Object.entries(map.getStyle().sources||{})
     .find(([id,src])=>id!=='ffm-openmaptiles'&&src.type==='vector')?.[0]||'openmaptiles';
    // One failing optional city model or imagery request must never prevent
    // place pins or the basic road map from loading.
    try{addGeoPins(map);}catch(e){console.warn('FFM place pin layer:',e);}
    try{addCandidatePins(map);}catch(e){console.warn('FFM discovery pin layer:',e);}
    if(!triedRaster){
     try{add3DBuildings(map);}catch(e){console.warn('FFM optional vector buildings:',e);}
     try{addLuftbild(map);}catch(e){console.warn('FFM optional aerial layer:',e);}
     try{setColorScheme(map,state.current.mode);}catch(e){console.warn('FFM optional colors:',e);}
     try{addRealLod2Layer(map,setLod2Triangles);}catch(e){console.warn('FFM optional nearby LoD2:',e);}
     try{addCitywideLod2Layer(map);}catch(e){console.warn('FFM optional citywide LoD2:',e);}
    }
    // A raster fallback is useful even if source-data event coordinates are
    // omitted by a provider. Never let an opaque full-screen loader hide pins.
    if(triedRaster){
      revealed=true;
      setReady(true);
      map.jumpTo({center:CENTER,zoom:14.35,pitch:0,bearing:0});
    }
    map.once('idle',revealScene);
   };
   map.on('style.load',onStyle);
   // Optional building requests can keep 'idle' from firing for a long time.
   // Once a real tile is received, the first rendered frame is enough.
   map.on('render',()=>{
    if(cancelled||revealed||triedRaster||!hasStyle)return;
    const now=performance.now();
    if(now-lastFeatureProbe<350)return;
    lastFeatureProbe=now;
    // Visible road/building geometry is proof of working primary vector tiles,
    // even when MapLibre sourcedata events omit coordinate metadata.
    try{if(map.queryRenderedFeatures().some(f=>f.source===baseVectorSource)){
      vectorTileSeen=true;revealScene();
    }}catch{}
   });
      map.on('click',e=>{
    if(map.getLayer('ffm-osm-points')){
      const point=map.queryRenderedFeatures(e.point,{layers:['ffm-osm-points']})[0];
      if(point){const id=String(point.properties?.id||'');const p=latestCandidates.current.find(v=>v.id===id);
       if(p){setSelected(p.id);map.flyTo({center:[p.longitude as number,p.latitude as number],zoom:Math.max(15.3,map.getZoom()),pitch:state.current.is3D?NEAR_PITCH:0,duration:650})}return;}
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
     (map.queryRenderedFeatures(e.point,{layers:['ffm-poi-dot']}).length||(map.getLayer('ffm-osm-points')&&map.queryRenderedFeatures(e.point,{layers:['ffm-osm-points']}).length))?'pointer':'';
   });
   // E2E-only inspection, never activated on ordinary visitor pages.
   if(new URLSearchParams(window.location.search).has('atlasQA')){
    (window as unknown as {__ffmAtlasQA?:LibreMap}).__ffmAtlasQA=map;
   }
   map.on('error',e=>{
    if(cancelled)return;
    if(String(e.error?.message||'').includes('gds-srv.hessen.de')){setLuftbildFehler(true);setLuftbild(false);return;}
    const message=String(e.error?.message||'');
    const sourceId=String((e as unknown as {sourceId?:string}).sourceId||'');
    // Optional LoD2, aerial and secondary tile sources may fail while
    // primary vector streets remain perfectly functional.
    const baseFailure=!hasStyle||(!triedRaster&&sourceId===baseVectorSource);
    const rasterFailure=triedRaster&&sourceId==='osm';
    if(!baseFailure&&!rasterFailure)return;
    if(++baseTileErrors<3)return;
    console.warn('FFM Atlas primary map source:',e.error);
    if(baseFailure&&!triedRaster&&!vectorTileSeen)switchToSafeMap();
    else if(rasterFailure&&!rasterTileSeen)showDOM();
   });
   map.addControl(new maplibre.AttributionControl({compact:true}),'bottom-right');
  }).catch(showDOM);
  return()=>{cancelled=true;guard.dispose();safeMapRef.current=()=>{};mapRef.current?.remove();mapRef.current=null;};
 },[retryKey]);
 useEffect(()=>{
  const map=mapRef.current;if(!ready||!map)return;
  state.current={mode,is3D};
  // MapLibre setMinZoom applies to pinch, wheel and zoom controls alike.
  // Do not leave 3D selected while allowing a virtually flat far-out view.
  map.setMinZoom(is3D&&!luftbild?MIN_3D_ZOOM:MIN_2D_ZOOM);
  if(!fallback)setColorScheme(map,mode);
  map.easeTo({pitch:is3D?CITY_PITCH:0,bearing:is3D?(DISTRICTS.find(x=>x.id===area)?.bearing??-23):0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:850});
  if(!fallback&&map.getLayer('ffm-architecture'))map.setLayoutProperty('ffm-architecture','visibility',is3D&&!luftbild?'visible':'none');
  if(map.getLayer('ffm-luftbild'))map.setLayoutProperty('ffm-luftbild','visibility',luftbild?'visible':'none');
  if(map.getLayer('ffm-real-lod2'))map.setLayoutProperty('ffm-real-lod2','visibility',is3D&&!luftbild&&map.getZoom()<16.15?'visible':'none');
  if(map.getLayer('ffm-citywide-lod2'))map.setLayoutProperty('ffm-citywide-lod2','visibility',is3D&&!luftbild?'visible':'none');
 },[mode,is3D,area,ready,fallback,luftbild]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!ready||!map)return;
  const reconcileSelection=()=>{
   const id=selectionRef.current;if(!id)return;
   const place=[...latestPlaces.current,...latestCandidates.current].find(p=>p.id===id);
   if(!place||!validCoords(place)){setSelected(null);return;}
   const pt=map.project([place.longitude as number,place.latitude as number]);
   const box=map.getContainer();
   const {clientWidth:w,clientHeight:h}=box;
   const outside=!Number.isFinite(pt.x)||!Number.isFinite(pt.y)
     ||pt.x<12||pt.x>w-12||pt.y<113||pt.y>h-132;
   // At city-scale, an old place card becomes misleading even if its
   // coordinate is still somewhere on the screen.
   if(map.getZoom()<14.05||outside)setSelected(null);
  };
  map.on('moveend',reconcileSelection);
  return()=>{map.off('moveend',reconcileSelection);};
 },[ready]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!ready||!map||!map.getSource(OSM_SOURCE))return;
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
      const visible=readableMapCandidates(items,map,selected);
      (map.getSource(OSM_SOURCE) as GeoJSONSource).setData(geoCandidateFeatures(visible));
    }).catch(()=>{});
  };
  const moved=()=>{
   const items=readableMapCandidates(latestCandidates.current,map,selected);
   (map.getSource(OSM_SOURCE) as GeoJSONSource).setData(geoCandidateFeatures(items));
   if(timer!==undefined)window.clearTimeout(timer);
   timer=window.setTimeout(load,280);
  };
  map.on('moveend',moved);load();
  return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer);active?.abort();map.off('moveend',moved)};
 },[ready,fallback,cat,selected]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!ready||!map||!map.getSource(POI_SOURCE))return;
  (map.getSource(POI_SOURCE) as GeoJSONSource).setData(geoFeatures(filtered));
 },[ready,filtered]);
 useEffect(()=>{
  const map=mapRef.current;
  if(ready&&map)updateSelectedPin(map,selected);
 },[ready,selected,fallback]);
 return <section className={'atlas-root atlas-'+variant+' atlas-tone-'+mode} aria-label={t.map}>
  <div className="atlas-map-host" ref={mapDiv} aria-label={t.map} role="application"/>
  {domFallback&&<Atlas2DFallback
    places={filtered} category={cat} lang={lang} selectedId={selected}
    center={(DISTRICTS.find(d=>d.id===area)||DISTRICTS[0]).center}
    initialZoom={(DISTRICTS.find(d=>d.id===area)||DISTRICTS[0]).zoom}
    onPick={selectFallbackPlace} onCandidates={receiveFallbackCandidates}/>}

  <div className="atlas-veil" aria-hidden="true"/>
  <div className="atlas-topbar">
   <div className="atlas-brand"><span className="atlas-brand-id">ffm<span>.</span></span><div><small>FRANKFURT AM MAIN</small><strong>{lang==='de'?'3D Stadtkarte':'3D city map'}</strong></div></div>
   <div className="atlas-tools">
    <button type="button" className="atlas-dim-button" aria-pressed={fallback||domFallback?false:is3D}
      onClick={()=>{if(domFallback||fallback){retry3D();return}if(luftbild){setLuftbild(false);set3D(true)}else set3D(x=>!x)}}
      title={domFallback||fallback?(lang==='de'?'3D erneut versuchen':'Retry 3D'):t.view}
      aria-label={domFallback||fallback?'3D erneut versuchen':'2D oder 3D wechseln'}>{domFallback||fallback?'3D neu':is3D?'3D':'2D'}</button>
    <details className="atlas-map-more-views"><summary>Ansicht <Plus size={14}/></summary><div>
      <button type="button" className={'atlas-tone-button'+(mode==='golden'?' active':'')} onClick={()=>setMode(x=>x==='day'?'golden':'day')} title={mode==='day'?t.golden:t.day} aria-label={mode==='day'?t.golden:t.day}>{mode==='day'?<Sunset size={17}/>:<Sun size={17}/>}<span>{mode==='day'?t.golden:t.day}</span></button>
      <button type="button" className={'atlas-air-button'+(luftbild?' active':'')} aria-pressed={luftbild} onClick={()=>{setLuftbildFehler(false);if(!luftbild)set3D(false);else set3D(true);setLuftbild(v=>!v)}} title="Amtliche Luftbilder statt Kartenzeichnung">{luftbild?'Stadtplan':'Luftbild'}</button>
      <button type="button" disabled={fallback} onClick={()=>safeMapRef.current()} title="Bei grauer oder leerer Karte auf OSM wechseln">{fallback?'OSM aktiv':'Einfache Karte laden'}</button>
    </div></details>
   </div>
  </div>
 
  <div className="atlas-category-tabs" role="group" aria-label={t.places}>
   {CATS.filter(item=>['Alle','Cafés','Restaurants','Bars'].includes(item.id)).map(item=><button type="button" key={item.id} className={cat===item.id?'selected':''} onClick={()=>chooseCategory(item.id)} aria-pressed={cat===item.id}>{item.label}</button>)}
   <details className="atlas-map-more-cats"><summary>{!['Alle','Cafés','Restaurants','Bars'].includes(cat)?CATS.find(v=>v.id===cat)?.label||'Mehr':'Mehr'} <Plus size={14}/></summary>
     <div className="atlas-map-more-cats-list">{CATS.filter(item=>!['Alle','Cafés','Restaurants','Bars'].includes(item.id)).map(item=><button type="button" key={item.id} className={cat===item.id?'selected':''} onClick={()=>chooseCategory(item.id)} aria-pressed={cat===item.id}>{item.label}</button>)}</div>
   </details>
  </div>
  <div className="atlas-map-utilities">
   <button aria-label={t.zoomIn} title={t.zoomIn} onClick={()=>zoom(1)}><Plus size={20}/></button>
   <button aria-label={t.zoomOut} title={t.zoomOut} onClick={()=>zoom(-1)}><Minus size={20}/></button>
   <button aria-label={t.reset} title={t.reset} onClick={()=>goDistrict('city')}><LocateFixed size={20}/></button>
  </div>
  <div className={'atlas-bottom'+(selectedPlace?' atlas-bottom-selected':'')}>
   {selectedPlace?<div className="atlas-selection" role="region" aria-label={selectedPlace.name}>
     <button type="button" onClick={()=>setSelected(null)} className="atlas-selection-close" aria-label="Schließen"><X size={17}/></button>
     <div className="atlas-selection-text">
      <span>{selectedPlace.category} · {selectedIsOSM?'Ungeprüft':selectedPlace.district||'Frankfurt'}</span>
      <strong>{selectedPlace.name}</strong>
      {selectedPlace.address&&<small title={selectedPlace.address}>{selectedPlace.address}</small>}
     </div>
     <button type="button" onClick={()=>onSelect?.(selectedPlace.id)} className="atlas-selection-cta">{'Details'}<Plus size={16}/></button>
    </div>:<div className="atlas-explore-card">
     <div className="atlas-bottom-copy"><strong>{DISTRICTS.find(d=>d.id===area)?.[lang]||'Frankfurt'}</strong></div>
     <button type="button" onClick={()=>setShowDistricts(x=>!x)} className="atlas-district-toggle" aria-label="Stadtteil wählen" aria-expanded={showDistricts}><Layers3 size={17}/><span>Viertel</span><Plus size={15}/></button>
    </div>}
   {showDistricts&&<div className="atlas-district-picker" role="group" aria-label={t.district}>
    {DISTRICTS.map(d=><button type="button" key={d.id} onClick={()=>goDistrict(d.id)} className={area===d.id?'active':''}><span>{lang==='de'?d.de:d.en}</span>{area===d.id?<Check size={16}/>:<span className="atlas-district-dot"/>}</button>)}
   </div>}
  </div>
  <div className="atlas-credits"><span>{luftbild?'Luftbild: © Land Hessen · DOP20 · Datenlizenz Deutschland Zero 2.0':t.credit}</span><span>{luftbild?'Amtliches Luftbild, keine Fototexturen auf Gebäuden':lod2Triangles>0?'Echte LoD2 Dach- und Wandflächen · Innenstadt-Ausschnitt · Powered by Lodapi':t.tip}</span></div>
  {fallback&&!domFallback&&<div className="atlas-luftbild-warning" role="status">3D Kartendienst momentan nicht erreichbar. Über „3D neu“ erneut versuchen.</div>}
  {luftbildFehler&&<div className="atlas-luftbild-warning" role="status">Luftbild gerade nicht verfügbar. Stadtplan wird angezeigt.</div>}
  {!domFallback&&!ready&&!error&&<div className="atlas-map-loading" role="status"><div className="atlas-loading-mark"><span/></div><strong>FFM ATLAS</strong><small>{t.loading}</small></div>}
  {error&&!domFallback&&<div className="atlas-map-loading atlas-map-error" role="alert"><strong>{t.error}</strong><small>{lang==='de'?'Kartendaten konnten nicht geladen werden.':'Map tiles are unavailable.'}</small><button onClick={retry3D}>{t.retry}</button><a href="https://www.openstreetmap.org/#map=14/50.1114/8.6813" target="_blank" rel="noopener noreferrer">{lang==='de'?'Karte bei OpenStreetMap öffnen':'Open map on OpenStreetMap'}</a></div>}
 </section>;
}

