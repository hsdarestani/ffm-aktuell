'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
type H={id:string;expires_at:string;media_type:string;media_url:string};
export default function BusinessHighlights({businessId}:{businessId:string}){
 const ui=useUiText();
 const [items,setItems]=useState<H[]>([]);
 useEffect(()=>{let active=true;
  fetch('/api/highlights?'+new URLSearchParams({business_id:businessId}),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error(ui("not available"));return r.json()})
   .then(d=>{if(active)setItems(Array.isArray(d.items)?d.items:[])})
   .catch(()=>{if(active)setItems([])});
  return()=>{active=false};
 },[businessId]);
 if(!items.length)return null;
 return <section className="ffm-venue-highlights" aria-label={ui("Bilder und Videos des Unternehmens")}>
  <h3>{ui("Einblicke aus der Community")}</h3>
  <div className="ffm-venue-highlight-list">{items.map(h=><figure key={h.id}>
    {h.media_type.startsWith('image/')?<img src={h.media_url} alt={ui("Mit Erlaubnis geteiltes Bild")} loading="lazy"/>:
     <video src={h.media_url} controls preload="none" playsInline aria-label={ui("Mit Erlaubnis geteiltes Video")}/>}
    <figcaption>{ui("Von der Community freigegeben · keine Aussage zur aktuellen Öffnung")}</figcaption>
   </figure>)}</div>
 </section>;
}
