'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
export const factLabels:Record<string,string>={price_level:'Preisniveau',indoor:'Innenbereich',outdoor:'Außenbereich',family_friendly:'Familienfreundlich',wheelchair_accessible:'Rollstuhlgerecht',date_friendly:'Für ein Date',group_friendly:'Für Gruppen',quiet:'Ruhig'};
export type Fact={field:string;value:string;source_url:string;checked_at:string;note:string};
export default function PlaceFacts({placeId}:{placeId:string}){
 const ui=useUiText();
 const [facts,setFacts]=useState<Fact[]>([]);
 useEffect(()=>{const ctl=new AbortController();setFacts([]);fetch('/api/place-attributes?place_id='+encodeURIComponent(placeId),{signal:ctl.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setFacts(d.items||[])).catch(()=>{});return()=>ctl.abort()},[placeId]);
 if(!facts.length)return null;
 return <section className="ffm-venue-hours"><h3>{ui("Belegte Merkmale")}</h3><dl>{facts.map(f=><div key={f.field}><dt>{ui(factLabels[f.field])}</dt><dd>{f.field==='price_level'?'€'.repeat(Number(f.value)):f.value==='yes'?ui("Ja"):ui("Nein")} · <a href={f.source_url} target="_blank" rel="noopener noreferrer">{ui("Quelle")}</a><small> {ui(" Geprüft: ")}{new Intl.DateTimeFormat((ui.locale==='de'?'de-DE':'en-GB'),{timeZone:'Europe/Berlin'}).format(new Date(f.checked_at))}</small></dd></div>)}</dl><p>{ui("Preisniveau ist eine relative Einordnung, kein Preisversprechen. Umfang der Barrierefreiheit bei der Quelle prüfen.")}</p></section>;
}
