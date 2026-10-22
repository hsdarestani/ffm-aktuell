'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
export function OpeningStatus({placeId}:{placeId:string}){
 const ui=useUiText();
 const [data,setData]=useState<{state:string;plan:{source_url:string;periods:{start:number;end:number}[]}|null}|null>(null);
 useEffect(()=>{setData(null);if(!/^[a-f0-9-]{36}$/.test(placeId))return;const c=new AbortController();const load=()=>fetch('/api/opening-hours?place_id='+placeId,{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(setData).catch(()=>{});void load();const t=setInterval(()=>void load(),60000);return()=>{c.abort();clearInterval(t)}},[placeId]);
 if(!data||data.state==='unknown')return null;
 const time=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 return <section className="ffm-venue-hours"><h3>{data.state==='open'?ui("Laut bestätigtem Tagesplan geöffnet"):ui("Laut bestätigtem Tagesplan geschlossen")}</h3>{data.plan?.periods.map((p,i)=><p key={i}>{time(p.start)} {ui(" bis ")}{time(p.end)} {ui(" Uhr")}</p>)}{data.plan&&<a href={data.plan.source_url} target="_blank" rel="noopener noreferrer">{ui("Heutigen Plan beim Anbieter prüfen")}</a>}<p>{ui("Ortszeit Frankfurt. Kurzfristige Änderungen und Verfügbarkeit beim Anbieter bestätigen.")}</p></section>;
}
export function OpeningEditor({placeId}:{placeId:string}){
 const ui=useUiText();
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));setBusy(true);try{
 const minute=(v:string)=>{const [h,m]=v.split(':').map(Number);if(h>24||m>59||h===24&&m!==0)throw Error(ui("Zeit ungültig"));return h*60+m};
 const periods=f.state==='open'?String(f.periods||'').split(';').filter(x=>x.trim()).map(x=>{const m=x.trim().match(/^(\d{2}:\d{2})\s+bis\s+(\d{2}:\d{2})$/);if(!m)throw Error(ui("Zeiten als 09:00 bis 12:00; 13:00 bis 18:00 angeben."));return {start:minute(m[1]),end:minute(m[2])}}):[];
 const r=await fetch('/api/opening-hours',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f,place_id:placeId,periods,checked_at:new Date(String(f.checked_at)).toISOString()})}),d=await r.json();if(!r.ok)throw Error(d.error);setMessage(ui("Tagesplan mit Beleg gespeichert."));
 }catch(e){setMessage(e instanceof Error?e.message:ui("Speichern fehlgeschlagen"))}finally{setBusy(false)}}
 return <details className="ffm-catalog-panel"><summary>{ui("Bestätigte Tagesöffnungszeiten")}</summary><p>{ui("Konkrete Kalendertage einschließlich Feiertagen prüfen. Ungeprüfte Wochenpläne oder OSM Texte erzeugen keinen aktuellen Öffnungsstatus. Über Mitternacht je Kalendertag einen eigenen Plan anlegen.")}</p><form onSubmit={save}><label>{ui("Gültiger Kalendertag")}<input name="day" type="date" required/></label><label>{ui("Angabe")}<select name="state"><option value="open">{ui("Zeitfenster geöffnet")}</option><option value="closed">{ui("Ganztägig geschlossen")}</option><option value="withdraw">{ui("Plan zurückziehen")}</option></select></label><label>{ui("Zeitfenster")}<textarea name="periods" placeholder={ui("09:00 bis 12:00; 13:00 bis 18:00")} maxLength={200}/></label><label>{ui("HTTPS Quelle")}<input name="source_url" type="url" required/></label><label>{ui("Tatsächlich geprüft am")}<input name="checked_at" type="datetime-local" required/></label><label>{ui("Beleg")}<textarea name="note" minLength={10} maxLength={500} required/></label><button disabled={busy}>{ui("Tagesplan speichern")}</button></form>{message&&<p role="status">{ui(message)}</p>}</details>;
}
