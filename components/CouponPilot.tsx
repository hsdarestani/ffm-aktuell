'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
import {CheckCircle2,Copy,Gift,ShieldCheck,Ticket,Wallet} from 'lucide-react';

type Deal={id:string;title:string;details:string;business_name:string;premium_only?:boolean;demo?:true};
type Coupon={id:string;deal_id:string;code:string;title:string;business_name:string;available:boolean;redeemed_at:string|null;valid_until:string|null};
type Notice=(message:string)=>void;
async function req(path:string,data?:unknown){
 const r=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',
  method:data===undefined?'GET':'POST',headers:data===undefined?undefined:{'Content-Type':'application/json'},
  body:data===undefined?undefined:JSON.stringify(data)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;
}
export function DealActions({deal,loggedIn,onLogin,onNotice}:{deal:Deal;loggedIn:boolean;onLogin:()=>void;onNotice:Notice}){
 const ui=useUiText();
 const [code,setCode]=useState<string|null>(null),[used,setUsed]=useState(false),[busy,setBusy]=useState(false);
 const claim=async()=>{
  if(!loggedIn){onLogin();return}
  if(busy)return;setBusy(true);
  try{const d=await req('coupons/claim',{deal_id:deal.id});setCode(d.code);setUsed(d.redeemed);onNotice(ui("Dein Gutscheincode ist in Mein Profil gespeichert."))}
  catch{onNotice(ui("Gutschein nicht verfügbar. Bitte die Angebotsbedingungen prüfen."))}
  finally{setBusy(false)}
 };
 if(deal.demo)return null;
 return <div className="ffm-coupon-action">
  {!code?<button type="button" onClick={()=>void claim()} disabled={busy}><Ticket size={16}/> {ui(" Gutschein sichern")}</button>:
   <div className="ffm-coupon-code"><span>{used?ui("Bereits eingelöst"):ui("Dein Code")}</span><strong>{code}</strong><button type="button" onClick={()=>void navigator.clipboard.writeText(code).then(()=>onNotice(ui("Code kopiert."))).catch(()=>onNotice(ui("Code bitte manuell kopieren.")))}><Copy size={14}/> {ui(" Kopieren")}</button></div>}
  {deal.premium_only&&<small>{ui("Exklusiv mit aktivem persönlichem Premium. Auch bei der Einlösung erforderlich.")}</small>}
  <small>{ui("Einmal pro Person. Nur vor Ort vom Anbieter einlösbar. Kein Kauf.")}</small>
 </div>;
}
export function CouponWallet({onNotice}:{onNotice:Notice}){
 const ui=useUiText();
 const [items,setItems]=useState<Coupon[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  req('coupons').then(data=>{if(active)setItems(data.items||[])}).catch(()=>{if(active)onNotice(ui("Gutscheine konnten nicht geladen werden."))})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 return <section className="ffm-coupon-wallet"><div className="ffm-coupon-heading"><Wallet size={18}/><h2>{ui("Meine Gutscheine")}</h2></div>
  {loading?<p>{ui("Gutscheine werden geladen …")}</p>:!items.length?<p>{ui("Noch keine Gutscheine. Entdecke Angebote und sichere deinen Code.")}</p>:
   <div>{items.map(c=><article className="ffm-coupon-wallet-row" key={c.id}>
    <div><strong>{c.title}</strong><small>{c.business_name} · {c.redeemed_at?ui("Eingelöst"):!c.available?ui("Nicht mehr verfügbar"):ui("Einlösbar")}</small></div>
    <code>{c.code}</code>
    <button type="button" aria-label={ui("Code kopieren für ")+c.title} onClick={()=>void navigator.clipboard.writeText(c.code).then(()=>onNotice(ui("Code kopiert."))).catch(()=>onNotice(ui("Code bitte manuell kopieren.")))}><Copy size={15}/></button>
   </article>)}</div>}
 </section>;
}
export function BusinessCouponRedeem({status,onNotice}:{status:string;onNotice:Notice}){
 const ui=useUiText();
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState<string|null>(null);
 const redeem=async(e:FormEvent)=>{
  e.preventDefault();if(busy||status!=='approved')return;
  if(!window.confirm(ui("Gutschein wirklich als eingelöst markieren?")))return;
  setBusy(true);setConfirmed(null);
  try{
   const d=await req('business/coupons/redeem',{code:code.trim()});
   setCode('');setConfirmed(d.title);onNotice(ui("Gutschein erfolgreich eingelöst."));
  }catch{onNotice(ui("Code ungültig, abgelaufen, bereits eingelöst oder gehört zu einem anderen Unternehmen."))}
  finally{setBusy(false)}
 };
 return <section className="ffm-coupon-business">
  <div className="ffm-coupon-heading"><ShieldCheck size={18}/><h2>{ui("Gutschein einlösen")}</h2></div>
  <p>{ui("Gutscheincode des Kunden eingeben. Jeder Code funktioniert nur einmal. Keine Zahlungsbuchung.")}</p>
  <form onSubmit={redeem}><label>{ui("Gutscheincode")}<input autoComplete="off" required minLength={24} maxLength={24} value={code} onChange={e=>setCode(e.target.value)} placeholder={ui("Code eingeben")}/></label>
   <button type="submit" disabled={busy||status!=='approved'||code.trim().length!==24}><Gift size={16}/> {ui(" Einlösen")}</button>
  </form>
  {confirmed&&<p className="ffm-coupon-success"><CheckCircle2 size={16}/> {confirmed} {ui(" wurde eingelöst.")}</p>}
  {status!=='approved'&&<p>{ui("Nach der Verifizierung des Unternehmens verfügbar.")}</p>}
 </section>;
}

