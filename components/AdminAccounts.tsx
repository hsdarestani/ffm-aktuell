'use client';
import {useState,type FormEvent} from 'react';
type Account={id:string;email:string;display_name:string;suspended_at:string|null;suspension_reason:string|null};
export default function AdminAccounts(){
 const [search,setSearch]=useState(''),[items,setItems]=useState<Account[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function lookup(e?:FormEvent){e?.preventDefault();setBusy(true);try{const r=await fetch('/api/admin/accounts?q='+encodeURIComponent(search),{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items);setNotice(d.items.length?'':'Kein veränderbares Konto gefunden.')}catch(e){setNotice(e instanceof Error?e.message:'Suche fehlgeschlagen')}finally{setBusy(false)}}
 async function change(account:Account){
  if(!window.confirm(account.suspended_at?'Sperre aufheben? Eine neue Anmeldung ist erforderlich.':'Konto sperren und alle Sitzungen beenden?'))return;
  setBusy(true);try{const r=await fetch('/api/admin/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:account.id,action:account.suspended_at?'restore':'suspend',reason})});const d=await r.json();if(!r.ok)throw Error(d.error);await lookup();setReason('');setNotice('Kontostatus gespeichert. Alle bisherigen Sitzungen sind beendet.')}catch(e){setNotice(e instanceof Error?e.message:'Änderung fehlgeschlagen')}finally{setBusy(false)}
 }
 return <section className="panel"><h2>Konten verwalten</h2><p>Suche mit vollständiger Mailadresse oder Konto ID. Eine Sperre beendet den Zugriff sofort. Beiträge werden separat moderiert; Wiederherstellen erfordert eine neue Anmeldung.</p><form onSubmit={lookup}><label>Konto<input value={search} onChange={e=>setSearch(e.target.value)} required minLength={3} maxLength={254}/></label><button disabled={busy}>Suchen</button></form><p role="status">{notice}</p>{items.map(a=><article key={a.id}><h3>{a.display_name||a.email}</h3><p>{a.email} · {a.suspended_at?'Gesperrt':'Aktiv'}</p>{a.suspension_reason&&<p>{a.suspension_reason}</p>}<label>Begründung<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={500}/></label><button disabled={busy||reason.trim().length<10} onClick={()=>void change(a)}>{a.suspended_at?'Sperre aufheben':'Konto sperren'}</button></article>)}</section>;
}
