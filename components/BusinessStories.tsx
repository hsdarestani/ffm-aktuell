'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useRef,useState} from 'react';
import CommunityMediaComposer from '@/components/CommunityMediaComposer';
type Business={id:string;places:{id:string;name:string;status:string}[]};
type Story={id:string;caption:string;status:string;expires_at:string};
export default function BusinessStories({business,onNotice}:{business:Business;onNotice:(text:string)=>void}){
 const ui=useUiText();
 const notice=useRef(onNotice);notice.current=onNotice;
 const [items,setItems]=useState<Story[]>([]),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/stories?business_id='+business.id,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>setItems(d.items)).catch(()=>{if(!c.signal.aborted)notice.current(ui("Unternehmensstories konnten nicht geladen werden."))});return()=>c.abort()},[business.id,revision]);
 async function remove(id:string){if(!window.confirm(ui("Unternehmensstory zurückziehen?")))return;setBusy(true);try{const r=await fetch('/api/stories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',id})});const d=await r.json();if(!r.ok||!d.removed)throw Error();setRevision(v=>v+1);onNotice(ui("Story zurückgezogen."))}catch{onNotice(ui("Story konnte nicht zurückgezogen werden."))}finally{setBusy(false)}}
 return <section className="panel"><CommunityMediaComposer business={business} loggedIn onLogin={()=>{}} onNotice={onNotice} onChanged={()=>setRevision(v=>v+1)}/><h3>{ui("Unternehmensstories verwalten")}</h3>{items.map(s=><article key={s.id}><p>{s.caption||ui("Story ohne Beschreibung")}</p><small>{new Date(s.expires_at).getTime()<=Date.now()?ui("Abgelaufen"):s.status==='pending'?ui("In Prüfung"):s.status==='published'?ui("Freigegeben"):ui("Abgelehnt")}</small>{['pending','published'].includes(s.status)&&<button disabled={busy} onClick={()=>void remove(s.id)}>{ui("Zurückziehen")}</button>}</article>)}</section>;
}
