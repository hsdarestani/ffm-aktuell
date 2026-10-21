'use client';
import {useEffect,useState} from 'react';
export default function DiscoveryTips({onPlace}:{onPlace:(id:string)=>void}){
 const [tips,setTips]=useState<{id:string;title:string;body:string;place_id:string}[]>([]);
 useEffect(()=>{const c=new AbortController();fetch('/api/tips',{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setTips(d.items||[])).catch(()=>{});return()=>c.abort()},[]);
 if(!tips.length)return null;
 return <section className="ffm-profile-panel"><h2>Aktuelle Stadttipps</h2>{tips.map(t=><article key={t.id}><h3>{t.title}</h3><p>{t.body}</p><button type="button" onClick={()=>onPlace(t.place_id)}>Ort ansehen</button></article>)}</section>;
}
