'use client';
import {useEffect,useState} from 'react';
type Story={business_name?:string|null;place_name?:string|null;id:string;caption:string;expires_at:string;media_type:string;media_url:string};
export default function StoriesStrip({reload}:{reload:number}){
 const [list,setList]=useState<Story[]>([]),[failed,setFailed]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/stories',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{if(live){setList(d.items||[]);setFailed(false)}}).catch(()=>{if(live)setFailed(true)});return()=>{live=false}},[reload]);
 return <section className="ffm-real-stories" aria-label="Aktuelle Stories"><div className="ffm-media-head"><h2>Aus der Stadt · Stories</h2><span>24 Stunden sichtbar</span></div>
  {failed?<p>Stories sind gerade nicht erreichbar.</p>:list.length===0?<p>Noch keine freigegebenen Stories. Sei die erste Person, die einen Moment teilt.</p>:
   <div className="ffm-story-grid">{list.map(s=><article key={s.id}>
    {s.media_type.startsWith('video/')?<video src={s.media_url} controls preload="none" playsInline aria-label={s.caption||'Frankfurt Story'}/>:
     <img src={s.media_url} alt={s.caption||'Ein Moment aus Frankfurt'} loading="lazy"/>}
    {s.business_name&&<small>Unternehmensstory · {s.business_name} · {s.place_name}</small>}{s.caption&&<p>{s.caption}</p>}<small>Story endet {new Date(s.expires_at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</small>
   </article>)}</div>}
 </section>;
}
