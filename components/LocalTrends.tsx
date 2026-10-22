'use client';
import {useEffect,useState} from 'react';
type Item={id:string;name:string;category:string;district:string;accounts:number};
export default function LocalTrends({district,category,lang,onPlace}:{district:string;category:string;lang:'de'|'en';onPlace:(id:string)=>void}){
 const [items,setItems]=useState<Item[]>([]);
 useEffect(()=>{const c=new AbortController();setItems([]);fetch('/api/trends?'+new URLSearchParams({district,category}),{cache:'no-store',signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json()}).then(d=>setItems(d.items)).catch(()=>{});return()=>c.abort()},[district,category]);
 if(!items.length)return null;
 return <section className="panel" aria-label={lang==='en'?'Local activity':'Lokale Aktivität'}><h2>{lang==='en'?'Noticed in FFM this week':'Diese Woche in FFM beachtet'}</h2><p>{lang==='en'?'Public likes from at least three accounts with activity sharing enabled over seven days. No visitor figures or citywide ranking.':'Öffentliche Likes von mindestens drei Konten mit freigegebener Aktivität in sieben Tagen. Keine Besucherzahlen und keine Rangliste der gesamten Stadt.'}</p>{items.map(p=><article key={p.id}><button onClick={()=>onPlace(p.id)}>{p.name}</button><small>{p.district} · {p.category} · {p.accounts} {lang==='en'?'accounts':'Konten'}</small></article>)}</section>;
}
