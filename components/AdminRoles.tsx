'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
type Role={code:string;label:string;permissions:string[]};
type Assignment={user_id:string;role_code:string;email:string;display_name:string};
const labels:Record<string,string>={editorial:'Redaktion',moderation:'Moderation',business:'Unternehmen und Support',marketing:'Werbung und Angebote',finance:'Tarife und Finanzen',operations:'Betrieb und Dienste'};
export default function AdminRoles(){
 const ui=useUiText();
 const [roles,setRoles]=useState<Role[]>([]),[assignments,setAssignments]=useState<Assignment[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/admin/roles',{cache:'no-store'});if(!r.ok)throw Error(ui("Berechtigungen konnten nicht geladen werden"));const d=await r.json();setRoles(d.roles);setAssignments(d.assignments)}
 useEffect(()=>{load().catch(e=>setMessage(e.message))},[]);
 async function send(d:object){setBusy(true);try{const r=await fetch('/api/admin/roles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const data=await r.json();if(!r.ok)throw Error(data.error);await load();setMessage(ui("Berechtigungen gespeichert. Änderungen gelten sofort für weitere Anfragen."))}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 function assign(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);void send({action:d.get('action'),code:d.get('code'),email:d.get('email'),reason:d.get('reason')})}
 return <section className="ffm-catalog-studio"><h1>{ui("Berechtigungen")}</h1><p>{ui("Hauptadministratoren bleiben unverändert. Rollen gelten sofort und können kombiniert werden. Änderungen erfordern eine Anmeldung innerhalb der letzten fünf Minuten.")}</p><p role="status">{ui(message)}</p>
 <section className="ffm-catalog-panel"><h2>{ui("Person zuordnen oder entfernen")}</h2><form className="ffm-catalog-form" onSubmit={assign}><label>{ui("Registrierte E-Mail")}<input type="email" name="email" required/></label><label>{ui("Rolle")}<select name="code">{roles.map(r=><option key={r.code} value={r.code}>{r.label}</option>)}</select></label><label>{ui("Aktion")}<select name="action"><option value="assign">{ui("Zuweisen")}</option><option value="revoke">{ui("Entziehen")}</option></select></label><label>{ui("Begründung")}<input name="reason" minLength={10} maxLength={500} required/></label><button disabled={busy}>{ui("Speichern")}</button></form>
 <ul>{assignments.map(a=><li key={a.user_id+a.role_code}>{a.display_name||a.email} · {a.email} · {roles.find(r=>r.code===a.role_code)?.label}</li>)}</ul></section>
 <div className="ffm-catalog-grid">{roles.map(role=><section className="ffm-catalog-panel" key={role.code}><h2>{role.label}</h2><form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void send({action:'role',code:role.code,label:d.get('label'),permissions:d.getAll('permissions'),reason:d.get('reason')})}}><label>{ui("Bezeichnung")}<input name="label" required defaultValue={role.label}/></label><fieldset><legend>{ui("Erlaubte Bereiche")}</legend>{Object.entries(labels).map(([code,label])=><label key={code}><input type="checkbox" name="permissions" value={code} defaultChecked={role.permissions.includes(code)}/>{ui(label)}</label>)}</fieldset><label>{ui("Begründung")}<input name="reason" minLength={10} maxLength={500} required/></label><button disabled={busy}>{ui("Rolle ändern")}</button></form></section>)}</div></section>;
}
