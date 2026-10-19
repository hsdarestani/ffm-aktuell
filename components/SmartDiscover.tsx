'use client';
import {useState,type FormEvent} from 'react';
type Candidate={id:string;name:string;category:string;district:string;description_de:string;description_en:string;verified_at:string};
export default function SmartDiscover({onPlace,onDiscover,lang}:{onPlace:(id:string)=>void;onDiscover:()=>void;lang:'de'|'en'}){
 const [q,setQ]=useState(''),[busy,setBusy]=useState(false),[items,setItems]=useState<Candidate[]>([]);
 const [notice,setNotice]=useState(''),[mode,setMode]=useState<'editorial'|'ai'>('editorial'),[asked,setAsked]=useState(false);
 const go=async(e:FormEvent)=>{e.preventDefault();if(q.trim().length<3)return;setBusy(true);setAsked(true);
  try{const r=await fetch('/api/recommendations?'+new URLSearchParams({q:q.trim().slice(0,180),lang}),{cache:'no-store'});
    const d=await r.json();if(!r.ok)throw Error('Service gerade nicht erreichbar.');
    setItems(d.items||[]);setMode(d.mode);setNotice(d.notice||'');
  }catch{setNotice('Empfehlungen sind momentan nicht erreichbar.');setItems([]);}finally{setBusy(false)}
 };
 return <section className="ffm-assistant" aria-label="Persönliche Stadtideen">
  <div className="ffm-assistant-inner"><div><small>{lang==='de'?'PASSENDE IDEEN':'PERSONAL IDEAS'}</small><h2>{lang==='de'?'Was möchtest du erleben?':'What would you like to do?'}</h2><p>{lang==='de'?'Beschreibe deinen Plan. Wir zeigen nur nachweislich geprüfte Orte.':'Describe your plan. We only suggest independently verified places.'}</p></div>
  <form onSubmit={go}><label htmlFor="ffm-intent" className="sr-only">Freitextsuche nach Aktivitäten</label><input id="ffm-intent" value={q} onChange={e=>setQ(e.target.value)} minLength={3} maxLength={180} placeholder={lang==='de'?'Zum Beispiel: ein ruhiger Nachmittag mit Kultur':'For example: a relaxing cultural afternoon'}/><button type="submit" disabled={busy||q.trim().length<3}>{busy?'Suche …':lang==='de'?'Ideen finden':'Find ideas'}</button></form>
  {asked&&<div aria-live="polite">{mode==='ai'&&<small>KI unterstützt · Angaben nur aus geprüften Orten</small>}{notice&&<p>{notice}</p>}
   {items.length>0?<div className="ffm-assistant-results">{items.map(p=><button type="button" key={p.id} onClick={()=>onPlace(p.id)}><strong>{p.name}</strong><span>{p.category} · {p.district||'Frankfurt'}</span></button>)}</div>:!busy&&<button className="ffm-assistant-alternative" onClick={onDiscover}>Ungeprüfte OSM Orte ansehen →</button>}</div>}
  </div>
 </section>;
}