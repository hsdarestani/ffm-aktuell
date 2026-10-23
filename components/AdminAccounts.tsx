'use client';
import {useUiText} from '@/lib/ui-locale';
import {useState,type FormEvent} from 'react';
type Account={id:string;email:string;display_name:string;suspended_at:string|null;suspension_reason:string|null};
export default function AdminAccounts(){
 const ui=useUiText();
 const [search,setSearch]=useState(''),[items,setItems]=useState<Account[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function lookup(e?:FormEvent){e?.preventDefault();setBusy(true);try{const r=await fetch('/api/admin/accounts?q='+encodeURIComponent(search),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items);setNotice(d.items.length?'':ui("Kein veränderbares Konto gefunden."))}catch(e){setNotice(e instanceof Error?e.message:ui("Suche fehlgeschlagen"))}finally{setBusy(false)}}
 async function change(account:Account){
  if(!window.confirm(account.suspended_at?ui("Sperre aufheben? Eine neue Anmeldung ist erforderlich."):ui("Konto sperren und alle Sitzungen beenden?")))return;
  setBusy(true);try{const r=await fetch('/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:account.id,action:account.suspended_at?'restore':'suspend',reason})});const d=await r.json();if(!r.ok)throw Error(d.error);await lookup();setReason('');setNotice(ui("Kontostatus gespeichert. Alle bisherigen Sitzungen sind beendet."))}catch(e){setNotice(e instanceof Error?e.message:ui("Änderung fehlgeschlagen"))}finally{setBusy(false)}
 }
 return <section className="ffm-admin-accounts"><h1>{ui("Konten verwalten")}</h1><p>{ui("Suche mit vollständiger Mailadresse oder Konto ID. Eine Sperre beendet den Zugriff sofort. Beiträge werden separat moderiert; Wiederherstellen erfordert eine neue Anmeldung.")}</p><form className="ffm-admin-account-search" onSubmit={lookup}><label>{ui("Konto")}<input value={search} onChange={e=>setSearch(e.target.value)} required minLength={3} maxLength={254}/></label><button type="submit" disabled={busy}>{ui(busy?"Wird geladen …":"Suchen")}</button></form>{notice&&<p className="ffm-admin-feedback" role="status">{ui(notice)}</p>}{items.map(a=><article key={a.id}><h3>{a.display_name||a.email}</h3><p>{a.email} · {a.suspended_at?ui("Gesperrt"):ui("Aktiv")}</p>{a.suspension_reason&&<p>{a.suspension_reason}</p>}<label>{ui("Begründung")}<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={500}/></label><button disabled={busy||reason.trim().length<10} onClick={()=>void change(a)}>{a.suspended_at?ui("Sperre aufheben"):ui("Konto sperren")}</button></article>)}</section>;
}
