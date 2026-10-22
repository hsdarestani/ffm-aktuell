'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
type Notice=(text:string)=>void;
export default function CommunityMediaComposer({loggedIn,onLogin,onNotice,onChanged,business}:{business?:{id:string;places:{id:string;name:string;status:string}[]};loggedIn:boolean;onLogin:()=>void;onNotice:Notice;onChanged:()=>void}){
 const ui=useUiText();
 const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false);
 const [kind,setKind]=useState<'post'|'story'>(business?'story':'post');
 const [placeId,setPlaceId]=useState('');
 const [mediaReady,setMediaReady]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;fetch('/api/media/status',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(active)setMediaReady(Boolean(d.upload_enabled))}).catch(()=>{if(active)setMediaReady(false)});return()=>{active=false}},[]);
 async function submit(e:FormEvent){
  e.preventDefault();if(!loggedIn){onLogin();return;}
  if(business&&!placeId){onNotice(ui("Bitte einen Standort auswählen."));return;}
  if(kind==='post'&&!text.trim())return;
  if(kind==='story'&&!file){onNotice(ui("Für eine Story bitte ein Bild oder Video auswählen."));return;}
  if(file&&!mediaReady){onNotice(ui("Medien Upload ist noch nicht aktiviert. Du kannst einen Textbeitrag schreiben."));return;}
  if(file&&!consent){onNotice(ui("Bitte die Nutzungsrechte bestätigen."));return;}
  setBusy(true);
  try{
   let mediaId:string|undefined;
   if(file){
    const form=new FormData();form.set('file',file);form.set('license_confirmed',String(consent));
    const upload=await fetch('/api/media/upload',{method:'POST',body:form});
    const result=await upload.json();
    if(!upload.ok)throw Error(result.error||ui("Datei konnte nicht hochgeladen werden."));
    mediaId=result.id;
   }
   const api=kind==='story'?'/api/stories':'/api/posts';
   const payload=kind==='story'?{action:'create',media_id:mediaId,caption:text.trim().slice(0,280),...(business?{business_id:business.id,place_id:placeId}:{})}:{body:text.trim(),media_id:mediaId};
   const res=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const outcome=await res.json();if(!res.ok)throw Error(outcome.error||ui("Beitrag konnte nicht angelegt werden"));
   setText('');setFile(null);setConsent(false);onChanged();
   onNotice(kind==='story'?ui("Story zur Prüfung eingereicht. Nach Freigabe maximal 24 Stunden sichtbar."):ui("Beitrag zur redaktionellen Prüfung eingereicht."));
  }catch(err){onNotice(err instanceof Error?err.message:ui("Anfrage fehlgeschlagen"));}
  finally{setBusy(false);}
 }
 return <form className="ffm-media-compose" onSubmit={submit}>
  {business&&<><h3>{ui("Unternehmensstory")}</h3><p>{ui("Aktives Unternehmens Premium mit Stories erforderlich. Standort und Unternehmen werden öffentlich genannt.")}</p><label>{ui("Standort")}<select value={placeId} onChange={e=>setPlaceId(e.target.value)} required><option value="">{ui("Standort auswählen")}</option>{business.places.filter(p=>p.status==='published').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></>}
  {!business&&<div className="ffm-media-mode" role="group" aria-label={ui("Art des Beitrags")}>
   <button type="button" aria-pressed={kind==='post'} onClick={()=>setKind('post')}>{ui("Beitrag")}</button>
   <button type="button" aria-pressed={kind==='story'} onClick={()=>setKind('story')}>{ui("Story · 24 Std.")}</button>
  </div>}
  <label className="ffm-media-label" htmlFor="ffm-community-text">{kind==='post'?ui("Was hast du entdeckt?"):ui("Kurze Story Beschreibung")}</label>
  <textarea id="ffm-community-text" value={text} onChange={e=>setText(e.target.value)} required={kind==='post'} maxLength={kind==='post'?1000:280} placeholder={ui("Dein Frankfurt Moment …")}/>
  <label className="ffm-media-label" htmlFor="ffm-community-file">{ui("Foto oder kurzes Video ")}{kind==='story'?ui("(erforderlich)"):ui("(optional)")}</label>
  <input id="ffm-community-file" type="file" disabled={!mediaReady} accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>setFile(e.currentTarget.files?.[0]||null)}/>
  {mediaReady===false&&<small role="status">{ui("Foto und Video Upload sind bis zur Aktivierung der Sicherheitsprüfung deaktiviert. Textbeiträge funktionieren weiterhin.")}</small>}
  {file&&<small>{file.name} {ui(" · maximal 24 MB · Sicherheitsprüfung und Freigabe")}</small>}
  {file&&<label className="ffm-media-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/> {ui(" Ich besitze die erforderlichen Rechte und stimme der Veröffentlichung nach Prüfung zu.")}</label>}
  {loggedIn?<button className="primary-btn small" disabled={busy}>{busy?ui("Wird verarbeitet …"):ui("Zur Prüfung senden")}</button>:
   <button type="button" className="primary-btn small" onClick={onLogin}>{ui("Anmelden und mitmachen")}</button>}
  <small>{ui("Keine automatische Veröffentlichung. Bilder und Videos benötigen einen aktiven Sicherheitsdienst.")}</small>
 </form>;
}
