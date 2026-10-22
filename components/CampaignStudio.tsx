'use client';
import {useUiText} from '@/lib/ui-locale';
import {useCallback,useEffect,useState} from 'react';
type Campaign={id:string;title:string;copy_de:string;placement:string;start_date:string;end_date:string;status:string;business_name:string;place_name:string;rejection_note:string|null};
export default function CampaignStudio({onNotice}:{onNotice:(message:string,success:boolean)=>void}){
 const ui=useUiText();
 const [items,setItems]=useState<Campaign[]>([]),[busy,setBusy]=useState(false),[reason,setReason]=useState('');
 const refresh=useCallback(async()=>{try{const r=await fetch('/api/admin/campaigns',{cache:'no-store'});if(!r.ok)throw Error(ui("Nicht berechtigt"));const d=await r.json();setItems(d.items||[])}catch(e){onNotice(e instanceof Error?e.message:ui("Daten nicht verfügbar"),false)}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 async function review(id:string,approve:boolean,stop=false){
  setBusy(true);try{const r=await fetch('/api/admin/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,approve,note:reason,...(stop?{action:'stop'}:{})})});
   const d=await r.json();if(!r.ok)throw Error(d.error||ui("Prüfung fehlgeschlagen"));
   onNotice(d.notice||ui("Bearbeitet"),true);setReason('');await refresh();
  }catch(e){onNotice(e instanceof Error?e.message:ui("Prüfung fehlgeschlagen"),false)}finally{setBusy(false)}
 }
 return <div className="ffm-campaign-studio">
  <div className="ffm-studio-page-heading"><div><h1>{ui("Werbung")}<span>.</span></h1><p>{ui("Inhalte prüfen. Nur bezahlte, freigegebene Buchungen werden im vereinbarten Zeitraum als Werbung angezeigt.")}</p></div></div>
  <p className="ffm-campaign-note">{ui("Eine redaktionelle Freigabe veröffentlicht keine Anzeige und belastet keine Zahlungsmethode.")}</p>
  <section className="ffm-campaign-review">{items.length===0?<p>{ui("Keine Kampagnen vorhanden.")}</p>:items.map(c=><article key={c.id}><div className="ffm-campaign-meta"><strong>{c.title}</strong><small>{c.business_name} · {c.place_name} · {c.placement}</small><small>{String(c.start_date).slice(0,10)} {ui(" bis ")}{String(c.end_date).slice(0,10)}</small><p>{c.copy_de}</p><span>{c.status}</span>{c.rejection_note&&<p>{c.rejection_note}</p>}</div>
   {c.status==='pending_review'&&<div className="ffm-campaign-review-actions"><button disabled={busy} onClick={()=>void review(c.id,true)}>{ui("Inhalt freigeben")}</button>
    <label>{ui("Ablehnungsgrund")}<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={1200} rows={2}/></label>
    <button type="button" className="danger" disabled={busy||reason.trim().length<10} onClick={()=>void review(c.id,false)}>{ui("Ablehnen")}</button></div>}{c.status==='awaiting_commercial_setup'&&<div><label>{ui("Grund für Ausspielungsstopp")}<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={1200}/></label><button disabled={busy||reason.trim().length<10} onClick={()=>void review(c.id,false,true)}>{ui("Ausspielung stoppen")}</button></div>}</article>)}</section>
 </div>;
}

