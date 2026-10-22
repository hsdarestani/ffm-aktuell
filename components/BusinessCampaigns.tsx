'use client';
import AdBooking from '@/components/AdBooking';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
type Place={id:string;name:string;status:string};
type Campaign={id:string;title:string;copy_de:string;placement:string;start_date:string;end_date:string;status:string;place_name:string;rejection_note:string|null;orders?:{state:string;amount:number;invoice_url:string|null;snapshot:{terms_url:string}}[]|null;impressions?:number;clicks?:number};
const PLACEMENTS:[string,string][]=[['search','Gesponserte Suche'],['home','Startseite'],['feed','Beiträge'],['stories','Geschichten'],['events','Veranstaltungen'],['district','Stadtteile'],['category','Kategorien']];
export default function BusinessCampaigns({approved,places,onNotice}:{approved:boolean;places:Place[];onNotice:(message:string)=>void}){
 const [items,setItems]=useState<Campaign[]>([]),[busy,setBusy]=useState(false),[open,setOpen]=useState(false);
 const reload=useCallback(async()=>{try{const r=await fetch('/api/campaigns',{cache:'no-store'});if(!r.ok)return;const d=await r.json();setItems(d.items||[])}catch{}},[]);
 useEffect(()=>{void reload()},[reload]);
 async function action(body:object){setBusy(true);try{
  const r=await fetch('/api/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Kampagne konnte nicht gespeichert werden.');
  onNotice(d.notice||'Anfrage gespeichert');await reload();return true;
 }catch(e){onNotice(e instanceof Error?e.message:'Aktion fehlgeschlagen');return false}finally{setBusy(false)}}
 async function submitForm(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget;const d=Object.fromEntries(new FormData(form));
  const ok=await action({action:'create',title:d.title,copy_de:d.copy_de,placement:d.placement,place_id:d.place_id,start_date:d.start_date,end_date:d.end_date});
  if(ok){form.reset();setOpen(false)}
 }
 if(!approved)return null;
 const locations=places.filter(p=>p.status==='published');
 return <section className="ffm-campaign-panel" aria-label="Kampagnen">
  <header><div><h2>Werbung planen</h2><p>Erstelle einen Vorschlag. Nach Inhaltsprüfung und Preisbestätigung kannst du verbindlich buchen.</p></div>
   <button type="button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'Schließen':'Kampagne erstellen'}</button></header>
  {open&&<form className="ffm-campaign-form" onSubmit={submitForm}>
    <label>Standort<select name="place_id" required defaultValue=""><option value="">Standort auswählen</option>{locations.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Anzeigenplatz<select name="placement" required>{PLACEMENTS.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
    <label>Titel<input name="title" required minLength={4} maxLength={150} placeholder="Zum Beispiel: Herbstangebote im Café"/></label>
    <label>Werbetext<textarea name="copy_de" required minLength={10} maxLength={1500} rows={3}/></label>
    <label>Gewünschter Start<input type="date" name="start_date" required min={new Date().toISOString().slice(0,10)}/></label>
    <label>Gewünschtes Ende<input type="date" name="end_date" required min={new Date().toISOString().slice(0,10)}/></label>
    <div className="ffm-campaign-note">Die endgültigen Tarife, Zahlungsart und Freischaltung werden erst nach vertraglicher Preisfreigabe verfügbar.</div>
    <button type="submit" disabled={busy||locations.length===0}>Entwurf speichern</button>
   </form>}
   <div className="ffm-campaign-list">{items.map(c=><article key={c.id}><div><strong>{c.title}</strong><small>{PLACEMENTS.find(p=>p[0]===c.placement)?.[1]||c.placement} · {c.place_name}</small>
    <span>{c.status==='draft'?'Entwurf':c.status==='pending_review'?'Redaktion prüft':c.status==='rejected'?'Abgelehnt':c.status==='awaiting_commercial_setup'?'Inhalt geprüft':'Storniert'}</span>
    {c.rejection_note&&<p>{c.rejection_note}</p>}<AdBooking campaign={c} onNotice={onNotice} onChanged={()=>void reload()}/></div>
    {c.status==='draft'&&<button type="button" disabled={busy} onClick={()=>void action({action:'submit',id:c.id})}>Zur Prüfung</button>}
    {['draft','pending_review','awaiting_commercial_setup'].includes(c.status)&&<button type="button" className="secondary" disabled={busy} onClick={()=>void action({action:'cancel',id:c.id})}>Stornieren</button>}
   </article>)}</div>
 </section>;
}

