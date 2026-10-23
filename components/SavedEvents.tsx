'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
import EventActions from '@/components/EventActions';

type Event={id:string;title:string;venue:string;description_de:string;starts_at:string;ends_at?:string|null;ticket_url:string|null};
export default function SavedEvents({userId,onNotice}:{userId:string;onNotice:(message:string)=>void}){
 const ui=useUiText();
 const [events,setEvents]=useState<Event[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  setEvents([]);setLoading(true);setFailed(false);
  fetch('/api/event-favorites',{cache:'no-store',signal:controller.signal})
   .then(async r=>{if(!r.ok)throw Error(ui("Nicht erreichbar"));return r.json()})
   .then(data=>{if(active)setEvents(Array.isArray(data.items)?data.items:[])})
   .catch(()=>{if(active)setFailed(true)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;controller.abort()};
 },[userId,retry]);
 const remove=async(id:string,active:boolean)=>{
  try{
   const response=await fetch('/api/event-favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_id:id,active})});
   if(!response.ok)throw Error(ui("Nicht gespeichert"));
   if(!active)setEvents(current=>current.filter(event=>event.id!==id));
  }catch{onNotice(ui("Die Veranstaltung konnte nicht entfernt werden. Bitte erneut versuchen."))}
 };
 return <section className="ffm-profile-panel ffm-saved-events" aria-labelledby="ffm-saved-events-title">
  <h2 id="ffm-saved-events-title">{ui("Meine Veranstaltungen")}</h2>
  {loading?<p role="status">{ui("Veranstaltungen werden geladen …")}</p>:
   failed?<div role="alert"><p>{ui("Deine Veranstaltungen sind gerade nicht erreichbar.")}</p><button type="button" className="ffm-profile-outline" onClick={()=>setRetry(n=>n+1)}>{ui("Erneut versuchen")}</button></div>:
   events.length===0?<p>{ui("Noch keine anstehenden Veranstaltungen gemerkt.")}</p>:
   <ul>{events.map(event=><li key={event.id}>
    <h3>{event.title}</h3>
    <p><time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString((ui.locale==='de'?'de-DE':'en-GB'),{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} {ui(" Uhr")}</time> · {event.venue}</p>
    <EventActions event={event} saved loggedIn onLogin={()=>{}} onSaved={remove} onNotice={onNotice}/>
   </li>)}</ul>}
 </section>;
}
