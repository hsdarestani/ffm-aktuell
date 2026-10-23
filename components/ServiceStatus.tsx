'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
type Status={phone?:{configured:boolean};weather?:{configured:boolean};google:{configured:boolean};apple:{configured:boolean};assistant:{configured:boolean};web_push:{configured:boolean;devices:number};media:{configured:boolean;scanner_reachable:boolean};billing:{configured:boolean;reason:string};inventory:{total:number;current_verified:number};checked_at:string};
export default function ServiceStatus(){
 const ui=useUiText();
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(false),[version,setVersion]=useState(0);
 const [probe,setProbe]=useState<{assistant:string;weather:string;checked_at:string}|null>(null),[probeError,setProbeError]=useState(''),[probing,setProbing]=useState(false);
 async function checkProviders(){
  setProbing(true);setProbeError('');
  try{const r=await fetch('/api/admin/provider-probe',{method:'POST'});
   if(!r.ok)throw Error('Verbindungstest fehlgeschlagen');
   setProbe(await r.json());
  }catch{setProbeError('Providerstatus konnte nicht überprüft werden.')}finally{setProbing(false)}
 }
 useEffect(()=>{const c=new AbortController();setError(false);fetch('/api/admin/service-status',{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(setData).catch(()=>{if(!c.signal.aborted)setError(true)});return()=>c.abort()},[version]);
 return <section className="ffm-catalog-studio"><h1>{ui("Dienste und Freigaben")}</h1><p>{ui("Konfiguration und Erreichbarkeit prüfen. Eine hinterlegte Konfiguration bestätigt noch keinen erfolgreichen Login oder Versand.")}</p><button type="button" onClick={()=>setVersion(v=>v+1)}>{ui("Status aktualisieren")}</button>
 <button type="button" disabled={probing} onClick={()=>void checkProviders()}>{probing?'Verbindungen werden geprüft …':'OpenAI und OpenWeather live testen'}</button>
 {probe&&<p role="status">{'OpenAI: '+probe.assistant+' · OpenWeather: '+probe.weather+' · '+new Date(probe.checked_at).toLocaleTimeString('de-DE')}</p>}
 {probeError&&<p role="alert">{probeError}</p>}
 {error?<p role="alert">{ui("Status konnte nicht geladen werden.")}</p>:!data?<p>{ui("Status wird geprüft …")}</p>:<>
 <div className="ffm-catalog-columns">{([['Telefonanmeldung',Boolean(data.phone?.configured)],['Wetter',Boolean(data.weather?.configured)],['Google Login',data.google.configured],['Apple Login',data.apple.configured],['KI Vorschläge',data.assistant.configured],['Web Push',data.web_push.configured]] as const).map(([label,ready])=><article className="ffm-catalog-panel" key={ui(label)}><h2>{ui(label)}</h2><p>{ready?ui("Konfiguriert"):ui("Konfiguration fehlt")}</p></article>)}</div>
 <article className="ffm-catalog-panel"><h2>{ui("Medien und Daten")}</h2><p>{ui("Scanner: ")}{data.media.scanner_reachable?ui("erreichbar"):data.media.configured?ui("konfiguriert, aber nicht erreichbar"):ui("nicht eingerichtet")}{ui(". Uploads ")}{data.media.scanner_reachable?ui("verfügbar"):ui("gesperrt")}.</p><p>{ui("Aktuell unabhängig geprüfte Orte: ")}{data.inventory.current_verified} {ui(" von ")}{data.inventory.total} {ui(" veröffentlichten Orten.")}</p><p>{ui("Registrierte Push Geräte: ")}{data.web_push.devices}{ui(". Versand setzt weiterhin die jeweilige Einwilligung voraus.")}</p></article>
 <article className="ffm-catalog-panel"><h2>{ui("Offene Freigaben")}</h2><p>{data.billing.reason}</p><p>{ui("Für Medien ist ein ausreichend ausgestatteter privater Scanner erforderlich. Tarifpreise, Nutzungsrechte, Besuchsnachweise und rechtliche Abnahme benötigen eigene Freigaben.")}</p><p>{ui("Der Dienstestatus ersetzt keine vollständige Abnahme des Produktbriefings.")}</p></article>
 <small>{ui("Geprüft: ")}{new Date(data.checked_at).toLocaleString((ui.locale==='de'?'de-DE':'en-GB'))}</small></>}
 </section>;
}
