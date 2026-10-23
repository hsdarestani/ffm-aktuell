'use client';
import {useEffect,useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import {CalendarDays,ChevronDown,ChevronUp,MapPin,Search} from 'lucide-react';
import type {AtlasPlace} from './Atlas3D';
const Atlas3D=dynamic(()=>import('./Atlas3D'),{ssr:false});
type EventPin={id:string;title:string;venue:string;category:string;starts_at:string;latitude:number|null;longitude:number|null;place_id:string|null};
const date=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export default function MapDiscovery({lang,places,onPlace,onEvents}:{lang:'de'|'en';places:AtlasPlace[];onPlace:(id:string)=>void;onEvents:()=>void}){
 const [mode,setMode]=useState<'places'|'events'>('places'),[events,setEvents]=useState<EventPin[]>([]),[search,setSearch]=useState(''),[open,setOpen]=useState(true),
 [selectedEvent,setSelectedEvent]=useState<EventPin|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const c=new AbortController(),now=new Date(),end=new Date(Date.now()+14*86400000);
 fetch('/api/event-explorer?'+new URLSearchParams({from:date(now),to:date(end)}),{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject())
  .then(d=>{if(!c.signal.aborted)setEvents((d.items||[]).filter((e:EventPin)=>new Date(e.starts_at).getTime()>=Date.now()-5*3600000))})
  .catch(()=>{if(!c.signal.aborted)setError(true)});return()=>c.abort()},[]);
 const visible=useMemo(()=>mode==='places'?places.filter(p=>p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())):
 events.filter(e=>(e.title+' '+e.venue).toLocaleLowerCase().includes(search.toLocaleLowerCase())),[mode,places,events,search]);
 const pins=useMemo<AtlasPlace[]>(()=>mode==='places'?visible as AtlasPlace[]:(visible as EventPin[]).filter(e=>e.latitude!=null&&e.longitude!=null)
  .map(e=>({id:'event:'+e.id,name:e.title,category:'Freizeit',latitude:e.latitude,longitude:e.longitude,
   district:e.venue,description_de:e.venue})),[mode,visible]);
 function choose(id:string){if(id.startsWith('event:')){const ev=events.find(e=>e.id===id.slice(6));if(ev){setSelectedEvent(ev);setOpen(true)}}else onPlace(id)}
 return <main className="ffm-map-explorer">
  <Atlas3D key={mode} variant="full" places={pins} lang={lang} onSelect={choose}/>
  <div className="ffm-map-top" role="group" aria-label="Auf Karte anzeigen">
   <button className={mode==='places'?'active':''} aria-pressed={mode==='places'} onClick={()=>{setMode('places');setSelectedEvent(null);setSearch('')}}><MapPin size={17}/>{lang==='de'?'Orte':'Places'}</button>
   <button className={mode==='events'?'active':''} aria-pressed={mode==='events'} onClick={()=>{setMode('events');setSelectedEvent(null);setSearch('')}}><CalendarDays size={17}/>Events</button>
  </div>
  <section className={'ffm-map-sheet '+(open?'expanded':'collapsed')} aria-label={mode==='places'?'Orte auf Karte':'Events auf Karte'}>
   <button className="ffm-map-handle" onClick={()=>setOpen(!open)} aria-label={open?'Liste einklappen':'Liste öffnen'}>{open?<ChevronDown size={19}/>:<ChevronUp size={19}/>}</button>
   <div className="ffm-map-sheet-head"><strong>{visible.length} {mode==='places'?(lang==='de'?'Orte':'places'):'Events'}</strong>
    <label><Search size={17}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={lang==='de'?'Suchen …':'Search …'}/></label></div>
   {open&&<div className="ffm-map-sheet-list">
    {error&&mode==='events'&&<p role="alert">Veranstaltungen momentan nicht erreichbar.</p>}
    {selectedEvent&&mode==='events'&&<div className="ffm-map-selected"><strong>{selectedEvent.title}</strong><p>{selectedEvent.venue}</p>
     <button onClick={onEvents}>Im Eventkalender ansehen</button></div>}
    {mode==='events'&&<p className="ffm-city-disclaimer">{lang==='de'?'Nächste 14 Tage. Nur eindeutig mit einem aktuell verifizierten Ort verknüpfte Events erscheinen als Kartenpin.':'Next 14 days. Only events linked to a currently verified venue appear as map pins.'}</p>}
    {visible.slice(0,35).map(p=>mode==='places'?
     <button className="ffm-map-result" key={p.id} onClick={()=>onPlace(p.id)}><MapPin size={18}/><span><strong>{(p as AtlasPlace).name}</strong><small>{(p as AtlasPlace).district||(p as AtlasPlace).category}</small></span></button>:
     <button className="ffm-map-result" key={p.id} onClick={()=>{setSelectedEvent(p as EventPin);if((p as EventPin).place_id)onPlace((p as EventPin).place_id!)}}>
      <CalendarDays size={18}/><span><strong>{(p as EventPin).title}</strong><small>{(p as EventPin).venue} · {new Date((p as EventPin).starts_at).toLocaleString(lang==='de'?'de-DE':'en-GB',{timeZone:'Europe/Berlin',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>
      {(p as EventPin).latitude==null&&<small>Ohne Pin</small>}
     </button>)}
    {visible.length>35&&<small>{lang==='de'?'Weitere Treffer über die Suche eingrenzen.':'Narrow more results with search.'}</small>}
    {!visible.length&&<p>{lang==='de'?'Keine passenden Einträge.':'No matching entries.'}</p>}
   </div>}
  </section>
 </main>;
}
