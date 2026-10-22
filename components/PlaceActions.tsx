'use client';
import {useUiText} from '@/lib/ui-locale';

import {useState,type FormEvent} from 'react';
import {Navigation,Bookmark,BookmarkCheck,Share2,Phone,Globe,Flag,SquarePen,ExternalLink,ChevronDown} from 'lucide-react';
import {directionsUrl,locationShareUrl,safePhoneHref} from '@/lib/location-actions';

type Venue={
 id:string;name:string;address?:string|null;
 latitude?:number|null;longitude?:number|null;
 phone?:string|null;website?:string|null;demo?:boolean;
};
type Props={
 venue:Venue;saved:boolean;loggedIn:boolean;
 onSave:()=>Promise<void>|void;onLogin:()=>void;
 onReport:(reason:string,message:string)=>Promise<boolean>;
 onPost:(body:string)=>Promise<boolean>;
 onNotice:(message:string)=>void;
};
const safeHttp=(value:string|null|undefined)=>{
 try{const u=new URL(value||'');return ['https:','http:'].includes(u.protocol)?u.toString():null}catch{return null}
};

export default function PlaceActions({venue,saved,loggedIn,onSave,onLogin,onReport,onPost,onNotice}:Props){
 const ui=useUiText();
 const [busy,setBusy]=useState(false);
 const [reportOpen,setReportOpen]=useState(false);
 const [postOpen,setPostOpen]=useState(false);
 const route=venue.demo?null:directionsUrl(venue);
 const phone=venue.demo?null:safePhoneHref(venue.phone);
 const website=venue.demo?null:safeHttp(venue.website);
 const share=async()=>{
  if(venue.demo)return;
  const url=locationShareUrl(venue.id,window.location.origin);
  if(!url){onNotice(ui("Für diesen Musterort ist noch kein Link verfügbar."));return;}
  try{
   if(navigator.share){
    await navigator.share({title:venue.name,url});return;
   }
   if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(url);onNotice(ui("Link kopiert."));return;
   }
   window.prompt(ui("Link zum Ort kopieren"),url);
  }catch(e){
   if((e as DOMException).name==='AbortError')return;
   window.prompt(ui("Link zum Ort kopieren"),url);
  }
 };
 const submitReport=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  const form=e.currentTarget;
  if(!loggedIn){onLogin();return;}
  const data=new FormData(form);
  setBusy(true);
  try{if(await onReport(String(data.get('reason')||''),String(data.get('message')||''))){
   setReportOpen(false);form.reset();
  }}finally{setBusy(false)}
 };
 const submitPost=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  const form=e.currentTarget;
  if(!loggedIn){onLogin();return;}
  const body=String(new FormData(form).get('body')||'').trim();
  if(body.length<3){onNotice(ui("Bitte beschreibe deinen Tipp etwas genauer."));return;}
  setBusy(true);
  try{if(await onPost(body)){setPostOpen(false);form.reset();}}
  finally{setBusy(false)}
 };
 const save=()=>{if(venue.demo){onNotice(ui("Musterorte können nicht gespeichert werden."));return;}if(!loggedIn){onLogin();return;}void onSave();};
 return <section className="ffm-place-actions" aria-label={ui("Aktionen zu diesem Ort")}>
  <div className="ffm-place-action-core">
   {route?<a className="ffm-place-action ffm-place-action-route" href={route} target="_blank" rel="noopener noreferrer"><Navigation size={20}/><span>{ui("Route")}</span></a>:
    <span className="ffm-place-action disabled" title={ui("Keine überprüfbare Adresse")}><Navigation size={20}/><span>{ui("Route")}</span></span>}
   <button type="button" className="ffm-place-action" onClick={save} disabled={Boolean(venue.demo)}>
    {saved?<BookmarkCheck size={20}/>:<Bookmark size={20}/>}<span>{saved?ui("Gemerkt"):ui("Merken")}</span>
   </button>
   <button type="button" className="ffm-place-action" onClick={()=>void share()} disabled={Boolean(venue.demo)}><Share2 size={20}/><span>{ui("Teilen")}</span></button>
  </div>
  {(phone||website)&&<div className="ffm-place-action-links">
   {phone&&<a href={phone}><Phone size={16}/> {ui(" Anrufen")}</a>}
   {website&&<a href={website} target="_blank" rel="noopener noreferrer"><Globe size={16}/> {ui(" Website ")}<ExternalLink size={12}/></a>}
  </div>}
  {!venue.demo&&<details className="ffm-place-action-more">
   <summary>{ui("Mehr zum Ort ")}<ChevronDown size={16}/></summary>
   <div className="ffm-place-action-more-buttons">
    <button type="button" aria-expanded={postOpen} onClick={()=>{setPostOpen(v=>!v);setReportOpen(false)}}><SquarePen size={16}/> {ui(" Tipp schreiben")}</button>
    <button type="button" aria-expanded={reportOpen} onClick={()=>{setReportOpen(v=>!v);setPostOpen(false)}}><Flag size={16}/> {ui(" Fehler melden")}</button>
   </div>
   {postOpen&&<form className="ffm-place-action-form" onSubmit={submitPost}>
    <label>{ui("Dein Tipp für andere")}<textarea name="body" minLength={3} maxLength={1000} rows={3} placeholder={ui("Was sollten Besucher wissen?")} required/></label>
    <p>{ui("Dein Beitrag wird vor der Veröffentlichung geprüft.")}</p>
    <button type="submit" disabled={busy}>{loggedIn?ui("Tipp einreichen"):ui("Zum Anmelden")}</button>
   </form>}
   {reportOpen&&<form className="ffm-place-action-form" onSubmit={submitReport}>
    <label>{ui("Was stimmt nicht?")}<select name="reason" defaultValue="details">
     <option value="details">{ui("Informationen stimmen nicht")}</option>
     <option value="closed">{ui("Ort möglicherweise geschlossen")}</option>
     <option value="address">{ui("Adresse oder Standort falsch")}</option>
     <option value="other">{ui("Anderes Problem")}</option>
    </select></label>
    <label>{ui("Kurze Beschreibung")}<textarea name="message" rows={3} minLength={12} maxLength={750} placeholder={ui("Was sollte überprüft werden?")} required/></label>
    <p>{ui("Die Redaktion prüft die Meldung. Der Ort wird nicht automatisch gesperrt.")}</p>
    <button type="submit" disabled={busy}>{loggedIn?ui("Meldung senden"):ui("Zum Anmelden")}</button>
   </form>}
  </details>}
 </section>;
}

