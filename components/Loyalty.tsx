'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
async function api(body?:object,search=''){
 const r=await fetch('/api/loyalty'+search,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'Aktion fehlgeschlagen');return d;
}
function ConfirmationCode({value}:{value:{code:string;expires_at:string}|null}){
 const ui=useUiText();return value?<div role="status"><strong>{value.code.match(/.{1,4}/g)?.join(' ')}</strong><p>{ui("Dem Betrieb vor Ort zeigen. Gültig bis ")}{new Date(value.expires_at).toLocaleTimeString((ui.locale==='de'?'de-DE':'en-GB'),{hour:'2-digit',minute:'2-digit'})}{ui(". Keine automatische Standortbestätigung.")}</p></div>:null}
export function VisitCode({placeId,loggedIn,onLogin}:{placeId:string;loggedIn:boolean;onLogin:()=>void}){
 const ui=useUiText();
 const [code,setCode]=useState<{code:string;expires_at:string}|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function create(){if(!loggedIn){onLogin();return}setBusy(true);try{setCode(await api({action:'request_visit',place_id:placeId}));setMessage('')}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="ffm-profile-panel"><h3>{ui("Besuch bestätigen lassen")}</h3><p>{ui("Der Betrieb bestätigt deinen tatsächlichen Besuch mit einem einmaligen Code. Keine GPS Aufzeichnung und keine automatische Gutschrift.")}</p><button type="button" disabled={busy} onClick={()=>void create()}>{ui("Besuchscode anzeigen")}</button><ConfirmationCode value={code}/><p role="status">{ui(message)}</p></section>;
}
export function LoyaltyConfirm(){
 const ui=useUiText();
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function confirm(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,code=new FormData(form).get('code');if(!window.confirm(ui("Den tatsächlichen Besuch bestätigen beziehungsweise den erreichten Vorteil jetzt ausgeben?")))return;setBusy(true);try{const d=await api({action:'confirm',code});setMessage(d.notice);form.reset()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="ffm-profile-panel"><h3>{ui("Besuch oder Treuevorteil bestätigen")}</h3><p>{ui("Nur bei tatsächlicher Anwesenheit bestätigen. Ein Vorteil wird genau einmal als ausgegeben erfasst.")}</p><form onSubmit={confirm}><label>{ui("Kundencode")}<input name="code" required autoComplete="off" maxLength={40}/></label><button disabled={busy}>{ui("Prüfen und bestätigen")}</button></form><p role="status">{ui(message)}</p></section>;
}
export function BusinessLoyalty({businessId}:{businessId:string}){
 const ui=useUiText();
 const [program,setProgram]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{api(undefined,'?scope=business&business_id='+encodeURIComponent(businessId)).then(d=>setProgram(d.program)).catch(e=>setMessage(e.message))},[businessId]);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);setBusy(true);try{await api({action:'save_program',business_id:businessId,goal:Number(d.get('goal')),minimum_hours:Number(d.get('hours')),reward:d.get('reward'),terms_url:d.get('terms')});setProgram((await api(undefined,'?scope=business&business_id='+businessId)).program);setMessage(ui("Zur Freigabe eingereicht. Bestehende Karten behalten ihre vereinbarten Vorteile."))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="ffm-profile-panel"><h2>{ui("Digitale Treuekarte")}</h2><p>{ui("Standard: fünf vom Betrieb bestätigte Besuche, mindestens 24 Stunden Abstand. Regeln und Vorteil sind veränderbar. Redaktionelle Freigabe vor dem Start.")}</p><p>{ui("Status: ")}{program?.status==='published'?ui("Freigegeben"):program?.status==='pending'?ui("In Prüfung"):program?.status==='rejected'?ui("Abgelehnt"):ui("Noch nicht eingereicht")}</p><form key={program?.updated_at||'new'} onSubmit={save}><label>{ui("Benötigte Besuche")}<input type="number" name="goal" required min={2} max={50} defaultValue={program?.goal||5}/></label><label>{ui("Mindestabstand in Stunden")}<input type="number" name="hours" required min={1} max={168} defaultValue={program?.minimum_hours||24}/></label><label>{ui("Erreichter Vorteil")}<textarea name="reward" required minLength={10} maxLength={500} defaultValue={program?.reward||''}/></label><label>{ui("HTTPS Bedingungen")}<input type="url" name="terms" required defaultValue={program?.terms_url||''}/></label><button disabled={busy}>{ui("Zur Prüfung speichern")}</button></form><p role="status">{ui(message)}</p><LoyaltyConfirm/></section>;
}
export function LoyaltyWallet(){
 const ui=useUiText();
 const [cards,setCards]=useState<any[]>([]),[visits,setVisits]=useState<any[]>([]),[code,setCode]=useState<{code:string;expires_at:string}|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{api().then(d=>{setCards(d.cards||[]);setVisits(d.visits||[])}).catch(e=>setMessage(e.message))},[]);
 async function claim(e:FormEvent<HTMLFormElement>,cardId:string){e.preventDefault();setBusy(true);try{setCode(await api({action:'request_reward',card_id:cardId,place_id:new FormData(e.currentTarget).get('place')}));setMessage(ui("Nur vor Ort beim Betrieb einlösen."))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="ffm-profile-panel"><h2>{ui("Besuche und Treuekarten")}</h2><p>{ui("Es zählen ausschließlich vom Betrieb bestätigte Besuche. Kein allgemeines Punktesystem.")}</p><p role="status">{ui(message)}</p><ConfirmationCode value={code}/>
 {!cards.length&&<p>{ui("Noch keine Treuekarte. Nach einem bestätigten Besuch bei einem teilnehmenden Betrieb entsteht die Karte automatisch.")}</p>}
 {cards.map(c=><article key={c.id}><h3>{c.business_name}</h3><p>{c.visits} {ui(" von ")}{c.goal} {ui(" Besuchen · ")}{c.reward}</p><a href={c.terms_url} target="_blank" rel="noopener noreferrer">{ui("Vereinbarte Bedingungen")}</a>{c.redeemed_at?<p>{ui("Vorteil am ")}{new Date(c.redeemed_at).toLocaleDateString((ui.locale==='de'?'de-DE':'en-GB'))} {ui(" eingelöst.")}</p>:c.visits>=c.goal?<form onSubmit={e=>void claim(e,c.id)}><label>{ui("Standort")}<select name="place" required>{c.places.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy||!c.places.length}>{ui("Einmaligen Einlösecode anzeigen")}</button></form>:<p>{ui("Weitere bestätigte Besuche sammeln.")}</p>}</article>)}
 {visits.length>0&&<details><summary>{ui("Bestätigte Besuche (")}{visits.length})</summary><ul>{visits.map(v=><li key={v.id}>{v.place_name} · {new Date(v.confirmed_at).toLocaleDateString((ui.locale==='de'?'de-DE':'en-GB'))}</li>)}</ul></details>}</section>;
}
export function LoyaltyStudio(){
 const ui=useUiText();
 const [programs,setPrograms]=useState<any[]>([]),[message,setMessage]=useState('');
 async function load(){const d=await api(undefined,'?scope=admin');setPrograms(d.programs||[])}
 useEffect(()=>{load().catch(e=>setMessage(e.message))},[]);
 async function review(id:string,approve:boolean){const reason=window.prompt(ui("Prüfung und Begründung (mindestens zehn Zeichen)"));if(!reason||reason.trim().length<10)return;try{await api({action:'review_program',id,approve,reason});await load();setMessage(ui("Prüfung gespeichert."))}catch(e){setMessage((e as Error).message)}}
 return <section className="ffm-catalog-studio"><h1>{ui("Treuekarten prüfen")}</h1><p>{ui("Reale Vorteile und nachvollziehbare Bedingungen vor Veröffentlichung prüfen. Bestehende Karten behalten ihre vereinbarten Regeln.")}</p><p role="status">{ui(message)}</p>{programs.map(p=><article key={p.id} className="ffm-catalog-panel"><h2>{p.business_name}</h2><p>{p.goal} {ui(" Besuche · mindestens ")}{p.minimum_hours} {ui(" Stunden Abstand · ")}{p.reward}</p><a href={p.terms_url} target="_blank" rel="noopener noreferrer">{ui("Bedingungen")}</a><p>{p.status==='published'?ui("Freigegeben"):p.status==='pending'?ui("In Prüfung"):p.status==='rejected'?ui("Abgelehnt"):ui("Entwurf")}</p><button type="button" onClick={()=>void review(p.id,true)}>{ui("Freigeben")}</button><button type="button" onClick={()=>void review(p.id,false)}>{ui("Neue Karten ablehnen oder stoppen")}</button></article>)}</section>;
}
