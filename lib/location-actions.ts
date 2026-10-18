// Pure URL/identity helpers for the FFM location detail actions.
// Do not add a venue to the verified list or assert opening hours here.
export const publishedId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const osmId=/^(node|way|relation)\/[1-9]\d{0,18}$/;
export function validLocationId(value:string):boolean {
 return value.length<90&&(publishedId.test(value)||osmId.test(value));
}
export function validFrankfurtCoords(lat:unknown,lon:unknown):lat is number{
 return typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=49.7&&lat<=50.4&&lon>=8.2&&lon<=9.1;
}
export function directionsUrl(p:{name:string;address?:string|null;latitude?:number|null;longitude?:number|null}):string|null{
 const query=validFrankfurtCoords(p.latitude,p.longitude)
  ?String(p.latitude)+','+String(p.longitude)
  :[p.name,p.address,'Frankfurt am Main'].filter(Boolean).join(', ').slice(0,250);
 if(!query.trim())return null;
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(query);
}
export function safePhoneHref(value:string|null|undefined):string|null{
 if(!value)return null;
 const normalized=value.replace(/[()\s.\-]/g,'');
 if(!/^\+?[0-9]{5,16}$/.test(normalized))return null;
 return 'tel:'+normalized;
}
export function locationShareUrl(id:string,origin:string):string|null{
 if(!validLocationId(id))return null;
 try{
  const u=new URL('/',origin);
  if(!['https:','http:'].includes(u.protocol))return null;
  u.searchParams.set('ort',id);
  return u.toString();
 }catch{return null;}
}
