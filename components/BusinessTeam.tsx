'use client';
import {useEffect,useState,type FormEvent} from 'react';
type Member={user_id:string;email:string;display_name:string;role:'viewer'|'editor';all_places:boolean;place_ids:string[]};
type Invite={id:string;invite_email:string;role:'viewer'|'editor';expires_at:string};
type Data={business:{id:string;name:string;team_seat_limit:number}|null;members:Member[];invites:Invite[];places:{id:string;name:string}[];mail_enabled:boolean};
export default function BusinessTeam({approved,onNotice}:{approved:boolean;onNotice:(text:string)=>void}){
 const [info,setInfo]=useState<Data|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/business/team',{cache:'no-store'});if(!r.ok)throw Error('Team konnte nicht geladen werden');setInfo(await r.json())}catch(e){onNotice(e instanceof Error?e.message:'Team nicht erreichbar')}}
 useEffect(()=>{void load()},[]);
 async function action(body:object){setBusy(true);try{const r=await fetch('/api/business/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Aktion fehlgeschlagen');onNotice(d.notice||'Team aktualisiert');await load();return true}catch(e){onNotice(e instanceof Error?e.message:'Aktion fehlgeschlagen');return false}finally{setBusy(false)}}
 async function invite(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const d=Object.fromEntries(new FormData(form));if(await action({action:'invite',email:d.email,role:d.role,all_places:d.all_places==='on',place_ids:new FormData(form).getAll('place_ids')})){form.reset();setOpen(false)}}
 if(!approved||!info?.business)return null;
 const used=info.members.length+info.invites.length,limit=info.business.team_seat_limit;
 return <section className="ffm-team-section" aria-label="Mitarbeiterverwaltung">
  <header><div><h2>Team</h2><p>Mitarbeiter mit eingeschränkten Rechten. Einladungen nur an bestätigte E-Mail-Adressen.</p></div>
   <button type="button" disabled={!info.mail_enabled||used>=limit||busy} onClick={()=>setOpen(x=>!x)}>{open?'Schließen':'Mitarbeiter einladen'}</button></header>
  <p className="ffm-team-note">{used} von {limit} freigegebenen Plätzen (offene Einladungen zählen mit).</p>
  {limit===0&&<p>Mitarbeiterplätze sind noch nicht freigeschaltet. Erst nach Zustimmung zu den Unternehmensbedingungen im Adminbereich verfügbar.</p>}
  {limit>0&&!info.mail_enabled&&<p>Einladungen sind erst möglich, wenn der E-Mail-Versand auf dem Server eingerichtet ist.</p>}
  {open&&<form onSubmit={invite} className="ffm-team-invite"><label>E-Mail<input name="email" type="email" maxLength={254} required placeholder="mitarbeiter@beispiel.de"/></label><label>Zugriff<select name="role"><option value="viewer">Nur ansehen</option><option value="editor">Standortänderungen vorschlagen</option></select></label><label><input type="checkbox" name="all_places" defaultChecked/> Alle Standorte, einschließlich künftiger</label><fieldset><legend>Oder ausgewählte Standorte</legend>{info.places?.map(p=><label key={p.id}><input type="checkbox" name="place_ids" value={p.id}/>{p.name}</label>)}</fieldset><button type="submit" disabled={busy}>Einladung senden</button></form>}
  <div className="ffm-team-rows">
   {info.members.map(m=><div key={m.user_id}><span><strong>{m.display_name||m.email}</strong><small>{m.email} · aktiv</small></span><select disabled={busy} aria-label={'Rolle von '+m.email} value={m.role} onChange={e=>void action({action:'role',user_id:m.user_id,role:e.target.value})}><option value="viewer">Ansehen</option><option value="editor">Bearbeiten</option></select><TeamScope key={m.user_id+String(m.all_places)+m.place_ids.join()} member={m} places={info.places||[]} busy={busy} onSave={action}/><button type="button" disabled={busy} onClick={()=>{if(window.confirm('Zugang wirklich entziehen?'))void action({action:'remove',user_id:m.user_id})}}>Entfernen</button></div>)}
   {info.invites.map(i=><div key={i.id}><span><strong>{i.invite_email}</strong><small>Einladung offen bis {new Date(i.expires_at).toLocaleDateString('de-DE')} · {i.role==='editor'?'Bearbeiten':'Ansehen'}</small></span><button type="button" disabled={busy} onClick={()=>void action({action:'revoke',id:i.id})}>Einladung widerrufen</button></div>)}
  </div>
 </section>;
}


function TeamScope({member,places,busy,onSave}:{member:Member;places:{id:string;name:string}[];busy:boolean;onSave:(body:object)=>Promise<boolean>}){
 const [all,setAll]=useState(member.all_places),[ids,setIds]=useState(member.place_ids);
 return <details><summary>{member.all_places?'Alle Standorte':member.place_ids.length+' Standorte'}</summary><label><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Alle Standorte, auch künftige</label>{!all&&places.map(p=><label key={p.id}><input type="checkbox" checked={ids.includes(p.id)} onChange={e=>setIds(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))}/>{p.name}</label>)}<button type="button" disabled={busy||!all&&!ids.length} onClick={()=>void onSave({action:'scope',user_id:member.user_id,all_places:all,place_ids:ids})}>Standorte speichern</button></details>;
}
