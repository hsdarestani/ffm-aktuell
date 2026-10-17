'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,ArrowRight,ArrowUpRight,Monitor,Smartphone,CheckCircle2} from 'lucide-react';

type Direction='signal'|'night'|'archive';
const concepts:Record<Direction,{number:string,name:string,tagline:string,kind:string,hero:string[],body:string,accent:string,micro:string,notes:string[]}> = {
 signal:{
   number:'01',name:'SIGNAL / 069',kind:'URBAN / LIVE / BOLD',tagline:'Die Stadt ist nicht still.',
   hero:['DIE STADT','IST NICHT','STILL.'],body:'Dein direkter Draht zu Orten, Ideen und Menschen, die Frankfurt bewegen.',
   accent:'#ff5b35',micro:'069 / CITY FREQUENCY',
   notes:['Signal Orange, Asphalt Black, Editorial Paper','Condensed sign typography & transit coordinates','Live radar, route language and distinctive wayfinding']
 },
 night:{
   number:'02',name:'NACHTSCHICHT',kind:'SOCIAL / NIGHT / ELECTRIC',tagline:'Frankfurt hört nicht auf.',
   hero:['NACHTS','NOCH','WACH.'],body:'Dein Frankfurt nach Sonnenuntergang. Entdecken. Erleben. Dabeisein.',
   accent:'#d2ff68',micro:'FREQUENCY AFTER DARK',
   notes:['Ultraviolet & acid-lime nightlife identity','Club-poster typography and glow without noise','Social-first, rhythmic movement and night districts']
 },
 archive:{
   number:'03',name:'STADTARCHIV',kind:'CULTURAL / EDITORIAL / ART',tagline:'Die Stadt, anders gelesen.',
   hero:['DIE STADT','IST EINE','GESCHICHTE.'],body:'Orte mit Charakter. Geschichten, die bleiben. Deine Perspektive auf Frankfurt.',
   accent:'#3754bc',micro:'A CURATED FRANKFURT',
   notes:['Ultramarine, archival ivory, mustard-yellow','High-contrast editorial serif with print-grid rigor','Museum-grade typographic compositions and cultural context']
 }
};
const directions:Direction[]=['signal','night','archive'];

export default function BrandLab(){
 const [selected,setSelected]=useState<Direction>('signal');
 const [device,setDevice]=useState<'desktop'|'mobile'>('desktop');
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const concept=params.get('concept');
  if(concept==='night'||concept==='archive'||concept==='signal')setSelected(concept);
 },[]);
 const change=(dir:Direction)=>{setSelected(dir);window.history.replaceState({},'',dir==='signal'?'/brand-lab':'/brand-lab?concept='+dir)};
 const c=concepts[selected];
 return <main className="brandlab">
   <div className="brandlab-toolbar"><a href="/"><ArrowLeft size={16}/> FFM AKTUELL / LIVE SITE</a><span>IDENTITY EXPERIMENTS — 2026 / 001</span><span>DESIGN DEPARTMENT</span></div>
   <header className="brandlab-head"><div><small>BRAND LAB / FRANKFURT AM MAIN</small><h1>NOT JUST<br/>ANOTHER CITY.</h1></div><p>Drei echte visuelle Richtungen für dieselbe Idee. Jede besitzt eine eigene Typografie, Farbdramaturgie, Bewegungslogik und Bildsprache. Die Startseite verwendet aktuell <strong>SIGNAL / 069</strong>.</p></header>
   <nav className="brandlab-controls" aria-label="Choose visual direction">{directions.map(id=><button className={'brandlab-tab'+(selected===id?' active':'')} key={id} onClick={()=>change(id)} aria-pressed={selected===id}><div><small>{concepts[id].number} / {concepts[id].kind}</small><b>{concepts[id].name}</b></div><i>{selected===id?'●':'↗'}</i></button>)}</nav>
   <div className="brandlab-stage-wrap">
    <div className="brandlab-stage-caption"><div><strong>{c.number} /</strong> {c.name} — {c.tagline}</div><div className="brandlab-device-row" role="group" aria-label="Preview screen size"><button aria-pressed={device==='desktop'} className={device==='desktop'?'active':''} onClick={()=>setDevice('desktop')}><Monitor size={14}/></button><button aria-pressed={device==='mobile'} className={device==='mobile'?'active':''} onClick={()=>setDevice('mobile')}><Smartphone size={14}/></button></div></div>
    <div className={'brandlab-view '+device}>
     <div className={'brandlab-mock brandlab-'+selected}>
      <div className="brandlab-mocktop">
       <div className="brandlab-mockbrand"><svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><rect width="40" height="40" fill={c.accent}/><path d="M9 9h23M9 9v22M9 19h18M25 19v12" stroke="#18191b" strokeWidth="4" fill="none"/></svg><div><strong>FFM AKTUELL</strong><small>FRANKFURT AM MAIN</small></div></div>
       <span>ENTDECKEN &nbsp; / &nbsp; JOURNAL &nbsp; / &nbsp; ≡</span>
      </div>
      <section className="brandlab-mockhero">
       <div className="brandlab-mockcopy">
        <small>✳ &nbsp; {c.micro}</small>
        <h2>{c.hero.map((word,i)=><span key={i}>{word}{i<c.hero.length-1?<br/>:null}</span>)}</h2>
        <p>{c.body}</p>
        <div className="brandlab-mockchip">FRANKFURT ENTDECKEN <ArrowUpRight size={18}/></div>
       </div>
       <div className="brandlab-mockvisual"><span>{selected==='archive'?'FFM':selected==='night'?'N°69':'069'}</span></div>
      </section>
      <div className="brandlab-mockinfo"><span>01 / EXPLORE YOUR CITY</span><span>50°06'N / 08°41'E</span></div>
      <div className="brandlab-mocktiles"><div><small>01 / DISCOVER</small><span>{selected==='archive'?'STADTKULTUR':selected==='night'?'AFTER DARK':'ORTE MIT CHARAKTER'}</span></div><div><small>02 / THE CITY FEED</small><span>{selected==='night'?'TONIGHT / LIVE':'HEUTE IN FRANKFURT'}</span></div><div><small>03 / COMMUNITY</small><span>DEINE PERSPEKTIVE ↗</span></div></div>
     </div>
    </div>
    <div className="brandlab-stage-footer">{c.notes.map((note,i)=><div key={i}><small>{String(i+1).padStart(2,'0')} / DESIGN PRINCIPLE</small><p>{note}</p></div>)}</div>
    <div style={{display:'flex',gap:15,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',borderTop:'1px solid #c6c6bb',marginTop:38,paddingTop:20}}>
      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:'#5b5e5c'}}>Aktive Hauptseite: SIGNAL / 069</span>
      <a href="/" style={{display:'inline-flex',gap:17,alignItems:'center',padding:'15px 19px',background:'#17191b',color:'#fff',fontSize:12,fontWeight:700}}>LIVE WEBSITE ANSEHEN <ArrowUpRight size={17}/></a>
    </div>
   </div>
 </main>;
}
