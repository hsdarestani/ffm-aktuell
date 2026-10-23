'use client';
import {useEffect,useState} from 'react';
import {Sparkles,MapPin} from 'lucide-react';
import ContentImage from './ContentImage';
type Opening={id:string;name:string;category:string;district:string;image_url:string|null;opened_at:string;opening_source_url:string};
export default function NewInFrankfurt({lang,onPlace}:{lang:'de'|'en';onPlace:(id:string)=>void}){
 const [items,setItems]=useState<Opening[]>([]);
 useEffect(()=>{const c=new AbortController();fetch('/api/new-openings',{signal:c.signal,cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject()).then(d=>setItems(d.items||[])).catch(()=>{});return()=>c.abort()},[]);
 if(!items.length)return null;
 return <section className="ffm-new-opening"><header><span className="ffm-city-eyebrow"><Sparkles size={14}/> {lang==='de'?'FRISCH ENTDECKT':'JUST OPENED'}</span>
  <h2>{lang==='de'?'Neu in Frankfurt':'New in Frankfurt'}</h2><p>{lang==='de'?'Nachweislich neu eröffnet und redaktionell überprüft.':'Newly opened and independently checked.'}</p></header>
  <div className="ffm-new-opening-scroll">{items.map(p=><article key={p.id}>
   <button onClick={()=>onPlace(p.id)}>{p.image_url?<ContentImage src={p.image_url} alt="" loading="lazy"/>:<div className="ffm-new-opening-art"><Sparkles size={32}/></div>}
    <span className="ffm-new-opening-badge">NEU</span><strong>{p.name}</strong><small><MapPin size={13}/>{p.district||'Frankfurt'} · {p.category}</small>
    <small>{lang==='de'?'Eröffnet am ':'Opened '}{new Date(String(p.opened_at).slice(0,10)+'T12:00:00Z').toLocaleDateString(lang==='de'?'de-DE':'en-GB',{timeZone:'UTC'})}</small></button>
   <a href={p.opening_source_url} rel="noopener noreferrer" target="_blank">{lang==='de'?'Nachweis':'Source'} ↗</a>
  </article>)}</div></section>;
}
