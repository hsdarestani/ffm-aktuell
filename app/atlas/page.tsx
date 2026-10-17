'use client';

import dynamic from 'next/dynamic';
import {useEffect,useState} from 'react';
import {MapPin,X} from 'lucide-react';
import type {AtlasPlace} from '@/components/Atlas3D';
const Atlas3D=dynamic(()=>import('@/components/Atlas3D'),{ssr:false,loading:()=> <div className="atlas-shell-placeholder">FFM ATLAS</div>});
type Place=AtlasPlace&{website?:string|null;source_url?:string|null;address?:string|null};
export default function AtlasPage(){
 const [places,setPlaces]=useState<Place[]>([]);
 const [selected,setSelected]=useState<Place|null>(null);
 const [lang,setLang]=useState<'de'|'en'>('de');
 const [error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/places',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
   .then(data=>{if(Array.isArray(data.items))setPlaces(data.items);else setError('Places unavailable');})
   .catch(e=>{if(e.name!=='AbortError')setError(e.message||'Could not fetch places');});
  return()=>controller.abort();
 },[]);
 return <main className="atlas-standalone">
  <header className="atlas-standalone-bar"><a className="atlas-standalone-brand" href="/">ffm<span>aktuell.</span></a><div style={{display:'flex',alignItems:'center',gap:14}}><button onClick={()=>setLang(x=>x==='de'?'en':'de')} style={{border:0,background:'transparent',fontWeight:650,fontSize:12}}>{lang.toUpperCase()}</button><a href="/">{lang==='de'?'Zur Website':'Main website'}</a></div></header>
  <div className="atlas-standalone-main"><Atlas3D places={places} lang={lang} variant="full" onSelect={id=>setSelected(places.find(p=>p.id===id)||null)}/></div>
  {error&&<p className="atlas-standalone-note" role="alert">{error}</p>}
  <p className="atlas-standalone-note">{lang==='de'?'3D Gebäude basieren auf OpenStreetMap Daten. Einzelne Gebäudehöhen können fehlen. Fotorealistische Gebäudetexturen sind nicht enthalten.':'3D buildings use OpenStreetMap data. Some building heights may be unavailable. Photorealistic building textures are not included.'}</p>
  {selected&&<div className="atlas-detail-overlay" role="presentation" onClick={e=>{if(e.target===e.currentTarget)setSelected(null);}}><div className="atlas-detail-sheet" role="dialog" aria-modal="true" aria-label={selected.name}>
   <button className="atlas-detail-close" aria-label={lang==='de'?'Schließen':'Close'} onClick={()=>setSelected(null)}><X size={20}/></button>
   <span className="atlas-editorial-index">{selected.district||'Frankfurt'} · {selected.category}</span>
   <h2>{selected.name}</h2>
   <p>{lang==='de'?selected.description_de||selected.description_en:selected.description_en||selected.description_de}</p>
   {selected.address&&<p className="atlas-detail-address"><MapPin size={17}/>{selected.address}</p>}
   {selected.website&&<a className="atlas-detail-link" rel="noopener noreferrer" target="_blank" href={selected.website}>{lang==='de'?'Website ansehen':'Visit website'}<span className="atlas-action-mark"/></a>}
   {selected.source_url&&<a className="atlas-detail-source" rel="noopener noreferrer" target="_blank" href={selected.source_url}>{lang==='de'?'Quellenangabe':'Source information'}</a>}
  </div></div>}
 </main>;
}
