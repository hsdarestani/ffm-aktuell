'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';

type Kandidat={osm_id:string;name:string;category:string;address:string;website:string|null;phone:string|null;opening_hours:string|null;last_osm_check:string|null;osm_url:string;latitude:number;longitude:number;reviewed_status:string};
type Statistik={kandidaten:number;rueckfragen:number;ausgeblendet:number;apotheken:number;aktuell_geprueft:number;offen_zur_pruefung:number};
type Faellig={id:string;name:string;category:string;verified_at:string|null};
type Daten={items:Kandidat[];total:number;offset:number;limit:number};
async function anfrage(url:string,body?:unknown){
 const r=await fetch('/api/'+url,{credentials:'same-origin',cache:'no-store',method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json();
 if(!r.ok)throw Error(d.error||'Die Anfrage ist fehlgeschlagen');
 return d;
}
export default function AdminOrtpruefung({onChanged}:{onChanged:()=>void}){
 const ui=useUiText();
 const [items,setItems]=useState<Kandidat[]>([]),[stats,setStats]=useState<Statistik|null>(null),[due,setDue]=useState<Faellig[]>([]);
 const [total,setTotal]=useState(0),[page,setPage]=useState(0),[state,setState]=useState('unverified'),[search,setSearch]=useState(''),[appliedSearch,setAppliedSearch]=useState('');
 const [selected,setSelected]=useState<Kandidat|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[reason,setReason]=useState('');
 const [update,setUpdate]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  const params=new URLSearchParams({state,page:String(page),q:appliedSearch});
  Promise.all([anfrage('admin/candidates?'+params),anfrage('admin/validation')])
   .then(([list,meta]:[Daten,{stats:Statistik;recheck:Faellig[] }])=>{
     if(cancelled)return;
     setItems(list.items);setTotal(list.total);setStats(meta.stats);setDue(meta.recheck);
     setError('');
   }).catch(e=>{if(!cancelled)setError((e as Error).message)});
  return()=>{cancelled=true};
 },[state,page,appliedSearch,update]);
 const refresh=()=>{setSelected(null);setReason('');setUpdate(v=>v+1);onChanged()};
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selected||busy)return;
  const form=new FormData(e.currentTarget);
  const body={
   action:'publish',osm_id:selected.osm_id,
   verification_source:String(form.get('verification_source')||''),
   verification_method:String(form.get('verification_method')||'betreiber_webseite'),
   verification_note:String(form.get('verification_note')||''),
   confirms_existence:form.has('confirms_existence'),
   confirms_address:form.has('confirms_address'),
   confirms_operation:form.has('confirms_operation'),
   editorial_rank:Number(form.get('editorial_rank')||0),
   opening_hours_text:String(form.get('opening_hours_text')||'')
  };
  setBusy(true);setError('');setInfo('');
  try{await anfrage('admin/review-candidate',body);setInfo('Ort mit dokumentiertem Nachweis veröffentlicht. Kein Live Öffnungsstatus behauptet.');refresh();}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function decide(action:'hide'|'needs_review'){
  if(!selected||busy)return;
  if(reason.trim().length<10){setError(ui("Bitte eine Begründung mit mindestens 10 Zeichen angeben."));return}
  setBusy(true);setError('');setInfo('');
  try{await anfrage('admin/review-candidate',{action,osm_id:selected.osm_id,reason});setInfo(action==='hide'?'Eintrag ausgeblendet.':'Eintrag für weitere Prüfung vorgemerkt.');refresh();}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <div className="v4-verify-admin">
  <h2>{ui("Quellenprüfung für echte Frankfurter Orte")}</h2>
  <p>{ui("OSM Einträge sind nur Hinweise. Ein Ort wird erst nach unabhängiger Prüfung durch die Redaktion als aktiv veröffentlicht. „Jetzt geöffnet“ wird daraus ausdrücklich nicht abgeleitet.")}</p>
  {stats&&<div className="v6-validation-stats" aria-label={ui("Datenprüfung")}>
   <span><strong>{stats.kandidaten}</strong> {ui(" ungeprüfte Kandidaten")}</span>
   <span><strong>{stats.rueckfragen}</strong> {ui(" Rückfragen")}</span>
   <span><strong>{stats.aktuell_geprueft}</strong> {ui(" aktuell überprüfte Betriebe")}</span>
   <span><strong>{stats.offen_zur_pruefung}</strong> {ui(" bestehende Orte zu prüfen")}</span>
   <span><strong>{stats.apotheken}</strong> {ui(" Apotheken im OSM Bestand, nicht dienstverifiziert")}</span>
  </div>}
  {due.length>0&&<details className="v6-review-due"><summary>{ui("Bestehende Einträge ohne aktuelle Prüfung (")}{stats?.offen_zur_pruefung||due.length})</summary><p>{ui("Diese Orte bitte im Formular „Betrieb und Quellen prüfen“ unten erneut mit aktueller Quelle bestätigen.")}</p><ul>{due.map(x=><li key={x.id}>{x.name} · {x.category}</li>)}</ul></details>}
  <form onSubmit={e=>{e.preventDefault();setPage(0);setAppliedSearch(search)}} className="v6-review-search">
   <label className="form-label">{ui("Kandidaten durchsuchen")}<input value={search} onChange={e=>setSearch(e.target.value)} placeholder={ui("Name oder Adresse")}/></label>
   <button className="secondary-btn" type="submit">{ui("Suchen")}</button>
  </form>
  <div className="v6-review-tabs">
   <button type="button" className={state==='unverified'?'primary-btn small':'secondary-btn'} onClick={()=>{setState('unverified');setPage(0);setSelected(null)}}>{ui("Ungeprüft")}</button>
   <button type="button" className={state==='needs_review'?'primary-btn small':'secondary-btn'} onClick={()=>{setState('needs_review');setPage(0);setSelected(null)}}>{ui("Rückfragen")}</button>
  </div>
  <p className="subdued">{total} {ui(" Einträge in dieser Auswahl · Seite ")}{page+1}</p>
  <div className="v6-review-list">{items.map(x=><button key={x.osm_id} type="button" aria-pressed={selected?.osm_id===x.osm_id}
   className={'v6-review-item '+(selected?.osm_id===x.osm_id?'chosen':'')}
   onClick={()=>{setSelected(x);setReason('');setInfo('');setError('')}}><strong>{x.name}</strong><small>{x.category} · {x.address||ui("Adresse unvollständig")}</small><small>{x.website?ui("Webseitenangabe vorhanden"):ui("Keine Betreiberwebseite im Datensatz")}</small></button>)}</div>
  <div className="v6-review-tabs">
   <button type="button" className="secondary-btn" disabled={page===0} onClick={()=>{setPage(v=>v-1);setSelected(null)}}>{ui("Vorherige")}</button>
   <button type="button" className="secondary-btn" disabled={(page+1)*25>=total} onClick={()=>{setPage(v=>v+1);setSelected(null)}}>{ui("Nächste")}</button>
  </div>
  {selected&&<div className="v6-review-detail">
   <h3>{selected.name}</h3>
   <p>{selected.category} · {selected.address||ui("Ohne eindeutige Adresse")}</p>
   <p>{ui("OSM Öffnungszeiten: ")}{selected.opening_hours||ui("nicht vorhanden")} {ui(" · OSM Check: ")}{selected.last_osm_check||ui("unbekannt")}</p>
   <p><a target="_blank" rel="noopener noreferrer" href={selected.osm_url}>{ui("OSM Eintrag anzeigen")}</a>{selected.website&&<> · <a href={selected.website} target="_blank" rel="noopener noreferrer">{ui("Genannte Webseite prüfen")}</a></>}</p>
   <form key={selected.osm_id} onSubmit={submit}>
    <label className="form-label">{ui("Unabhängige Originalquelle (HTTPS)")}<input type="url" name="verification_source" defaultValue={selected.website?.startsWith('https://')?selected.website:''} required placeholder="https://…"/></label>
    <label className="form-label">{ui("Prüfweg")}<select name="verification_method" defaultValue="betreiber_webseite"><option value="betreiber_webseite">{ui("Offizielle Betreiberwebseite")}</option><option value="betreiber_kontakt">{ui("Betreiber persönlich kontaktiert")}</option><option value="behoerde">{ui("Offizielle Behördenseite")}</option></select></label>
    <label className="form-label">{ui("Prüfprotokoll (mindestens 25 Zeichen)")}<textarea name="verification_note" required minLength={25} maxLength={2000} placeholder={ui("Was wurde wann und von wem anhand welcher Originalquelle geprüft?")}/></label>
    <label className="form-label">{ui("Bestätigte Zeiten, optional (keine Live Garantie)")}<input name="opening_hours_text" maxLength={300} placeholder={ui("Nur nach offizieller Prüfung ergänzen")}/></label>
    <label className="form-label">{ui("Redaktionelle Priorität 0 bis 100")}<input type="number" name="editorial_rank" min={0} max={100} defaultValue={0}/></label>
    <div className="v6-review-checks">
     <label><input type="checkbox" name="confirms_existence" required/> {ui(" Existenz anhand einer unabhängigen Quelle überprüft")}</label>
     <label><input type="checkbox" name="confirms_address" required/> {ui(" Identität und Adresse stimmen überein")}</label>
     <label><input type="checkbox" name="confirms_operation" required/> {ui(" Aktuellen Betrieb ausdrücklich bestätigt, nicht nur Standort gefunden")}</label>
    </div>
    <button className="primary-btn small" disabled={busy}>{ui("Mit Nachweis freigeben")}</button>
   </form>
   <label className="form-label">{ui("Grund für Rückfrage oder Ausblendung")}<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} placeholder={ui("Warum muss dieser Eintrag weiter geprüft werden?")}/></label>
   <div className="v6-review-tabs"><button className="secondary-btn" type="button" disabled={busy} onClick={()=>void decide('needs_review')}>{ui("Rückfrage markieren")}</button><button className="secondary-btn" type="button" disabled={busy} onClick={()=>void decide('hide')}>{ui("Ausblenden")}</button></div>
  </div>}
  {error&&<p role="alert" className="v6-review-error">{ui(error)}</p>}
  {info&&<p role="status">{ui(info)}</p>}
 </div>;
}

