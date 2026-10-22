'use client';
import {useUiText} from '@/lib/ui-locale';
import {adPaymentLabels} from '@/lib/ad-labels';
import {useEffect,useState} from 'react';
type Rate={placement:string;daily_cents:number;terms_url:string;approved:boolean};
type Order={state:string;amount:number;invoice_url:string|null;snapshot:{terms_url:string}};
export default function AdBooking({campaign,onNotice,onChanged}:{campaign:{id:string;placement:string;start_date:string;end_date:string;status:string;orders?:Order[]|null;impressions?:number;clicks?:number};onNotice:(s:string)=>void;onChanged:()=>void}){
 const ui=useUiText();
 const [rate,setRate]=useState<Rate|null>(null),[accept,setAccept]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{const ctl=new AbortController();fetch('/api/ad-rates',{cache:'no-store',signal:ctl.signal}).then(r=>r.json()).then(d=>setRate((d.items||[]).find((r:Rate)=>r.placement===campaign.placement)||null)).catch(()=>{});return()=>ctl.abort()},[campaign.placement]);
 const paid=campaign.orders?.find(o=>o.state==='paid'),last=campaign.orders?.[campaign.orders.length-1];
 const days=(Date.parse(campaign.end_date.slice(0,10))-Date.parse(campaign.start_date.slice(0,10)))/86400000+1,amount=rate?rate.daily_cents*days:0;
 async function act(stop=false){setBusy(true);try{const r=await fetch('/api/ad-booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaign_id:campaign.id,action:stop?'stop':'checkout',accept_terms:accept,amount})}),d=await r.json();if(!r.ok)throw Error(d.error);if(d.url){const url=new URL(d.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw Error(ui("Zahlungslink ungültig"));window.location.assign(url.href)}else{onNotice(d.notice);onChanged()}}catch(e){onNotice(e instanceof Error?e.message:ui("Buchung fehlgeschlagen"))}finally{setBusy(false)}}
 return <div className="ffm-ad-booking">{paid?<p>{ui("Bezahlt: ")}{(paid.amount/100).toLocaleString((ui.locale==='de'?'de-DE':'en-GB'),{style:'currency',currency:'EUR'})}{ui(". Ausspielung nur im gebuchten Zeitraum.")}</p>:last&&<p>{ui("Zahlung: ")}{ui(adPaymentLabels[last.state]||last.state)}</p>}{(paid||last)?.invoice_url&&<a href={(paid||last)!.invoice_url!} target="_blank" rel="noopener noreferrer">{ui("Rechnung beim Zahlungsdienst")}</a>}
 <p>{campaign.impressions||0} {ui(" sichtbare Anzeigen · ")}{campaign.clicks||0} {ui(" Klicks. Technische Zählung, keine Anzahl einzelner Personen.")}</p>
 {campaign.status==='awaiting_commercial_setup'&&<>{!paid&&rate?.approved&&<><p>{days} {ui(" Tage · ")}{(amount/100).toLocaleString((ui.locale==='de'?'de-DE':'en-GB'),{style:'currency',currency:'EUR'})} {ui(" gesamt einschließlich Umsatzsteuer. Keine garantierte Reichweite.")}</p><label><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/> {ui(" Preis und ")}<a href={rate.terms_url} target="_blank" rel="noopener noreferrer">{ui("Werbebedingungen")}</a> {ui(" bestätigen")}</label><button disabled={busy||!accept} onClick={()=>void act()}>{ui("Verbindlich buchen")}</button></>}{!paid&&!rate?.approved&&<p>{ui("Werbetarif noch nicht freigegeben.")}</p>}<button disabled={busy} onClick={()=>void act(true)}>{ui("Ausspielung stoppen")}</button></>}
 </div>;
}
