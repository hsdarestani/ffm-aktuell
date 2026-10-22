'use client';
import {useEffect,useRef,useState} from 'react';
import CommunityMediaComposer from '@/components/CommunityMediaComposer';
type Business={id:string;places:{id:string;name:string;status:string}[]};
type Story={id:string;caption:string;status:string;expires_at:string};
export default function BusinessStories({business,onNotice}:{business:Business;onNotice:(text:string)=>void}){
 const notice=useRef(onNotice);notice.current=onNotice;
 const [items,setItems]=useState<Story[]>([]),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/stories?business_id='+business.id,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>setItems(d.items)).catch(()=>{if(!c.signal.aborted)notice.current('Unternehmensstories konnten nicht geladen werden.')});return()=>c.abort()},[business.id,revision]);
 async function remove(id:string){if(!window.confirm('Unternehmensstory zurückziehen?'))return;setBusy(true);try{const r=await fetch('/api/stories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',id})});const d=await r.json();if(!r.ok||!d.removed)throw Error();setRevision(v=>v+1);onNotice('Story zurückgezogen.')}catch{onNotice('Story konnte nicht zurückgezogen werden.')}finally{setBusy(false)}}
 return <section className="panel"><CommunityMediaComposer business={business} loggedIn onLogin={()=>{}} onNotice={onNotice} onChanged={()=>setRevision(v=>v+1)}/><h3>Unternehmensstories verwalten</h3>{items.map(s=><article key={s.id}><p>{s.caption||'Story ohne Beschreibung'}</p><small>{new Date(s.expires_at).getTime()<=Date.now()?'Abgelaufen':s.status==='pending'?'In Prüfung':s.status==='published'?'Freigegeben':'Abgelehnt'}</small>{['pending','published'].includes(s.status)&&<button disabled={busy} onClick={()=>void remove(s.id)}>Zurückziehen</button>}</article>)}</section>;
}
