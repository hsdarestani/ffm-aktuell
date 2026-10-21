'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {BookMarked,CalendarDays,Download,LockKeyhole,MapPin,Save,Trash2} from 'lucide-react';
import {CouponWallet} from '@/components/CouponPilot';
import PushSettings from '@/components/PushSettings';
import SavedEvents from '@/components/SavedEvents';
type User={id:string;email:string;display_name:string;role:string};
type Prefs={interests:string[];districts:string[];share_activity:boolean;notify_events:boolean;notify_news:boolean;notify_offers:boolean};
type Props={user:User|null;onLogin:()=>void;onNotice:(message:string)=>void;onDeleted:()=>void;onSavedPlaces:()=>void;onTours:()=>void};
const defaults:Prefs={interests:[],districts:[],share_activity:false,notify_events:false,notify_news:false,notify_offers:false};
const interests=['Cafés','Restaurants','Bars','Kultur','Freizeit','Familie','Sport','Natur','Events'];
async function request(path:string,body?:unknown){
 const response=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',method:body===undefined?'GET':'POST',
  headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'Anfrage fehlgeschlagen');
 return data;
}
export default function ProfileSettings({user,onLogin,onNotice,onDeleted,onSavedPlaces,onTours}:Props){
 const [pref,setPref]=useState<Prefs>(defaults);
 const [districts,setDistricts]=useState('');
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [deleteOpen,setDeleteOpen]=useState(false);
 const [security,setSecurity]=useState<{social_providers:string[];social_deletion_available:boolean;requires_password:boolean}|null>(null);
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 useEffect(()=>{if(!user)return;let alive=true;request('me/account-security').then(d=>{if(alive)setSecurity(d)}).catch(()=>{});return()=>{alive=false}},[user?.id]);
 useEffect(()=>{
  if(!user){setLoaded(true);return}
  let live=true;
  request('me/preferences').then(d=>{if(live){setPref(d.preferences||defaults);setDistricts((d.preferences?.districts||[]).join(', '));}})
   .catch(()=>{if(live)onNotice('Deine Einstellungen konnten nicht geladen werden.')})
   .finally(()=>{if(live)setLoaded(true)});
  return()=>{live=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[user?.id]);
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);
  try{
   const d=await request('me/preferences',{...pref,districts:districts.split(',').map(x=>x.trim()).filter(Boolean).slice(0,12)});
   setPref(d.preferences);onNotice('Einstellungen gespeichert.');
  }catch{onNotice('Einstellungen konnten nicht gespeichert werden.')}
  finally{setBusy(false)}
 };
 const exportData=async()=>{
  try{
   const d=await request('me/export');
   const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
   const uri=URL.createObjectURL(blob);const a=document.createElement('a');
   a.href=uri;a.download='ffm-meine-daten.json';document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(uri),2000);
  }catch{onNotice('Datenexport derzeit nicht verfügbar.')}
 };
 const deleteAccount=async(e:FormEvent)=>{
  e.preventDefault();
  if(confirm!=='KONTO LÖSCHEN'||(!password&&!security?.social_deletion_available)||busy)return;
  if(!window.confirm('Dein Konto und deine privaten Daten dauerhaft löschen?'))return;
  setBusy(true);
  try{await request('me/delete',{password,confirmation:'KONTO LÖSCHEN'});setPassword('');setConfirm('');onDeleted();}
  catch{onNotice('Konto konnte nicht gelöscht werden. Bitte Passwort prüfen oder mit Apple/Google neu anmelden; bestehende Firmenzugänge zuerst übertragen.')}
  finally{setBusy(false)}
 };
 if(!user)return <main className="ffm-profile-page"><h1>Mein Profil</h1><p>Melde dich an, um deine Einstellungen zu verwalten.</p><button type="button" className="ffm-profile-primary" onClick={onLogin}>Anmelden</button></main>;
 return <main className="ffm-profile-page">
  <div className="ffm-profile-head"><span>DEIN FRANKFURT</span><h1>Mein Profil<span>.</span></h1><p>{user.email}</p></div>
  <div className="ffm-profile-shortcuts">
   <button type="button" onClick={onSavedPlaces}><BookMarked size={20}/> Meine Orte</button>
   <button type="button" onClick={onTours}><MapPin size={20}/> Meine Touren</button>
  </div>
  <form onSubmit={save} className="ffm-profile-panel">
   <h2>Was interessiert dich?</h2>
   <div className="ffm-profile-chips">{interests.map(item=><button key={item} type="button" aria-pressed={pref.interests.includes(item)} className={pref.interests.includes(item)?'selected':''} onClick={()=>setPref(v=>({...v,interests:v.interests.includes(item)?v.interests.filter(s=>s!==item):[...v.interests,item]}))}>{item}</button>)}</div>
   <label className="ffm-profile-field">Lieblingsviertel <small>Mit Komma trennen, zum Beispiel Sachsenhausen, Nordend</small><input maxLength={700} value={districts} onChange={e=>setDistricts(e.target.value)} placeholder="Deine Stadtteile"/></label>
   <h2>Privatsphäre</h2>
   <label className="ffm-profile-check"><input type="checkbox" checked={pref.share_activity} onChange={e=>setPref(v=>({...v,share_activity:e.target.checked}))}/><span>Freigegebene Aktivitäten anzeigen<small>Standardmäßig aus. Es gibt noch keine öffentliche Aktivitätsübersicht.</small></span></label>
   <h2>Mitteilungen</h2>
   <p className="ffm-profile-tip">Wähle die gewünschten Kategorien. Für Push zusätzlich dieses Gerät weiter unten aktivieren.</p>
   {([['notify_events','Veranstaltungen'],['notify_news','Neuigkeiten'],['notify_offers','Angebote']] as const).map(([key,title])=>
    <label className="ffm-profile-check" key={key}><input type="checkbox" checked={pref[key]} onChange={e=>setPref(v=>({...v,[key]:e.target.checked}))}/><span>{title}</span></label>)}
   <button type="submit" disabled={busy||!loaded} className="ffm-profile-primary"><Save size={16}/> Speichern</button>
  </form>
  <PushSettings key={user.id+'-push'}/>
  <SavedEvents key={user.id} userId={user.id} onNotice={onNotice}/>
  <CouponWallet onNotice={onNotice}/>
  <section className="ffm-profile-panel">
   <h2>Meine Daten</h2><p className="ffm-profile-tip">Du kannst deine Kontodaten als JSON Datei herunterladen.</p>
   <button type="button" className="ffm-profile-outline" onClick={()=>void exportData()}><Download size={16}/> Daten exportieren</button>
   {user.role!=='admin'&&<div className="ffm-profile-danger">
    <button type="button" onClick={()=>setDeleteOpen(v=>!v)} aria-expanded={deleteOpen}><Trash2 size={16}/> Konto löschen</button>
    {deleteOpen&&<form onSubmit={deleteAccount}><p>Dein Konto und private Inhalte werden dauerhaft gelöscht. Freigegebene Medienrechte und Sicherungskopien müssen gegebenenfalls zusätzlich geprüft werden.</p>
     {(security?.social_providers?.length||0)>0&&<p>Bei Anmeldung mit Google oder Apple kannst du dein Konto innerhalb von 5 Minuten nach erneutem Login auch ohne Passwort löschen.</p>}
     {(!security?.social_deletion_available||security?.requires_password)&&<label>Passwort<input type="password" autoComplete="current-password" required={!security?.social_deletion_available} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
     <label>Zur Bestätigung KONTO LÖSCHEN eingeben<input required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
     <button type="submit" disabled={busy||confirm!=='KONTO LÖSCHEN'||(!password&&!security?.social_deletion_available)}><LockKeyhole size={15}/> Konto endgültig löschen</button>
    </form>}
   </div>}
  </section>
 </main>;
}

