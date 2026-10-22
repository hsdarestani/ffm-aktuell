'use client';
import {useEffect,useRef,useState} from 'react';
type Ad={token:string;title:string;body:string;place_id:string;place_name:string;business_name:string};
export default function SponsoredPlace({placement,category='',district='',onPlace}:{placement:string;category?:string;district?:string;onPlace:(id:string)=>void}){
 const [ad,setAd]=useState<Ad|null>(null);const node=useRef<HTMLElement|null>(null);
 useEffect(()=>{setAd(null);const c=new AbortController();fetch('/api/advertising?'+new URLSearchParams({placement,category,district}),{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setAd(Array.isArray(d.items)?d.items[0]||null:null)).catch(()=>{});return()=>c.abort()},[placement,category,district]);
 useEffect(()=>{if(!ad||!node.current)return;let timer:ReturnType<typeof setTimeout>|undefined,visible=false,measured=false;
 function stop(){if(timer)clearTimeout(timer);timer=undefined}
 function schedule(){stop();if(visible&&!document.hidden&&!measured)timer=setTimeout(()=>{measured=true;void fetch('/api/advertising',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'impression',token:ad!.token}),keepalive:true}).catch(()=>{})},1000)}
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=0.5;schedule()},{threshold:[0,0.5]});observer.observe(node.current);document.addEventListener('visibilitychange',schedule);return()=>{stop();observer.disconnect();document.removeEventListener('visibilitychange',schedule)}},[ad]);
 if(!ad)return null;
 return <aside ref={node} className="ffm-sponsored" aria-label="Werbung"><small>WERBUNG · {ad.business_name}</small><h3>{ad.title}</h3><p>{ad.body}</p><button onClick={()=>{void fetch('/api/advertising',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'click',token:ad.token}),keepalive:true}).catch(()=>{});onPlace(ad.place_id)}}>{ad.place_name} ansehen</button></aside>;
}
