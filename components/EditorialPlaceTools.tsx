'use client';
import {useEffect,useState,type FormEvent} from 'react';
type Place={id:string;name:string;district:string};
/** Only previously independently verified places may be linked to an event pin. */
export function VerifiedPlacePicker(){
 const [items,setItems]=useState<Place[]>([]);
 useEffect(()=>{let on=true;fetch('/api/places?mode=verified',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(on)setItems(d.items||[])}).catch(()=>{});return()=>{on=false}},[]);
 return <><select name="place_id" defaultValue=""><option value="">Kein Kartenpin / keine geprüfte Zuordnung</option>{items.map(p=><option key={p.id} value={p.id}>{p.name} · {p.district}</option>)}</select>
 <small>Nur unabhängig bestätigte Orte. Freitext-Veranstaltungsorte erhalten keinen erfundenen Pin.</small></>;
}
export function NewOpeningStudio(){
 const [items,setItems]=useState<Place[]>([]),[result,setResult]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let on=true;fetch('/api/places?mode=verified',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(on)setItems(d.items||[])}).catch(()=>{if(on)setResult('Orte konnten nicht geladen werden.')});return()=>{on=false}},[]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setResult('');
  const f=new FormData(e.currentTarget),body={place_id:String(f.get('place_id')||''),opened_at:String(f.get('opened_at')||''),source_url:String(f.get('source_url')||''),note:String(f.get('note')||'')};
  try{const r=await fetch('/api/new-openings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Fehler');setResult('Eröffnungsdatum mit Quelle gespeichert. Anzeige nur innerhalb von 90 Tagen bei aktueller Verifikation.');e.currentTarget.reset();
  }catch(e){setResult(e instanceof Error?e.message:'Speichern fehlgeschlagen')}finally{setBusy(false)}
 }
 return <section className="ffm-editorial-opening"><h3>Neu in Frankfurt · Eröffnung bestätigen</h3>
  <p>Eine Neueintragung ist nicht automatisch eine Neueröffnung. Nur belegte echte Eröffnungsdaten erscheinen öffentlich.</p>
  <form onSubmit={submit}>
   <label>Geprüfter Ort<select name="place_id" required><option value="">Ort wählen</option>{items.map(p=><option key={p.id} value={p.id}>{p.name} · {p.district}</option>)}</select></label>
   <label>Eröffnungsdatum<input name="opened_at" type="date" required max={new Date().toISOString().slice(0,10)}/></label>
   <label>Unabhängige HTTPS-Quelle<input name="source_url" type="url" required placeholder="https://..."/></label>
   <label>Eigene Prüfnotiz<textarea name="note" rows={2} minLength={20} maxLength={500} required/></label>
   <button type="submit" disabled={busy||!items.length}>{busy?'Speichert …':'Eröffnung eintragen'}</button>
  </form>{result&&<p role="status">{result}</p>}
 </section>;
}
