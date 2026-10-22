'use client';

import dynamic from 'next/dynamic';
import {useUiLocale,useUiText,UiLanguageSwitch} from '@/lib/ui-locale';
import {useModalFocus} from '@/lib/use-modal-focus';
import {useCallback,useEffect,useState} from 'react';
import {MapPin,X} from 'lucide-react';
import type {AtlasPlace} from '@/components/Atlas3D';
function AtlasLoading(){const ui=useUiText();return <div className="atlas-shell-placeholder">{ui("FRANKFURT WIRD GELADEN")}</div>}
const Atlas3D=dynamic(()=>import('@/components/Atlas3D'),{ssr:false,loading:AtlasLoading});
type Place=AtlasPlace&{website?:string|null;source_url?:string|null;address?:string|null};
export default function AtlasPage(){
 const ui=useUiText();const {locale:lang}=useUiLocale();
 const [places,setPlaces]=useState<Place[]>([]);
 const [selected,setSelected]=useState<Place|null>(null);
 const close=useCallback(()=>setSelected(null),[]);
 useModalFocus(Boolean(selected),close);
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/places',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
   .then(data=>{if(Array.isArray(data.items))setPlaces(data.items);else setError('Orte derzeit nicht erreichbar');})
   .catch(e=>{if(e.name!=='AbortError')setError('Orte derzeit nicht erreichbar');});
  return()=>controller.abort();
 },[]);
 return <main className="atlas-standalone"><h1 className="sr-only">{ui("Frankfurt entdecken")}</h1>
  <header className="atlas-standalone-bar"><a className="atlas-standalone-brand" href="/">ffm<span>aktuell.</span></a><div style={{display:'flex',alignItems:'center',gap:14}}><a href="/">{ui("Zur Startseite")}</a><UiLanguageSwitch/></div></header>
  <div className="atlas-standalone-main"><Atlas3D places={places} lang={lang} variant="full" onSelect={id=>setSelected(places.find(p=>p.id===id)||null)}/></div>
  {error&&<p className="atlas-standalone-note" role="alert">{ui(error)}</p>}
  <p className="atlas-standalone-note">{ui("Dreidimensionale Gebäude sind stadtweit auf Basis von Vektorkartendaten sichtbar. Beim Hineinzoomen werden amtliche LoD2 Dach- und Wandflächen nachgeladen, soweit verfügbar. Keine Garantie einer flächendeckenden amtlichen LoD2 Ansicht oder fotorealistischen Fassaden.")}</p>
  {selected&&<div className="atlas-detail-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelected(null);}}><div className="atlas-detail-sheet" role="dialog" aria-modal="true" tabIndex={-1} aria-label={selected.name}>
   <button className="atlas-detail-close" aria-label={ui("Schließen")} onClick={()=>setSelected(null)}><X size={20}/></button>
   <span className="atlas-editorial-index">{selected.district||'Frankfurt'} · {selected.category}</span>
   <h2>{selected.name}</h2>
   <p>{lang==='en'?(selected.description_en||selected.description_de):(selected.description_de||selected.description_en)}</p>
   {selected.address&&<p className="atlas-detail-address"><MapPin size={17}/>{selected.address}</p>}
   {selected.website&&<a className="atlas-detail-link" rel="noopener noreferrer" target="_blank" href={selected.website}>{ui("Internetseite ansehen")}<span className="atlas-action-mark"/></a>}
   {selected.source_url&&<a className="atlas-detail-source" rel="noopener noreferrer" target="_blank" href={selected.source_url}>{ui("Quellenangabe")}</a>}
  </div></div>}
 </main>;
}

