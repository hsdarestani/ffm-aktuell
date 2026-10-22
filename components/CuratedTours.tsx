'use client';
import {useUiText} from '@/lib/ui-locale';
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
 const ui=useUiText();
 const [tours,setTours]=useState<Tour[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/tours/curated',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error(ui("api"));return r.json()}).then(d=>{if(live)setTours(d.items||[])}).catch(()=>{if(live)setError(true)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[]);
 return <section className="ffm-curated" aria-label={ui("Fertige Touren")}><div className="ffm-curated-inner"><h2>{lang==='de'?ui("Frankfurt entdecken · Tourideen"):ui("Discover Frankfurt · Tour ideas")}</h2>
  {loading?<p role="status">{lang==='de'?ui("Touren werden geladen …"):ui("Loading tours …")}</p>:error?<p role="alert">{lang==='de'?ui("Touren sind gerade nicht erreichbar."):ui("Tours are currently unavailable.")}</p>:tours.length===0?<p>{lang==='de'?ui("Tourideen werden verfügbar, sobald mindestens zwei reale Orte mit Koordinaten vorliegen."):ui("Tours will appear once at least two real places with coordinates are available.")}</p>:
  <div className="ffm-curated-grid">{tours.map(t=><article key={t.id}><h3>{t.title}</h3>{t.verification!=='verified'&&<strong className="ffm-tour-unverified">{lang==='de'?ui("Vorschau · Stopps nicht geprüft"):ui("Preview · stops not verified")}</strong>}<p>{t.stops.map(p=>p.name).join(' → ')}</p><a href={route(t.stops)} target="_blank" rel="noopener noreferrer">{lang==='de'?ui("Route in Karten öffnen"):ui("Open walking route in Maps")}</a></article>)}</div>}
  <small>{lang==='de'?ui("Die Route wird in Google Maps geöffnet. Vor dem Besuch die Zugänglichkeit, Verfügbarkeit und Gehzeit prüfen."):ui("The route opens in Google Maps. Confirm access, availability and walking time before your visit.")}</small>
 </div></section>;
}
