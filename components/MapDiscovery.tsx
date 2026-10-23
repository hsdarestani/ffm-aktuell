'use client';
import {useEffect,useMemo,useState,useRef} from 'react';
import dynamic from 'next/dynamic';
import {CalendarDays,ChevronDown,ChevronUp,MapPin,Search} from 'lucide-react';
import type {AtlasPlace} from './Atlas3D';
const Atlas3D=dynamic(()=>import('./Atlas3D'),{ssr:false});
type EventPin={id:string;title:string;venue:string;category:string;starts_at:string;latitude:number|null;longitude:number|null;place_id:string|null};
const date=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export default function MapDiscovery({lang,places,onPlace,onEvents,initialMode='places'}:{lang:'de'|'en';places:AtlasPlace[];onPlace:(id:string)=>void;onEvents:()=>void;initialMode?:'places'|'events'}){
 const [mode,setMode]=useState<'places'|'events'>(initialMode),[events,setEvents]=useState<EventPin[]>([]),[search,setSearch]=useState(''),[open,setOpen]=useState(true),
 [selectedEvent,setSelectedEvent]=useState<EventPin|null>(null),[error,setError]=useState(false);
 useEffect(()=>{setMode(initialMode);setSelectedEvent(null)},[initialMode]);
 const [raw,setRaw]=useState<AtlasPlace[]>([]),[rawTotal,setRawTotal]=useState(0),[rawLoading,setRawLoading]=useState(false);
 const [rawError,setRawError]=useState(false),[moreLoading,setMoreLoading]=useState(false),[listLimit,setListLimit]=useState(35);
 useEffect(()=>{if(mode!=='places')return;
  const ctl=new AbortController();setRawLoading(true);setRawError(false);setRaw([]);setRawTotal(0);setListLimit(35);
  const timer=window.setTimeout(()=>{
   fetch('/api/discovery?'+new URLSearchParams({q:search.slice(0,90),limit:'48',offset:'0'}),{signal:ctl.signal,cache:'no-store'})
    .then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(!ctl.signal.aborted){setRaw(d.items||[]);setRawTotal(d.total||0)}})
    .catch(()=>{if(!ctl.signal.aborted)setRawError(true)}).finally(()=>{if(!ctl.signal.aborted)setRawLoading(false)});
  },220);
  return()=>{ctl.abort();window.clearTimeout(timer)}
 },[mode,search]);
 const searchVersion=useRef(0);
 useEffect(()=>{searchVersion.current++;setMoreLoading(false)},[search,mode]);
 async function loadMore(){
  const version=searchVersion.current;
  if(moreLoading||raw.length>=rawTotal)return;
  setMoreLoading(true);
  try{const r=await fetch('/api/discovery?'+new URLSearchParams({q:search.slice(0,90),limit:'48',offset:String(raw.length)}),{cache:'no-store'});
   if(!r.ok)throw Error('Lookup unavailable');
   const d=await r.json();if(version!==searchVersion.current)return;setRaw(current=>[...current,...((d.items||[]) as AtlasPlace[]).filter(p=>!current.some(x=>x.id===p.id))]);setRawTotal(d.total||0);setListLimit(n=>n+48);
  }catch{if(version===searchVersion.current)setRawError(true)}finally{if(version===searchVersion.current)setMoreLoading(false)}
 }
 useEffect(()=>{const c=new AbortController(),now=new Date(),end=new Date(Date.now()+14*86400000);
 fetch('/api/event-explorer?'+new URLSearchParams({from:date(now),to:date(end)}),{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject())
  .then(d=>{if(!c.signal.aborted)setEvents((d.items||[]).filter((e:EventPin)=>new Date(e.starts_at).getTime()>=Date.now()-5*3600000))})
  .catch(()=>{if(!c.signal.aborted)setError(true)});return()=>c.abort()},[]);
 const publishedPlaces=useMemo(()=>places.filter(p=>p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),[places,search]);
 const visible=useMemo(()=>(mode==='places'?[...publishedPlaces,...raw.filter(p=>!publishedPlaces.some(q=>q.id===p.id))]:
 events.filter(e=>(e.title+' '+e.venue).toLocaleLowerCase().includes(search.toLocaleLowerCase()))),[mode,publishedPlaces,raw,events,search]);
 const pins=useMemo<AtlasPlace[]>(()=>mode==='places'?publishedPlaces:(visible as EventPin[]).filter(e=>e.latitude!=null&&e.longitude!=null)
  .map(e=>({id:'event:'+e.id,name:e.title,category:'Freizeit',latitude:e.latitude,longitude:e.longitude,
   district:e.venue,description_de:e.venue})),[mode,publishedPlaces,visible]);
 function choose(id:string){if(id.startsWith('event:')){const ev=events.find(e=>e.id===id.slice(6));if(ev){setSelectedEvent(ev);setOpen(true)}}else onPlace(id)}
 return <main className="ffm-map-explorer">
  <Atlas3D key={mode} variant="full" places={pins} lang={lang} onSelect={choose} showRawCandidates={mode==='places'}/>
  <div className="ffm-map-top" role="group" aria-label="Auf Karte anzeigen">
   <button className={mode==='places'?'active':''} aria-pressed={mode==='places'} onClick={()=>{setMode('places');setSelectedEvent(null);setSearch('')}}><MapPin size={17}/>{lang==='de'?'Orte':'Places'}</button>
   <button className={mode==='events'?'active':''} aria-pressed={mode==='events'} onClick={()=>{setMode('events');setSelectedEvent(null);setSearch('')}}><CalendarDays size={17}/>Events</button>
  </div>
  <section className={'ffm-map-sheet '+(open?'expanded':'collapsed')} aria-label={mode==='places'?'Orte auf Karte':'Events auf Karte'}>
   <button className="ffm-map-handle" onClick={()=>setOpen(!open)} aria-label={open?'Liste einklappen':'Liste öffnen'}>{open?<ChevronDown size={19}/>:<ChevronUp size={19}/>}</button>
   <div className="ffm-map-sheet-head"><strong>{mode==='places'?(publishedPlaces.length+rawTotal):visible.length} {mode==='places'?(lang==='de'?'Orte':'places'):'Events'}</strong>
    <label><Search size={17}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={lang==='de'?'Suchen …':'Search …'}/></label></div>
   {open&&<div className="ffm-map-sheet-list">
    {error&&mode==='events'&&<p role="alert">Veranstaltungen momentan nicht erreichbar.</p>}
    {rawError&&mode==='places'&&<p role="alert">Weitere OpenStreetMap-Orte sind momentan nicht erreichbar.</p>}
    {selectedEvent&&mode==='events'&&<div className="ffm-map-selected"><strong>{selectedEvent.title}</strong><p>{selectedEvent.venue}</p>
     <button onClick={onEvents}>Im Eventkalender ansehen</button></div>}
    {mode==='events'&&<p className="ffm-city-disclaimer">{lang==='de'?'Nächste 14 Tage. Nur eindeutig mit einem aktuell verifizierten Ort verknüpfte Events erscheinen als Kartenpin.':'Next 14 days. Only events linked to a currently verified venue appear as map pins.'}</p>}
    {visible.slice(0,listLimit).map(p=>mode==='places'?
     <button className="ffm-map-result" key={p.id} onClick={()=>onPlace(p.id)}><MapPin size={18}/><span><strong>{(p as AtlasPlace).name}</strong><small>{(p as AtlasPlace).district||(p as AtlasPlace).category}{raw.some(c=>c.id===p.id)?' · OSM · ungeprüft':''}</small></span></button>:
     <button className="ffm-map-result" key={p.id} onClick={()=>{setSelectedEvent(p as EventPin);if((p as EventPin).place_id)onPlace((p as EventPin).place_id!)}}>
      <CalendarDays size={18}/><span><strong>{(p as EventPin).title}</strong><small>{(p as EventPin).venue} · {new Date((p as EventPin).starts_at).toLocaleString(lang==='de'?'de-DE':'en-GB',{timeZone:'Europe/Berlin',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>
      {(p as EventPin).latitude==null&&<small>Ohne Pin</small>}
     </button>)}
    {mode==='places'&&rawLoading&&<small role="status">OpenStreetMap-Orte laden …</small>}
    {visible.length>listLimit&&<button className="ffm-map-more" onClick={()=>setListLimit(n=>n+35)}>{lang==='de'?'Mehr anzeigen':'Show more'}</button>}
    {mode==='places'&&raw.length<rawTotal&&visible.length<=listLimit&&<button className="ffm-map-more" disabled={moreLoading} onClick={()=>void loadMore()}>{moreLoading?'Lädt …':lang==='de'?'Weitere Orte laden':'Load more places'}</button>}
    {!visible.length&&!rawLoading&&<p>{lang==='de'?'Keine passenden Einträge.':'No matching entries.'}</p>}
   </div>}
  </section>
 </main>;
}
