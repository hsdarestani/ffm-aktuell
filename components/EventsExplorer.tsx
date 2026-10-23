'use client';
import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,ChevronLeft,ChevronRight,Clock3,MapPin,Tag} from 'lucide-react';
import EventActions from './EventActions';
type CityEvent={id:string;title:string;description_de:string;description_en:string;venue:string;starts_at:string;ends_at:string|null;
 category:string;organizer:string;price_cents:number|null;price_source_url:string|null;source_url:string|null;ticket_url:string|null;place_id:string|null;
 latitude:number|null;longitude:number|null};
const formatDay=(d:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const addDays=(day:string,n:number)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const monthStart=(day:string)=>day.slice(0,7)+'-01';
const monthEnd=(day:string)=>addDays(new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0)).toISOString().slice(0,10),0);
const moveMonth=(month:string,by:number)=>{const d=new Date(month+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+by);return monthStart(d.toISOString().slice(0,10))};
const isNightlife=(e:CityEvent)=>/club|bar|party|dj|nacht|rave|disco/i.test(e.category+' '+e.title);
/** An early-morning club event belongs to the preceding nightlife date (through 05:00). */
function bucket(e:CityEvent){
 const d=new Date(e.starts_at);
 const day=formatDay(d);
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(d));
 return isNightlife(e)&&hour<5?addDays(day,-1):day;
}
const canonicalCategory=(e:CityEvent)=>/club/i.test(e.category)?'Club':/bar/i.test(e.category)?'Bar':/open.?air/i.test(e.category)?'Open Air':e.category||'Weitere';
const allCategories=['Alle','Bar','Club','Open Air','Kultur','Musik','Sport','Familie','Weitere'];
const dateLabel=(day:string,lang:'de'|'en',opts:Intl.DateTimeFormatOptions)=>new Date(day+'T12:00:00Z').toLocaleDateString(lang==='de'?'de-DE':'en-GB',{...opts,timeZone:'UTC'});
export default function EventsExplorer({lang,loggedIn,onLogin,onSaved,onNotice,saved,onPlace,onMap}:{
 lang:'de'|'en';loggedIn:boolean;onLogin:()=>void;onSaved:(id:string,active:boolean)=>Promise<void>;onNotice:(s:string)=>void;saved:string[];
 onPlace:(id:string)=>void;onMap:()=>void;
}){
 const today=formatDay(new Date());
 const [selected,setSelected]=useState(today),[month,setMonth]=useState(monthStart(today)),[view,setView]=useState<'day'|'month'>('day');
 const [category,setCategory]=useState('Alle'),[items,setItems]=useState<CityEvent[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{const ac=new AbortController();setBusy(true);setError(false);
  const from=monthStart(month),to=monthEnd(month);
  fetch('/api/event-explorer?'+new URLSearchParams({from,to}),{signal:ac.signal,cache:'no-store'})
   .then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(!ac.signal.aborted)setItems(d.items||[])})
   .catch(()=>{if(!ac.signal.aborted)setError(true)}).finally(()=>{if(!ac.signal.aborted)setBusy(false)});
  return()=>ac.abort();
 },[month]);
 const inMonth=useMemo(()=>items.filter(e=>bucket(e).startsWith(month.slice(0,7))&&(new Date(e.ends_at||e.starts_at).getTime()>=Date.now()||bucket(e)>=today)),[items,month,today]);
 const matches=(e:CityEvent)=>category==='Alle'||canonicalCategory(e)===category||category==='Kostenlos'&&e.price_cents===0;
 const filtered=inMonth.filter(matches);
 const selectedEvents=filtered.filter(e=>bucket(e)===selected).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const count=(c:string)=>inMonth.filter(e=>c==='Alle'||canonicalCategory(e)===c||c==='Kostenlos'&&e.price_cents===0).length;
 const monthDays=Number(monthEnd(month).slice(-2)),monthWeekday=(new Date(month+'T12:00:00Z').getUTCDay()+6)%7;
 const calendarDays=Array.from({length:monthWeekday+monthDays},(_,i)=>i<monthWeekday?null:addDays(month,i-monthWeekday));
 const week=Array.from({length:7},(_,i)=>addDays(selected,i-new Date(selected+'T12:00:00Z').getUTCDay()+0)).map((x,i)=>addDays(x,i===0?0:0)); // recomputed below for ISO Monday
 const weekday=(new Date(selected+'T12:00:00Z').getUTCDay()+6)%7;
 const weekDates=Array.from({length:7},(_,i)=>addDays(selected,i-weekday));
 const categories=[...allCategories,'Kostenlos'].filter(c=>c==='Alle'||count(c)>0);
 function chooseDay(day:string){setSelected(day);if(monthStart(day)!==month)setMonth(monthStart(day))}
 function stepMonth(n:number){const next=moveMonth(month,n);setMonth(next);setSelected(next<today?today:next)}
 return <section className="ffm-event-explorer" aria-label={lang==='de'?'Frankfurter Veranstaltungskalender':'Frankfurt events calendar'}>
  <header className="ffm-city-head"><span className="ffm-city-eyebrow">FRANKFURT ENTDECKEN</span><h1>{lang==='de'?'Events':'Events'}<span>.</span></h1>
   <p>{lang==='de'?'Finde Veranstaltungen für heute, das Wochenende oder einen bestimmten Tag.':'Explore events for today, the weekend or a day you choose.'}</p></header>
  <div className="ffm-event-view" role="group" aria-label="Kalenderansicht">
   <button aria-pressed={view==='day'} className={view==='day'?'active':''} onClick={()=>setView('day')}>{lang==='de'?'Tag':'Day'}</button>
   <button aria-pressed={view==='month'} className={view==='month'?'active':''} onClick={()=>setView('month')}>{lang==='de'?'Monat':'Month'}</button>
  </div>
  <div className="ffm-event-month-nav"><button aria-label="Vorheriger Monat" onClick={()=>stepMonth(-1)}><ChevronLeft size={19}/></button>
   <strong>{dateLabel(month,lang,{month:'long',year:'numeric'})}</strong><button aria-label="Nächster Monat" onClick={()=>stepMonth(1)}><ChevronRight size={19}/></button></div>
  {view==='day'?<div className="ffm-event-week" aria-label="Tag auswählen">{weekDates.map(d=><button key={d} type="button" className={d===selected?'active':''} aria-pressed={d===selected} onClick={()=>chooseDay(d)}><span>{dateLabel(d,lang,{weekday:'short'})}</span><strong>{d.slice(-2)}</strong></button>)}</div>:
   <div className="ffm-event-month" aria-label="Monatskalender">{['Mo','Di','Mi','Do','Fr','Sa','So'].map(w=><span key={w}>{w}</span>)}
    {calendarDays.map((d,i)=>d?<button key={d} aria-pressed={d===selected} className={d===selected?'active':''} onClick={()=>chooseDay(d)}>
      {Number(d.slice(-2))}<small>{filtered.filter(e=>bucket(e)===d).length||''}</small></button>:<span key={'empty-'+i}/>)}</div>}
  <div className="ffm-event-categories" role="group" aria-label="Eventkategorie">{categories.map(c=><button key={c} aria-pressed={category===c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c==='Alle'?(lang==='de'?'Alle':'All'):c}<span>{count(c)}</span></button>)}</div>
  <div className="ffm-event-result-bar"><strong>{dateLabel(selected,lang,{weekday:'long',day:'numeric',month:'long'})}</strong><span>{selectedEvents.length} {lang==='de'?'Events':'events'}</span><button onClick={onMap}><MapPin size={16}/>{lang==='de'?'Auf Karte':'On map'}</button></div>
  {busy?<p role="status">Events werden geladen …</p>:error?<p role="alert">Veranstaltungen konnten nicht geladen werden.</p>:
   selectedEvents.length===0?<div className="ffm-city-empty"><CalendarDays size={32}/><strong>{lang==='de'?'Für diesen Tag keine bestätigten Events.':'No confirmed events for this day.'}</strong><p>{lang==='de'?'Probiere einen anderen Tag oder eine Kategorie.':'Choose another date or category.'}</p></div>:
   <div className="ffm-event-list">{selectedEvents.map(e=><article className="ffm-event-item" key={e.id}>
    <div className="ffm-event-item-main"><span className="ffm-city-eyebrow"><Tag size={13}/>{canonicalCategory(e)}</span><h2>{e.title}</h2>
     <p>{lang==='en'&&e.description_en?e.description_en:e.description_de}</p>
     <span className="ffm-event-venue"><MapPin size={14}/>{e.venue}</span>
     <div className="ffm-event-badges"><span><Clock3 size={14}/>{new Date(e.starts_at).toLocaleTimeString(lang==='de'?'de-DE':'en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'})}{e.ends_at?'–'+new Date(e.ends_at).toLocaleTimeString(lang==='de'?'de-DE':'en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}):''}</span>
       {e.price_cents===0&&e.price_source_url&&<span>Kostenlos</span>}
       {e.price_cents!==null&&e.price_source_url&&e.price_cents>0&&<span>{(e.price_cents/100).toLocaleString(lang==='de'?'de-DE':'en-GB',{style:'currency',currency:'EUR'})}</span>}
      </div></div>
    <div className="ffm-event-item-actions"><EventActions event={e} loggedIn={loggedIn} onLogin={onLogin} onSaved={onSaved} onNotice={onNotice} saved={saved.includes(e.id)}/>
     {e.place_id&&e.latitude!=null&&e.longitude!=null&&<button onClick={()=>onPlace(e.place_id!)} className="ffm-event-place-link">Ort ansehen</button>}
     {e.source_url&&/^https?:\/\//.test(e.source_url)&&<a href={e.source_url} target="_blank" rel="noopener noreferrer">Quelle ↗</a>}
    </div>
   </article>)}</div>}
  <p className="ffm-city-disclaimer">{lang==='de'?'Zeiten, Preise und Verfügbarkeit vor dem Besuch beim Veranstalter prüfen. Für Nachtleben werden Starts zwischen 00:00 und 04:59 dem Vorabend zugeordnet.':'Confirm details with the organizer. Nightlife after midnight until 05:00 belongs to the preceding evening.'}</p>
 </section>;
}
