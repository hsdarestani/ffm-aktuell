'use client';
import {useEffect,useState} from 'react';
type Stop={id:string;name:string;latitude:number;longitude:number};
type Tour={id:string;title:string;stops:Stop[];verification:'verified'|'unverified';mode:'route'|'preview'};
function route(stops:Stop[]){
 const coords=(p:Stop)=>[p.latitude,p.longitude].join(',');
 const params=new URLSearchParams({api:'1',origin:coords(stops[0]),destination:coords(stops[stops.length-1]),travelmode:'walking'});
 if(stops.length>2)params.set('waypoints',stops.slice(1,-1).map(coords).join('|'));
 return 'https://www.google.com/maps/dir/?'+params.toString();
}
export default function CuratedTours({lang='de'}:{lang?:'de'|'en'}){
 const [tours,setTours]=useState<Tour[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/tours/curated',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('api');return r.json()}).then(d=>{if(live)setTours(d.items||[])}).catch(()=>{if(live)setError(true)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 return <section className="ffm-curated" aria-label="Fertige Touren"><div className="ffm-curated-inner"><h2>{lang==='de'?'Frankfurt entdecken · Tourideen':'Discover Frankfurt · Tour ideas'}</h2>
  {loading?<p role="status">{lang==='de'?'Touren werden geladen …':'Loading tours …'}</p>:error?<p role="alert">{lang==='de'?'Touren sind gerade nicht erreichbar.':'Tours are currently unavailable.'}</p>:tours.length===0?<p>{lang==='de'?'Tourideen werden verfügbar, sobald mindestens zwei reale Orte mit Koordinaten vorliegen.':'Tours will appear once at least two real places with coordinates are available.'}</p>:
  <div className="ffm-curated-grid">{tours.map(t=><article key={t.id}><h3>{t.title}</h3>{t.verification!=='verified'&&<strong className="ffm-tour-unverified">{lang==='de'?'Vorschau · Stopps nicht geprüft':'Preview · stops not verified'}</strong>}<p>{t.stops.map(p=>p.name).join(' → ')}</p><a href={route(t.stops)} target="_blank" rel="noopener noreferrer">{lang==='de'?'Route in Karten öffnen':'Open walking route in Maps'}</a></article>)}</div>}
  <small>{lang==='de'?'Die Route wird in Google Maps geöffnet. Vor dem Besuch die Zugänglichkeit, Verfügbarkeit und Gehzeit prüfen.':'The route opens in Google Maps. Confirm access, availability and walking time before your visit.'}</small>
 </div></section>;
}