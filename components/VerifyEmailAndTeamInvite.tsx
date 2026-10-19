'use client';
import {useEffect,useState} from 'react';
export default function VerifyEmailAndTeamInvite({loggedIn,onLogin,onNotice}:{loggedIn:boolean;onLogin:()=>void;onNotice:(text:string)=>void}){
 const [verified,setVerified]=useState(false),[delivery,setDelivery]=useState(false),[email,setEmail]=useState(''),[busy,setBusy]=useState(false);
 const [invite,setInvite]=useState(''),[verifyToken,setVerifyToken]=useState('');
 const [business,setBusiness]=useState<{business_name:string;role:string}|null>(null);
 useEffect(()=>{const q=new URLSearchParams(window.location.search);setInvite(q.get('team_invite')||'');setVerifyToken(q.get('verify_email')||'')},[]);
 useEffect(()=>{if(!loggedIn)return;let ok=true;fetch('/api/me/verify-email/request',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(ok){setVerified(Boolean(d.verified));setDelivery(Boolean(d.delivery_available));setEmail(d.email||'')}}).catch(()=>{});return()=>{ok=false}},[loggedIn]);
 useEffect(()=>{if(!loggedIn||!invite||!verified)return;let current=true;fetch('/api/business/team/accept?'+new URLSearchParams({token:invite}),{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(current)setBusiness(d.invite)}).catch(()=>{if(current)setBusiness(null)});return()=>{current=false}},[invite,loggedIn,verified]);
 async function action(path:string,body?:object){setBusy(true);try{const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok)throw Error(d.error||'Aktion fehlgeschlagen');return d}catch(e){onNotice(e instanceof Error?e.message:'Aktion fehlgeschlagen');return null}finally{setBusy(false)}}
 async function confirm(){const d=await action('me/verify-email/confirm',{token:verifyToken});if(d?.verified){setVerified(true);setVerifyToken('');const url=new URL(window.location.href);url.searchParams.delete('verify_email');window.history.replaceState(null,'',url.pathname+url.search);onNotice('E-Mail-Adresse bestätigt.')}}
 async function accept(){const d=await action('business/team/accept',{token:invite});if(d?.joined){setInvite('');setBusiness(null);const url=new URL(window.location.href);url.searchParams.delete('team_invite');window.history.replaceState(null,'',url.pathname+url.search);onNotice('Einladung angenommen. Teamzugriff ist freigeschaltet.');}}
 if(!loggedIn)return invite||verifyToken?<section className="ffm-team-section"><h2>Einladung oder E-Mail-Bestätigung</h2><p>Bitte melde dich mit der eingeladenen E-Mail-Adresse an.</p><button type="button" onClick={onLogin}>Anmelden</button></section>:null;
 return <section className="ffm-team-section"><h2>E-Mail und Einladungen</h2><p>{email} · {verified?'✓ Bestätigt':'Noch nicht bestätigt'}</p>
  {!verified&&<div className="ffm-team-check"><p>Für Mitarbeiterzugänge muss die E-Mail-Adresse unabhängig bestätigt werden.</p>
   {delivery?<button type="button" disabled={busy} onClick={async()=>{const d=await action('me/verify-email/request');if(d?.sent)onNotice('Prüfe dein E-Mail-Postfach.')}}>Bestätigungs-E-Mail anfordern</button>:<p>E-Mail-Versand muss zuerst auf dem Server konfiguriert werden.</p>}</div>}
  {verifyToken&&!verified&&<button type="button" disabled={busy} onClick={()=>void confirm()}>E-Mail mit diesem Link bestätigen</button>}
  {invite&&<div className="ffm-team-check"><strong>Einladung zum Unternehmensteam</strong>
   {!verified?<p>Bitte zuerst deine E-Mail-Adresse bestätigen.</p>:business?<><p>{business.business_name} · {business.role==='editor'?'Bearbeiten':'Ansehen'}</p><button type="button" disabled={busy} onClick={()=>void accept()}>Einladung annehmen</button></>:<p>Diese Einladung ist für dein Konto nicht gültig, abgelaufen oder wurde zurückgezogen.</p>}
  </div>}
 </section>;
}
