'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen,ChevronLeft,ExternalLink,Search} from 'lucide-react';
import ContentImage from './ContentImage';
type Guide={id:string;title:string;category:string;body_de:string;body_en:string;published_at:string;source_url:string|null;image_url:string|null};
const cats=['Alle','Café','Restaurant','Bar','Club','Aktivitäten','Sonstige'];
export default function GuidesExplorer({lang='de'}:{lang?:'de'|'en'}){
 const [items,setItems]=useState<Guide[]>([]),[category,setCategory]=useState('Alle'),[query,setQuery]=useState(''),[selected,setSelected]=useState<Guide|null>(null);
 const [retry,setRetry]=useState(0);
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 useEffect(()=>{const ac=new AbortController();setLoading(true);setFailed(false);fetch('/api/guides',{signal:AbortSignal.any([ac.signal,AbortSignal.timeout(12000)]),cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject()).then(d=>setItems(d.items||[])).catch(()=>{if(!ac.signal.aborted)setFailed(true)}).finally(()=>{if(!ac.signal.aborted)setLoading(false)});
  return()=>ac.abort()},[retry]);
 const filtered=useMemo(()=>items.filter(g=>(category==='Alle'||g.category==='Guide:'+category)&&
  (g.title+' '+g.body_de+' '+g.body_en).toLocaleLowerCase().includes(query.toLocaleLowerCase())),[items,category,query]);
 const label=(g:Guide)=>g.category.replace(/^Guide:/,'')||'Sonstige';
 const content=(g:Guide)=>lang==='en'&&g.body_en?g.body_en:g.body_de;
 return <main className="ffm-guide-screen">
  {selected?<article className="ffm-guide-detail"><button onClick={()=>setSelected(null)} className="ffm-guide-back"><ChevronLeft size={18}/>{lang==='de'?'Alle Guides':'All guides'}</button>
   <span className="ffm-city-eyebrow">{label(selected)}</span><h1>{selected.title}</h1>
   {selected.image_url&&<ContentImage className="ffm-guide-full-image" src={selected.image_url} alt={selected.title}/>}
   <div className="ffm-guide-full-body">{content(selected).split(/\n+/).filter(Boolean).map((p,i)=><p key={i}>{p}</p>)}</div>
   {selected.source_url&&<a target="_blank" rel="noopener noreferrer" href={selected.source_url}>{lang==='de'?'Quelle ansehen':'View source'} <ExternalLink size={16}/></a>}
  </article>:<>
   <header className="ffm-city-head"><span className="ffm-city-eyebrow">{lang==='de'?'DEIN FRANKFURT':'YOUR FRANKFURT'}</span><h1>Guides<span>.</span></h1>
    <p>{lang==='de'?'Insider-Tipps aus Frankfurt – recherchiert und von der Redaktion ausgewählt.':'Local stories and guides – researched and selected by our editors.'}</p></header>
   <div className="ffm-guide-toolbar"><div className="ffm-guide-chips" aria-label={lang==='de'?'Kategorien':'Categories'}>
    {cats.map(c=><button key={c} className={c===category?'active':''} aria-pressed={c===category} onClick={()=>setCategory(c)}>{lang==='de'?c:({Alle:'All',Aktivitäten:'Activities',Sonstige:'Other'} as Record<string,string>)[c]||c}</button>)}</div>
    <label className="ffm-guide-search"><Search size={18}/><input aria-label={lang==='de'?'Guides durchsuchen':'Search guides'} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={lang==='de'?'Guides durchsuchen':'Search guides'}/></label></div>
   {loading?<p role="status">{lang==='de'?'Guides werden geladen …':'Loading guides …'}</p>:failed?<div role="alert"><p>{lang==='de'?'Guides sind derzeit nicht erreichbar.':'Guides are currently unavailable.'}</p><button onClick={()=>setRetry(v=>v+1)}>{lang==='de'?'Erneut versuchen':'Try again'}</button></div>:!filtered.length?
    <div className="ffm-city-empty"><BookOpen size={30}/><strong>{lang==='de'?'Noch keine passenden Guides veröffentlicht.':'No guides published in this category yet.'}</strong><p>{lang==='de'?'Hier erscheinen nur redaktionell freigegebene Artikel mit überprüften Quellen.':'Only editor-approved articles with checked sources appear here.'}</p></div>:
    <div className="ffm-guide-grid">{filtered.map(g=><article key={g.id} className="ffm-guide-card">
      <button type="button" className="ffm-guide-card-button" onClick={()=>setSelected(g)}>
       {g.image_url?<ContentImage src={g.image_url} alt="" loading="lazy"/>:<div className="ffm-guide-typographic"><BookOpen size={24}/><span>{label(g)}</span></div>}
       <div className="ffm-guide-card-copy"><span className="ffm-city-eyebrow">{label(g)}</span><h2>{g.title}</h2><p>{content(g).slice(0,140)}{content(g).length>140?'…':''}</p><span className="ffm-guide-read">{lang==='de'?'Lesen':'Read'} ↗</span></div>
      </button></article>)}</div>}
  </>}
 </main>;
}
