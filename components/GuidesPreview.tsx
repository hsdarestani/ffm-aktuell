'use client';
import {useEffect,useState} from 'react';
import {BookOpen} from 'lucide-react';
type Guide={id:string;title:string;category:string};
export default function GuidesPreview({lang,onOpen}:{lang:'de'|'en';onOpen:()=>void}){
 const [items,setItems]=useState<Guide[]>([]);
 useEffect(()=>{const c=new AbortController();fetch('/api/guides',{signal:c.signal,cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>setItems((d.items||[]).slice(0,3))).catch(()=>{});return()=>c.abort()},[]);
 if(!items.length)return null;
 return <section className="ffm-guides-preview"><header><span className="ffm-city-eyebrow"><BookOpen size={15}/>{lang==='de'?'AUS UNSERER REDAKTION':'FROM OUR EDITORS'}</span>
  <h2>Neue Guides</h2><button onClick={onOpen}>{lang==='de'?'Alle ansehen':'View all'} ↗</button></header>
 <div>{items.map(g=><button key={g.id} onClick={onOpen}><span>{g.category.replace(/^Guide:/,'')}</span><strong>{g.title}</strong><span>{lang==='de'?'Lesen':'Read'} ↗</span></button>)}</div></section>;
}
