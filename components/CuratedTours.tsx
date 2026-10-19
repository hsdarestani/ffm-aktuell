'use client';
import {useEffect,useState} from 'react';
type Stop={id:string;name:string;latitude:number;longitude:number};
type Tour={id:string;title:string;stops:Stop[]};
function route(stops:Stop[]){
 const coords=(p:Stop)=>[p.latitude,p.longitude].join(',');
 const params=new URLSearchParams({api:'1',origin:coords(stops[0]),destination:coords(stops[stops.length-1]),travelmode:'walking'});
 if(stops.length>2)params.set('waypoints',stops.slice(1,-1).map(coords).join('|'));
 return 'https://www.google.com/maps/dir/?'+params.toString();
}
export default function CuratedTours(){
 const [tours,setTours]=useState<Tour[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/tours/curated',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('api');return r.json()}).then(d=>{if(live)setTours(d.items||[])}).catch(()=>{if(live)setError(true)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 return <section className="ffm-curated" aria-label="Fertige Touren"><div className="ffm-curated-inner"><h2>Frankfurt entdecken · Tourideen</h2>
  {loading?<p role="status">Touren werden geladen …</p>:error?<p role="alert">Touren sind gerade nicht erreichbar.</p>:tours.length===0?<p>Die redaktionell geprüften Touren folgen, sobald mindestens zwei passende Orte unabhängig bestätigt wurden. Keine ungeprüften Empfehlungen.</p>:
  <div className="ffm-curated-grid">{tours.map(t=><article key={t.id}><h3>{t.title}</h3><p>{t.stops.map(p=>p.name).join(' → ')}</p><a href={route(t.stops)} target="_blank" rel="noopener noreferrer">Route in Karten öffnen</a></article>)}</div>}
  <small>Die Route wird bei Google Maps geöffnet. Wegzeiten und Verfügbarkeit dort prüfen.</small>
 </div></section>;
}