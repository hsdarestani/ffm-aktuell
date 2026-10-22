'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
import {defaultHomeLayout,validHomeLayout,type HomeModule} from '@/lib/home-layout';
const names:Record<string,string>={choices:'Kategorien und Schnellzugriff',highlights:'Geprüfte Orte und Veranstaltungen',tips:'Redaktionelle Stadttipps',assistant:'Persönliche Stadtideen',community:'Miteinander und Unternehmen',news:'Stadtgeschichten'};
export default function HomepageStudio(){
 const ui=useUiText();const [items,setItems]=useState<HomeModule[]>(defaultHomeLayout),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const c=new AbortController();fetch('/api/home-layout',{cache:'no-store',signal:c.signal}).then(r=>r.json()).then(d=>{if(validHomeLayout(d.modules))setItems(d.modules)}).catch(()=>{});return()=>c.abort()},[]);
 function move(i:number,delta:number){setItems(old=>{const next=[...old];[next[i],next[i+delta]]=[next[i+delta],next[i]];return next})}
 async function save(){setBusy(true);try{const r=await fetch('/api/home-layout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({modules:items})}),d=await r.json();if(!r.ok)throw Error(d.error);setMessage(ui("Reihenfolge und Sichtbarkeit gespeichert."))}catch(e){setMessage(e instanceof Error?e.message:ui("Speichern fehlgeschlagen"))}finally{setBusy(false)}}
 return <section className="ffm-catalog-studio"><h1>{ui("Startseite gestalten")}</h1><p>{ui("Module sortieren und einblenden. Suche und Zugang zur Navigation bleiben erreichbar.")}</p><ol>{items.map((item,i)=><li key={item.code} className="ffm-catalog-panel"><label><input type="checkbox" checked={item.enabled} onChange={e=>setItems(old=>old.map(x=>x.code===item.code?{...x,enabled:e.target.checked}:x))}/>{ui(names[item.code])}</label><button disabled={i===0} aria-label={ui(names[item.code])+ui(" nach oben")} onClick={()=>move(i,-1)}>{ui("Nach oben")}</button><button disabled={i===items.length-1} aria-label={ui(names[item.code])+ui(" nach unten")} onClick={()=>move(i,1)}>{ui("Nach unten")}</button></li>)}</ol><button disabled={busy} onClick={()=>void save()}>{ui("Startseite speichern")}</button>{message&&<p role="status">{ui(message)}</p>}</section>;
}
