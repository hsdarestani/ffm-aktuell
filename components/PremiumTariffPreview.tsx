'use client';
import {useEffect,useState} from 'react';
type Plan={code:string;audience:string;title_de:string;monthly_price_cents:number|null;annual_price_cents:number|null;trial_days:number;legal_terms_url:string|null;staff_seats:number;branch_limit:number};
export default function PremiumTariffPreview({audience,businessId}:{audience:'user'|'business';businessId?:string}){
 const [plans,setPlans]=useState<Plan[]>([]),[available,setAvailable]=useState(false),[interval,setInterval]=useState<'month'|'year'>('month'),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;fetch('/api/plans',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(active){setPlans((d.items||[]).filter((p:Plan)=>p.audience===audience));setAvailable(d.checkout_available)}}).catch(()=>{});return()=>{active=false}},[audience]);
 async function checkout(code:string){setBusy(true);try{const r=await fetch('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,interval,...(businessId?{business_id:businessId}:{}),accept_terms:accepted})});const d=await r.json();if(!r.ok)throw Error(d.error);window.location.assign(d.url)}catch(e){setMessage((e as Error).message);setBusy(false)}}
 return <section className="ffm-premium-preview"><h2>{audience==='user'?'Premium':'Business Premium'}</h2>{!plans.length?<p>Tarife werden vorbereitet. Noch keine kostenpflichtige Buchung möglich.</p>:<>
 <label>Laufzeit <select value={interval} onChange={e=>setInterval(e.target.value as 'month'|'year')}><option value="month">Monatlich</option><option value="year">Jährlich</option></select></label>
 <div>{plans.map(p=>{const amount=interval==='year'?p.annual_price_cents:p.monthly_price_cents;return <article key={p.code}><strong>{p.title_de}</strong>{amount!=null&&<span>{new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(amount/100)} / {interval==='year'?'Jahr':'Monat'} inklusive anfallender Steuern</span>}
 {p.trial_days>0&&<small>{p.trial_days} Tage Probezeit bei erstmaliger Berechtigung. Danach automatische Verlängerung zum ausgewählten Preis.</small>}
 {audience==='business'&&<p>{p.staff_seats} Mitarbeiterplätze · bis zu {p.branch_limit} Standorte</p>}
 {p.legal_terms_url&&<a href={p.legal_terms_url} target="_blank" rel="noopener noreferrer">Vertragsbedingungen</a>}
 <button type="button" disabled={busy||!available||!accepted||amount==null} onClick={()=>void checkout(p.code)}>Zur verbindlichen Buchung</button></article>})}</div>
 <label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Vertragsbedingungen des gewählten Tarifs und wiederkehrende Zahlung akzeptieren</label>
 {!available&&<p>Zahlungsdienst noch nicht eingerichtet. Es wird nichts berechnet.</p>}<p role="status">{message}</p></>}
 </section>;
}
