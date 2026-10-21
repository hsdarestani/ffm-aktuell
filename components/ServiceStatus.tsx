'use client';
import {useEffect,useState} from 'react';
type Status={google:{configured:boolean};apple:{configured:boolean};assistant:{configured:boolean};web_push:{configured:boolean;devices:number};media:{configured:boolean;scanner_reachable:boolean};billing:{configured:boolean;reason:string};inventory:{total:number;current_verified:number};checked_at:string};
export default function ServiceStatus(){
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{const c=new AbortController();setError(false);fetch('/api/admin/service-status',{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(setData).catch(()=>{if(!c.signal.aborted)setError(true)});return()=>c.abort()},[version]);
 return <section className="ffm-catalog-studio"><h1>Dienste und Freigaben</h1><p>Konfiguration und Erreichbarkeit prüfen. Eine hinterlegte Konfiguration bestätigt noch keinen erfolgreichen Login oder Versand.</p><button type="button" onClick={()=>setVersion(v=>v+1)}>Status aktualisieren</button>
 {error?<p role="alert">Status konnte nicht geladen werden.</p>:!data?<p>Status wird geprüft …</p>:<>
 <div className="ffm-catalog-columns">{([['Google Login',data.google.configured],['Apple Login',data.apple.configured],['KI Vorschläge',data.assistant.configured],['Web Push',data.web_push.configured]] as const).map(([label,ready])=><article className="ffm-catalog-panel" key={label}><h2>{label}</h2><p>{ready?'Konfiguriert':'Konfiguration fehlt'}</p></article>)}</div>
 <article className="ffm-catalog-panel"><h2>Medien und Daten</h2><p>Scanner: {data.media.scanner_reachable?'erreichbar':data.media.configured?'konfiguriert, aber nicht erreichbar':'nicht eingerichtet'}. Uploads {data.media.scanner_reachable?'verfügbar':'gesperrt'}.</p><p>Aktuell unabhängig geprüfte Orte: {data.inventory.current_verified} von {data.inventory.total} veröffentlichten Orten.</p><p>Registrierte Push Geräte: {data.web_push.devices}. Versand setzt weiterhin die jeweilige Einwilligung voraus.</p></article>
 <article className="ffm-catalog-panel"><h2>Offene Freigaben</h2><p>{data.billing.reason}</p><p>Für Medien ist ein ausreichend ausgestatteter privater Scanner erforderlich. Tarifpreise, Nutzungsrechte, Besuchsnachweise und rechtliche Abnahme benötigen eigene Freigaben.</p><p>Der Dienstestatus ersetzt keine vollständige Abnahme des Produktbriefings.</p></article>
 <small>Geprüft: {new Date(data.checked_at).toLocaleString('de-DE')}</small></>}
 </section>;
}
