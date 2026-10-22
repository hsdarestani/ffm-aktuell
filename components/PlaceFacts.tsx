'use client';
import {useEffect,useState} from 'react';
export const factLabels:Record<string,string>={price_level:'Preisniveau',indoor:'Innenbereich',outdoor:'Außenbereich',family_friendly:'Familienfreundlich',wheelchair_accessible:'Rollstuhlgerecht',date_friendly:'Für ein Date',group_friendly:'Für Gruppen',quiet:'Ruhig'};
export type Fact={field:string;value:string;source_url:string;checked_at:string;note:string};
export default function PlaceFacts({placeId}:{placeId:string}){
 const [facts,setFacts]=useState<Fact[]>([]);
 useEffect(()=>{const ctl=new AbortController();setFacts([]);fetch('/api/place-attributes?place_id='+encodeURIComponent(placeId),{signal:ctl.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setFacts(d.items||[])).catch(()=>{});return()=>ctl.abort()},[placeId]);
 if(!facts.length)return null;
 return <section className="ffm-venue-hours"><h3>Belegte Merkmale</h3><dl>{facts.map(f=><div key={f.field}><dt>{factLabels[f.field]}</dt><dd>{f.field==='price_level'?'€'.repeat(Number(f.value)):f.value==='yes'?'Ja':'Nein'} · <a href={f.source_url} target="_blank" rel="noopener noreferrer">Quelle</a><small> Geprüft: {new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin'}).format(new Date(f.checked_at))}</small></dd></div>)}</dl><p>Preisniveau ist eine relative Einordnung, kein Preisversprechen. Umfang der Barrierefreiheit bei der Quelle prüfen.</p></section>;
}
