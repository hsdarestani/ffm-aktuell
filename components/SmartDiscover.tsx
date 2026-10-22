'use client';
import {useState,useRef,useEffect,type FormEvent} from 'react';
type Candidate={id:string;name:string;category:string;district:string;description_de:string;description_en:string;verified_at:string};
export default function SmartDiscover({onPlace,onDiscover,lang,loggedIn}:{onPlace:(id:string)=>void;onDiscover:()=>void;lang:'de'|'en';loggedIn:boolean}){
 const [q,setQ]=useState(''),[busy,setBusy]=useState(false),[items,setItems]=useState<Candidate[]>([]);
 const [notice,setNotice]=useState(''),[mode,setMode]=useState<'editorial'|'ai'|'discovery'>('editorial'),[asked,setAsked]=useState(false);
 const [useAI,setUseAI]=useState(false);
 const [useInterests,setUseInterests]=useState(false),[date,setDate]=useState(''),[occasion,setOccasion]=useState(''),[budget,setBudget]=useState(''),[eventBudget,setEventBudget]=useState(''),[weather,setWeather]=useState(false);
 const [events,setEvents]=useState<{id:string;title:string;starts_at:string;price_cents:number|null;price_source_url:string|null;source_url:string|null}[]>([]),[forecast,setForecast]=useState<{min:number;max:number;source_url:string;checked_at:string}|null>(null);
 const request=useRef<AbortController|null>(null);useEffect(()=>()=>request.current?.abort(),[]);
 const go=async(e:FormEvent)=>{e.preventDefault();if(q.trim().length<3)return;request.current?.abort();const ctl=new AbortController();request.current=ctl;setBusy(true);setAsked(true);
  try{const r=await fetch('/api/recommendations?'+new URLSearchParams({q:q.trim().slice(0,180),lang,date,occasion,budget,ai:useAI&&loggedIn?'1':'0',event_budget:eventBudget,weather:weather?'1':'0',use_interests:loggedIn&&useInterests?'1':'0'}),{cache:'no-store',signal:ctl.signal});
    const d=await r.json();if(!r.ok)throw Error('Service gerade nicht erreichbar.');
    setItems(Array.isArray(d.items)?d.items:[]);setEvents(d.events||[]);setForecast(d.weather||null);setMode(d.mode);setNotice(d.notice||'');
  }catch{if(ctl.signal.aborted)return;setEvents([]);setForecast(null);setNotice('Empfehlungen sind momentan nicht erreichbar.');setItems([]);}finally{if(request.current===ctl)setBusy(false)}
 };
 return <section className="ffm-assistant" aria-label="Persönliche Stadtideen">
  <div className="ffm-assistant-inner"><div><small>{lang==='de'?'PASSENDE IDEEN':'PERSONAL IDEAS'}</small><h2>{lang==='de'?'Was möchtest du erleben?':'What would you like to do?'}</h2><p>{lang==='de'?'Beschreibe deinen Plan und wähle passende Bedingungen.':'Describe your plan and choose what matters.'}</p></div>
  <form onSubmit={go}><label htmlFor="ffm-intent" className="sr-only">Freitextsuche nach Aktivitäten</label><input id="ffm-intent" value={q} onChange={e=>setQ(e.target.value)} minLength={3} maxLength={180} placeholder={lang==='de'?'Zum Beispiel: ein ruhiger Nachmittag mit Kultur':'For example: a relaxing cultural afternoon'}/><button type="submit" disabled={busy||q.trim().length<3}>{busy?'Suche …':lang==='de'?'Ideen finden':'Find ideas'}</button><details className="ffm-context-options"><summary>{lang==='de'?'Datum, Budget und Anlass':'Date, budget and occasion'}</summary><div className="ffm-context-grid">
 <label>Datum<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Preisniveau bis<select value={budget} onChange={e=>setBudget(e.target.value)}><option value="">Alle</option>{[1,2,3,4].map(n=><option key={n} value={n}>{'€'.repeat(n)}</option>)}</select></label>
 <label>Eintritt höchstens in Euro<input type="number" min="0" max="10000" step="0.01" value={eventBudget} onChange={e=>setEventBudget(e.target.value)}/></label>
 <label>Anlass<select value={occasion} onChange={e=>setOccasion(e.target.value)}><option value="">Alle</option><option value="family">Familie</option><option value="date">Date</option><option value="friends">Freunde</option><option value="quiet">Ruhe</option></select></label>
 <label><input type="checkbox" checked={weather} onChange={e=>setWeather(e.target.checked)}/> Wetter in Frankfurt berücksichtigen</label></div></details></form>
  {loggedIn&&<label className="ffm-intent-optin"><input type="checkbox" checked={useAI} onChange={e=>setUseAI(e.target.checked)}/> KI Sortierung verwenden. Suchtext und gewählte Interessen werden an OpenAI übertragen.</label>}
  {loggedIn&&<label className="ffm-intent-optin"><input type="checkbox" checked={useInterests} onChange={e=>setUseInterests(e.target.checked)}/> {lang==='de'?'Gespeicherte Interessen für Vorschläge verwenden':'Use my saved interests for suggestions'}</label>}
  {asked&&<div aria-live="polite">{mode==='ai'&&<small>{lang==='de'?'KI unterstützt · ausschließlich geprüfte Orte':'AI-assisted · verified venues only'}</small>}{mode==='discovery'&&<small>{lang==='de'?'Nur Entdeckung · NICHT geprüft':'Exploration only · NOT verified'}</small>}{notice&&<p>{notice}</p>}{forecast&&<p>Vorhersage: {forecast.min} bis {forecast.max} °C · <a href={forecast.source_url} target="_blank" rel="noopener noreferrer">OpenWeather</a> · Stand {new Date(forecast.checked_at).toLocaleTimeString(lang)}</p>}
   {items.length>0?<div className="ffm-assistant-results">{items.map(p=><button type="button" key={p.id} onClick={()=>onPlace(p.id)}><strong>{p.name}</strong><span>{p.category} · {p.district||'Frankfurt'}</span>{mode==='discovery'&&<em>{lang==='de'?'OSM · Ungeprüft':'OSM · Unverified'}</em>}</button>)}</div>:!busy&&<button className="ffm-assistant-alternative" onClick={onDiscover}>{lang==='de'?'Ungeprüfte OSM Orte ansehen →':'View unverified OSM places →'}</button>}<div className="ffm-assistant-results">{events.map(e=><article key={e.id}><strong>{e.title}</strong><p>{new Date(e.starts_at).toLocaleString(lang,{timeZone:'Europe/Berlin'})}</p>{e.price_cents!==null&&e.price_source_url&&<p>{(e.price_cents/100).toLocaleString(lang,{style:'currency',currency:'EUR'})} · <a href={e.price_source_url} target="_blank" rel="noopener noreferrer">Preisquelle</a></p>}</article>)}</div></div>}
  </div>
 </section>;
}
