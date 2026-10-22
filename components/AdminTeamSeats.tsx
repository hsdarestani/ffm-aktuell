'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
type B={id:string;name:string;team_seat_limit:number;used_seats:number;status:string};
export default function AdminTeamSeats({onNotice}:{onNotice:(message:string,success:boolean)=>void}){
 const ui=useUiText();
 const [items,setItems]=useState<B[]>([]),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/admin/business-seats',{cache:'no-store'});if(!r.ok)throw Error(ui("Keine Berechtigung"));const d=await r.json();setItems(d.items||[])}catch(e){onNotice(e instanceof Error?e.message:ui("Mitarbeiterkontingente nicht verfügbar"),false)}}
 useEffect(()=>{void load()},[]);
 async function save(business_id:string,e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget),reason=String(f.get('reason')||'').trim(),seats=Number(f.get('seats'));
  if(!window.confirm(ui("Bestätigen: Die vertraglich freigegebene Anzahl Plätze dokumentieren?")))return;
  setBusy(true);try{const r=await fetch('/api/admin/business-seats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business_id,seats,reason,terms_approved:f.get('terms_approved')==='on'})});const d=await r.json();if(!r.ok)throw Error(d.error||ui("Fehler"));onNotice(ui("Mitarbeiterkontingent protokolliert."),true);await load()}catch(e){onNotice(e instanceof Error?e.message:ui("Änderung fehlgeschlagen"),false)}finally{setBusy(false)}
 }
 return <section className="ffm-team-admin"><h1>{ui("Mitarbeiterplätze")}</h1><p>{ui("Nur nach geprüfter vertraglicher Freigabe. Keine automatische Buchung oder Belastung.")}</p>
  {!items.length&&<p className="ffm-admin-empty">{ui("Keine Unternehmen vorhanden.")}</p>}{items.map(b=><form key={b.id} onSubmit={e=>void save(b.id,e)}><strong>{b.name}</strong><small>{ui("Aktiv: ")}{b.used_seats} {ui(" · Kontingent: ")}{b.team_seat_limit}</small>
    <label>{ui("Plätze")}<input type="number" min={b.used_seats} max={50} name="seats" defaultValue={b.team_seat_limit} required/></label>
    <label>{ui("Begründung und Freigabequelle")}<textarea name="reason" rows={2} minLength={20} maxLength={700} placeholder={ui("Datum, interne Freigabe und vertraglicher Nachweis")} required/></label>
    <label className="ffm-team-consent"><input type="checkbox" name="terms_approved" required/> {ui(" Bedingungen und Berechtigung sind tatsächlich genehmigt")}</label>
    <button type="submit" disabled={busy}>{ui("Kontingent speichern")}</button></form>)}
 </section>;
}

