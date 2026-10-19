'use client';
import {useState,type FormEvent} from 'react';
type Notice=(text:string)=>void;
export default function CommunityMediaComposer({loggedIn,onLogin,onNotice,onChanged}:{loggedIn:boolean;onLogin:()=>void;onNotice:Notice;onChanged:()=>void}){
 const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState<'post'|'story'>('post');
 async function submit(e:FormEvent){
  e.preventDefault();if(!loggedIn){onLogin();return;}
  if(kind==='post'&&!text.trim())return;
  if(kind==='story'&&!file){onNotice('Für eine Story bitte ein Bild oder Video auswählen.');return;}
  if(file&&!consent){onNotice('Bitte die Nutzungsrechte bestätigen.');return;}
  setBusy(true);
  try{
   let mediaId:string|undefined;
   if(file){
    const form=new FormData();form.set('file',file);form.set('license_confirmed',String(consent));
    const upload=await fetch('/api/media/upload',{method:'POST',body:form});
    const result=await upload.json();
    if(!upload.ok)throw Error(result.error||'Datei konnte nicht hochgeladen werden.');
    mediaId=result.id;
   }
   const api=kind==='story'?'/api/stories':'/api/posts';
   const payload=kind==='story'?{action:'create',media_id:mediaId,caption:text.trim().slice(0,280)}:{body:text.trim(),media_id:mediaId};
   const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const outcome=await res.json();if(!res.ok)throw Error(outcome.error||'Beitrag konnte nicht angelegt werden');
   setText('');setFile(null);setConsent(false);onChanged();
   onNotice(kind==='story'?'Story zur Prüfung eingereicht. Nach Freigabe maximal 24 Stunden sichtbar.':'Beitrag zur redaktionellen Prüfung eingereicht.');
  }catch(err){onNotice(err instanceof Error?err.message:'Anfrage fehlgeschlagen');}
  finally{setBusy(false);}
 }
 return <form className="ffm-media-compose" onSubmit={submit}>
  <div className="ffm-media-mode" role="group" aria-label="Art des Beitrags">
   <button type="button" aria-pressed={kind==='post'} onClick={()=>setKind('post')}>Beitrag</button>
   <button type="button" aria-pressed={kind==='story'} onClick={()=>setKind('story')}>Story · 24 Std.</button>
  </div>
  <label className="ffm-media-label" htmlFor="ffm-community-text">{kind==='post'?'Was hast du entdeckt?':'Kurze Story Beschreibung'}</label>
  <textarea id="ffm-community-text" value={text} onChange={e=>setText(e.target.value)} required={kind==='post'} maxLength={kind==='post'?1000:280} placeholder="Dein Frankfurt Moment …"/>
  <label className="ffm-media-label" htmlFor="ffm-community-file">Foto oder kurzes Video {kind==='story'?'(erforderlich)':'(optional)'}</label>
  <input id="ffm-community-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>setFile(e.currentTarget.files?.[0]||null)}/>
  {file&&<small>{file.name} · maximal 24 MB · Sicherheitsprüfung und Freigabe</small>}
  {file&&<label className="ffm-media-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> Ich besitze die erforderlichen Rechte und stimme der Veröffentlichung nach Prüfung zu.</label>}
  {loggedIn?<button className="primary-btn small" disabled={busy}>{busy?'Wird verarbeitet …':'Zur Prüfung senden'}</button>:
   <button type="button" className="primary-btn small" onClick={onLogin}>Anmelden und mitmachen</button>}
  <small>Keine automatische Veröffentlichung. Bilder und Videos benötigen einen aktiven Sicherheitsdienst.</small>
 </form>;
}