'use client';
import {useEffect,useState} from 'react';
type Plan={code:string;audience:string;title_de:string;monthly_price_cents:number|null;trial_days:number;legal_terms_url:string|null};
export default function PremiumTariffPreview({audience}:{audience:'user'|'business'}){
 const [plans,setPlans]=useState<Plan[]>([]);
 useEffect(()=>{let active=true;fetch('/api/plans',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(active)setPlans((d.items||[]).filter((p:Plan)=>p.audience===audience))}).catch(()=>{});return()=>{active=false}},[audience]);
 return <section className="ffm-premium-preview"><h2>{audience==='user'?'Premium':'Business Premium'}</h2>{!plans.length?<p>Tarife in Abstimmung. Zurzeit keine kostenpflichtige Buchung möglich.</p>:
  <div>{plans.map(p=><article key={p.code}><strong>{p.title_de}</strong>{p.monthly_price_cents!=null&&<span>{new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(p.monthly_price_cents/100)} / Monat</span>}
   {p.trial_days>0&&<small>Geplante Probezeit: {p.trial_days} Tage · derzeit nicht buchbar</small>}
   {p.legal_terms_url&&<a href={p.legal_terms_url} target="_blank" rel="noopener noreferrer">Vertragsbedingungen</a>}
   <p>Kein Checkout und keine automatische Freischaltung.</p></article>)}</div>}
 </section>;
}