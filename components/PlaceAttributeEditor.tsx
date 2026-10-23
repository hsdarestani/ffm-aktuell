'use client';
import {useUiText} from '@/lib/ui-locale';
import {OpeningEditor} from '@/components/OpeningHours';
import {useEffect,useState,type FormEvent} from 'react';
import {factLabels,type Fact} from '@/components/PlaceFacts';
export default function PlaceAttributeEditor({placeId}:{placeId:string}){
 const ui=useUiText();
 const [facts,setFacts]=useState<Fact[]>([]),[field,setField]=useState('indoor'),[value,setValue]=useState('yes'),[source,setSource]=useState(''),[note,setNote]=useState(''),[stamp,setStamp]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[epoch,setEpoch]=useState(0);
 useEffect(()=>{setFacts([]);const c=new AbortController();if(placeId)fetch('/api/place-attributes?scope=admin&place_id='+encodeURIComponent(placeId),{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setFacts(d.items||[])).catch(()=>{});return()=>c.abort()},[placeId,epoch]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setMessage('');try{
  const r=await fetch('/api/place-attributes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({place_id:placeId,field,value:value==='unknown'?null:value,source_url:source,note,checked_at:new Date(stamp).toISOString()})});const d=await r.json();if(!r.ok)throw Error(d.error);setEpoch(v=>v+1);setMessage(ui("Merkmal mit Beleg gespeichert."));
 }catch(e){setMessage((e as Error).message||ui("Speichern fehlgeschlagen."))}finally{setBusy(false)}}
 if(!placeId)return null;
 return <section className="ffm-catalog-panel"><h2>{ui("Belegte Filtermerkmale")}</h2><p>{ui("Nur offizielle Angaben mit Quelle erfassen. Keine Merkmale aus Fotos oder Kategorien ableiten. Angaben verfallen nach 30 Tagen aus der öffentlichen Suche.")}</p>
 <ul>{facts.map(f=><li key={f.field}>{ui(factLabels[f.field])}: {f.value} · <a href={f.source_url} target="_blank" rel="noopener noreferrer">{ui("Beleg")}</a></li>)}</ul>
 <form onSubmit={save}><label>{ui("Merkmal")}<select value={field} onChange={e=>{setField(e.target.value);setValue(e.target.value==='price_level'?'1':'yes')}}>{Object.entries(factLabels).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>
 <label>{ui("Angabe")}<select value={value} onChange={e=>setValue(e.target.value)}>{(field==='price_level'?['1','2','3','4']:['yes','no']).map(v=><option key={v} value={v}>{v==='yes'?ui("Ja"):v==='no'?ui("Nein"):'€'.repeat(Number(v))}</option>)}<option value="unknown">{ui("Angabe zurückziehen")}</option></select></label>
 <label>{ui("HTTPS Quelle")}<input type="url" required maxLength={1500} value={source} onChange={e=>setSource(e.target.value)}/></label>
 <label>{ui("Geprüft am (lokale Zeit)")}<input type="datetime-local" required value={stamp} onChange={e=>setStamp(e.target.value)}/></label>
 <label>{ui("Beleg oder Grund")}<textarea required minLength={10} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button disabled={busy} type="submit">{busy?ui("Wird gespeichert …"):ui("Beleg speichern")}</button><p role="status">{ui(message)}</p></form><OpeningEditor key={placeId} placeId={placeId}/></section>;
}
