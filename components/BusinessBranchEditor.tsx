'use client';
import {useState,type FormEvent} from 'react';
import {Building2,CheckCircle2,ChevronDown,Clock3,Edit3,MapPin,Send} from 'lucide-react';
type Place={id:string;name:string;address:string;website:string|null;phone?:string|null;opening_hours_text?:string|null;verification_status?:string;status:string};
type Change={id:string;place_id:string;status:'pending'|'approved'|'rejected';submitted_at:string;editor_note:string};
type Props={places:Place[];changes:Change[];businessStatus:string;onNotice:(message:string)=>void;onChanged:()=>void};
export default function BusinessBranchEditor({places,changes,businessStatus,onNotice,onChanged}:Props){
 const [busy,setBusy]=useState(false);
 if(!places.length)return <section className="ffm-branch-panel">
  <div className="ffm-branch-title"><MapPin size={19}/><h2>Deine Standorte</h2></div>
  <p>Noch kein Standort mit deinem Unternehmen verbunden. Bitte zuerst einen Eintrag beanspruchen und prüfen lassen.</p>
 </section>;
 const submit=async(e:FormEvent<HTMLFormElement>,place:Place)=>{
  e.preventDefault();if(busy)return;
  const f=new FormData(e.currentTarget);const val=(k:string)=>String(f.get(k)||'').trim();
  setBusy(true);try{
   const response=await fetch('/api/business/places/change',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({place_id:place.id,name:val('name'),address:val('address'),phone:val('phone'),
      website:val('website'),opening_hours_text:val('opening_hours_text')})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Anfrage fehlgeschlagen');
   onNotice('Änderungen zur Prüfung eingereicht. Bis zur Freigabe bleibt der bisherige Eintrag sichtbar.');
   onChanged();
  }catch{onNotice('Änderung konnte nicht gespeichert werden. Bitte Angaben prüfen.')}
  finally{setBusy(false)}
 };
 return <section className="ffm-branch-panel">
  <div className="ffm-branch-title"><Building2 size={19}/><h2>Deine Standorte</h2><span>{places.length}</span></div>
  <p className="ffm-branch-intro">Kontaktdaten und Öffnungszeiten selbst korrigieren. Die Redaktion prüft jede Änderung vor der Veröffentlichung.</p>
  {places.map(p=>{
    const pending=changes.find(c=>c.place_id===p.id&&c.status==='pending');
    const latest=changes.find(c=>c.place_id===p.id);
    return <details className="ffm-branch-item" key={p.id}>
     <summary><span className="ffm-branch-icon"><MapPin size={18}/></span>
      <span className="ffm-branch-info"><strong>{p.name}</strong><small>{p.address||'Adresse fehlt'} · {pending?'Prüfung offen':p.verification_status==='verified'?'Geprüft':'Ungeprüft'}</small></span><ChevronDown size={18}/>
     </summary>
     <div className="ffm-branch-form">
      {pending&&<p className="ffm-branch-pending"><Clock3 size={15}/> Ein Änderungsantrag wartet auf Prüfung. Neue Eingaben ersetzen deinen offenen Antrag.</p>}
      {!pending&&latest?.status==='approved'&&<p className="ffm-branch-approved"><CheckCircle2 size={15}/> Letzte Änderung übernommen. Betriebsstatus bitte separat prüfen.</p>}
      {latest?.status==='rejected'&&<p className="ffm-branch-pending">Letzte Änderung abgelehnt. {latest.editor_note||''}</p>}
      <form key={p.id+latest?.submitted_at} onSubmit={e=>void submit(e,p)}>
       <label>Name des Standorts<input name="name" defaultValue={p.name} minLength={2} maxLength={150} required/></label>
       <label>Adresse<input name="address" defaultValue={p.address||''} maxLength={200}/></label>
       <label>Telefon<input name="phone" type="tel" defaultValue={p.phone||''} maxLength={40} placeholder="+49 ..."/></label>
       <label>Website<input name="website" type="url" defaultValue={p.website||''} maxLength={1000} placeholder="https://"/></label>
       <label>Öffnungszeiten <small>Bitte keine Zeiten erfinden</small><textarea name="opening_hours_text" defaultValue={p.opening_hours_text||''} maxLength={300} rows={2} placeholder="Mo bis Fr 10:00 bis 18:00"/></label>
       <button type="submit" disabled={busy||businessStatus!=='approved'}><Send size={15}/>{pending?'Antrag aktualisieren':'Zur Prüfung senden'}</button>
      </form>
      {businessStatus!=='approved'&&<p>Die Verwaltung wird nach Prüfung deines Unternehmens freigeschaltet.</p>}
     </div>
    </details>;
  })}
 </section>;
}
