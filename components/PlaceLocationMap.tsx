'use client';
import {useUiText} from '@/lib/ui-locale';

import PlaceRasterMap from './PlaceRasterMap';
import {ExternalLink,MapPin} from 'lucide-react';

type Props={
 name:string;
 address?:string|null;
 latitude?:number|null;
 longitude?:number|null;
};

/**
 * Always show a real map for a location with valid coordinates.
 * Use the official OpenStreetMap embed, not a fabricated venue photo.
 * Do not infer a pin from an unverified or missing address.
 */
export function placeLocationLinks(latitude?:number|null,longitude?:number|null,address?:string|null){
 const lat=typeof latitude==='number'?latitude:NaN;
 const lon=typeof longitude==='number'?longitude:NaN;
 const valid=Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=49.7&&lat<=50.4&&lon>=8.2&&lon<=9.1;
 if(!valid){
  const q=String(address||'').trim();
  return {embed:null,external:q?'https://www.openstreetmap.org/search?query='+encodeURIComponent(q):null};
 }
 // Around 350 m either side in central Frankfurt: detail without losing context.
 const bounds=[lon-.004,lat-.0022,lon+.004,lat+.0022].map(n=>n.toFixed(6)).join(',');
 const params=new URLSearchParams({bbox:bounds,layer:'mapnik',marker:lat.toFixed(6)+','+lon.toFixed(6)});
 return {
  embed:'https://www.openstreetmap.org/export/embed.html?'+params.toString(),
  external:'https://www.openstreetmap.org/?mlat='+lat.toFixed(6)+'&mlon='+lon.toFixed(6)+'#map=17/'+lat.toFixed(6)+'/'+lon.toFixed(6)
 };
}
export default function PlaceLocationMap({name,address,latitude,longitude}:Props){
 const ui=useUiText();
 const {embed,external}=placeLocationLinks(latitude,longitude,address);
 return <aside className="ffm-place-location" aria-label={ui("Kartenposition: ")+name}>
  {embed?<PlaceRasterMap key={name+':'+latitude+':'+longitude} name={name} latitude={latitude!} longitude={longitude!}/>:<div className="ffm-place-location-fallback"><MapPin size={34}/><strong>{ui("Keine Kartenposition vorhanden")}</strong><p>{ui("Bitte den Standort direkt beim Anbieter prüfen.")}</p></div>}
  <div className="ffm-place-location-footer">
   <div className="ffm-place-location-label"><MapPin size={17}/><span>{embed?ui("Hier liegt der Ort"):ui("Standort suchen")}</span></div>
   {external&&<a href={external} target="_blank" rel="noopener noreferrer">{ui("Karte öffnen ")}<ExternalLink size={15}/></a>}
  </div>
  <small className="ffm-place-location-credit">{ui("Kartendaten © OpenStreetMap-Mitwirkende")}</small>
 </aside>;
}

