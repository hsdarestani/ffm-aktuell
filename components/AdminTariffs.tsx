'use client';
import AdRates from '@/components/AdRates';
import FinanceLedger from '@/components/FinanceLedger';
import {useEffect,useState,type FormEvent} from 'react';
type Plan={staff_seats:number;branch_limit:number;code:string;title_de:string;title_en:string;features:string[];monthly_price_cents:number|null;annual_price_cents:number|null;trial_days:number;status:string;legal_terms_url:string|null};
const features:{id:string;label:string}[]=[{id:'extended_profile',label:'Erweitertes Profil'},{id:'stories',label:'Stories'},{id:'analytics',label:'Statistik'},{id:'campaign_tools',label:'Werbung'},{id:'additional_staff',label:'Mitarbeiter'},{id:'exclusive_deals',label:'Exklusive Angebote'},{id:'personalized_discovery',label:'Personalisierung'},{id:'saved_tours',label:'Touren'},{id:'priority_support',label:'Support'}];
export default function AdminTariffs({onNotice}:{onNotice:(msg:string,success:boolean)=>void}){
 const [plans,setPlans]=useState<Plan[]>([]),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/plans?all=1',{cache:'no-store'});if(!r.ok)throw Error('Tarife nicht erreichbar');setPlans((await r.json()).items||[])}catch{onNotice('Tarifdaten nicht erreichbar',false)}}
 useEffect(()=>{void load()},[]);
 async function send(body:object){setBusy(true);try{const r=await fetch('/api/admin/plans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Aktion fehlgeschlagen');onNotice('Tarif gespeichert. Bestehende Abos behalten ihre vereinbarten Leistungen bis zu einem Tarifwechsel.',true);await load()}catch(e){onNotice(e instanceof Error?e.message:'Aktion fehlgeschlagen',false)}finally{setBusy(false)}}
 function save(e:FormEvent<HTMLFormElement>,code:string){e.preventDefault();const d=new FormData(e.currentTarget);const price=(key:string)=>{const v=String(d.get(key)||'').trim();return v===''?null:Math.round(Number(v)*100)};
  void send({action:'save',code,title_de:String(d.get('title_de')||''),title_en:String(d.get('title_en')||''),monthly_price_cents:price('month'),annual_price_cents:price('year'),trial_days:Number(d.get('trial_days')),staff_seats:Number(d.get('staff_seats')),branch_limit:Number(d.get('branch_limit')),features:d.getAll('features'),legal_terms_url:String(d.get('legal_terms_url')||'')})}
 function approve(e:FormEvent<HTMLFormElement>,code:string){e.preventDefault();const d=new FormData(e.currentTarget);if(!window.confirm('Diesen Tarif mit Preis und Vertragsbedingungen für die Buchung freigeben?'))return;
  void send({action:'approve',code,approval_note:String(d.get('approval_note')||''),explicit_price_approval:d.get('approved')==='on'})}
 return <section className="ffm-tariffs"><h1>Tarife</h1><p>Preise und Leistungen sind veränderbar. Zur Buchung erst nach Prüfung der Vertragsbedingungen freigeben. Zahlungen benötigen einen eingerichteten Zahlungsdienst.</p>
  <div className="ffm-tariffs-list">{plans.map(p=><article key={p.code}><h2>{p.title_de}</h2><p>{p.status==='draft'?'Entwurf · nicht öffentlich':'Für Buchung freigegeben'}</p>
   <form key={p.code+String(p.monthly_price_cents)} onSubmit={e=>save(e,p.code)}>
    <label>Deutsch<input name="title_de" defaultValue={p.title_de} maxLength={100} required/></label>
    <label>Englisch<input name="title_en" defaultValue={p.title_en} maxLength={100} required/></label>
    <label>Monat EUR<input name="month" type="number" min=".01" step=".01" defaultValue={p.monthly_price_cents!=null?(p.monthly_price_cents/100).toFixed(2):''}/></label>
    <label>Jahr EUR<input name="year" type="number" min=".01" step=".01" defaultValue={p.annual_price_cents!=null?(p.annual_price_cents/100).toFixed(2):''}/></label>
    <label>Probezeit<input name="trial_days" type="number" min={0} max={30} defaultValue={p.trial_days}/></label>
    <label>Mitarbeiterplätze<input name="staff_seats" type="number" min={0} max={50} defaultValue={p.staff_seats}/></label><label>Standortlimit<input name="branch_limit" type="number" min={1} max={100} defaultValue={p.branch_limit}/></label>
    <label>Vertragslink<input name="legal_terms_url" type="url" defaultValue={p.legal_terms_url||''}/></label>
    <fieldset><legend>Enthaltene Merkmale</legend>{features.map(v=><label key={v.id}><input type="checkbox" name="features" value={v.id} defaultChecked={p.features.includes(v.id)}/>{v.label}</label>)}</fieldset>
    <button type="submit" disabled={busy}>Entwurf speichern</button>
   </form>
   {p.status==='draft'?<form onSubmit={e=>approve(e,p.code)}>
    <label>Grundlage der Freigabe<textarea name="approval_note" rows={2} minLength={25} maxLength={1000} required/></label>
    <label><input type="checkbox" name="approved" required/> Preis und Vertragsbedingungen geprüft</label>
    <button type="submit" disabled={busy}>Zur Buchung freigeben</button></form>:
    <button disabled={busy} type="button" onClick={()=>void send({action:'withdraw',code:p.code})}>Veröffentlichung zurückziehen</button>}
  </article>)}</div><AdRates/><FinanceLedger/>
 </section>;
}

