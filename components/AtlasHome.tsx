'use client';
import {useUiText} from '@/lib/ui-locale';

import {useState,useEffect,Fragment,type ReactNode,type FormEvent} from 'react';
import {CalendarDays,ChevronRight,Coffee,Compass,MapPin,Search,UtensilsCrossed,Martini,Ticket,Activity,Pill,Map as MapIcon,CheckCircle2} from 'lucide-react';
import {defaultHomeLayout,validHomeLayout,type HomeModule} from '@/lib/home-layout';
import type {AtlasPlace} from '@/components/Atlas3D';
import {frischBestaetigt} from '@/lib/ortskategorien';
import {ortsbild} from '@/lib/vorschau';

type RichAtlasPlace=AtlasPlace&{image_url?:string|null;demo?:boolean;verification_status?:'verified'|'unverified'|'disputed';activity_status?:'operating'|'unknown'|'temporarily_closed'|'permanently_closed';verified_at?:string|null};
type Event={id:string;title:string;venue:string;starts_at:string;demo?:boolean;image_url?:string};
type News={id:string;title:string;published_at:string;demo?:boolean;image_url?:string;body_de?:string};
type Props={tips?:ReactNode;assistant?:ReactNode;lang:'de'|'en';places:RichAtlasPlace[];events:Event[];news:News[];onDiscover:()=>void;onMap:()=>void;onEvents:()=>void;onCommunity:()=>void;onBusiness:()=>void;onPlace:(id:string)=>void;onCategory:(category:string)=>void;onSearch:(query:string)=>void;onTours:()=>void};

const needs=[
 {id:'Cafés',label:'Café trinken',icon:Coffee,color:'cream'},
 {id:'Restaurants',label:'Essen gehen',icon:UtensilsCrossed,color:'mint'},
 {id:'Bars',label:'Bars entdecken',icon:Martini,color:'rose'},
 {id:'Freizeit',label:'Etwas erleben',icon:Activity,color:'yellow'},
 {id:'Museen',label:'Kultur erleben',icon:Ticket,color:'blue'},
 {id:'Apotheken',label:'Apotheke finden',icon:Pill,color:'sage'}
] as const;
function germanDate(value:string,locale:'de'|'en'){const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(locale==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short'});}
export default function AtlasHome({tips,assistant,lang,places,events,news,onDiscover,onMap,onEvents,onCommunity,onBusiness,onPlace,onCategory,onSearch,onTours}:Props){
 const ui=useUiText();
 const [query,setQuery]=useState('');
 const [layout,setLayout]=useState<HomeModule[]>(defaultHomeLayout);useEffect(()=>{const c=new AbortController();fetch('/api/home-layout',{signal:c.signal,cache:'no-store'}).then(r=>r.json()).then(d=>{if(validHomeLayout(d.modules))setLayout(d.modules)}).catch(()=>{});return()=>c.abort()},[]);
 const confirmed=places.filter(p=>frischBestaetigt(p));
 const upcoming=events.filter(ev=>!ev.demo&&new Date(ev.starts_at).getTime()>Date.now()).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
 const search=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSearch(query.trim())};
 const modules:Record<string,ReactNode>={tips,assistant,choices:(<section className="ffm-quick-choices ffm-quick-container" aria-labelledby="ffm-quick-choose">
   <div className="ffm-quick-section-heading"><div><span className="ffm-quick-eyebrow">{lang==='de'?ui("DEIN NÄCHSTER SCHRITT"):ui("YOUR NEXT STEP")}</span><h2 id="ffm-quick-choose">{lang==='de'?ui("Worauf hast du Lust?"):ui("What sounds good?")}</h2></div><span className="ffm-quick-help">{lang==='de'?ui("Einmal tippen. Direkt zu den Orten."):ui("One tap. Straight to the places.")}</span></div>
   <div className="ffm-quick-grid">
    {needs.map(n=><button key={n.id} type="button" className={'ffm-quick-option '+n.color} onClick={()=>onCategory(n.id)}>
     <span className="ffm-quick-option-icon"><n.icon size={24} strokeWidth={1.9}/></span><span>{lang==='de'?n.label:({Cafés:'Find a café',Restaurants:'Go out to eat',Bars:'Find a bar',Freizeit:'Things to do',Museen:'Explore culture',Apotheken:'Find a pharmacy'} as Record<string,string>)[n.id]}</span><ChevronRight size={17} className="ffm-quick-option-go"/>
    </button>)}
   </div>
   <div className="ffm-quick-secondary-actions">
    <button type="button" onClick={onDiscover}>{lang==='de'?ui("Alle Kategorien ansehen"):ui("Explore all categories")} <ChevronRight size={16}/></button>
    <button type="button" onClick={onMap}><MapIcon size={17}/> {lang==='de'?ui("Auf der Karte suchen"):ui("Explore the map")}</button>
    <button type="button" onClick={onEvents}><CalendarDays size={17}/> {lang==='de'?ui("Veranstaltungen"):ui("Events")}</button>
    <button type="button" onClick={onTours}>{lang==='de'?ui("Touren entdecken"):ui("Explore walking tours")} <ChevronRight size={16}/></button>
   </div>
  </section>),highlights:(<section className="ffm-quick-next ffm-quick-container" aria-labelledby="ffm-quick-upcoming">
   <div className="ffm-quick-section-heading"><div><span className="ffm-quick-eyebrow">{lang==='de'?ui("AUS FRANKFURT"):ui("FROM FRANKFURT")}</span><h2 id="ffm-quick-upcoming">{lang==='de'?ui("Das könnte dich interessieren."):ui("You might enjoy these.")}</h2></div></div>
   <div className="ffm-quick-highlights">
    <div className="ffm-quick-feature-block">
     <div className="ffm-quick-feature-heading"><MapPin size={18}/><h3>{lang==='de'?ui("Geprüfte Orte"):ui("Verified places")}</h3></div>
     {confirmed.length?
      <div className="ffm-quick-item-list">{confirmed.slice(0,3).map(p=><button key={p.id} onClick={()=>onPlace(p.id)} className="ffm-quick-list-item"><span><strong>{p.name}</strong><small>{p.category} · {p.district||'Frankfurt'}</small></span><ChevronRight size={18}/></button>)}</div>:
      <div className="ffm-quick-empty"><p>{lang==='de'?ui("Hier entstehen Empfehlungen mit geprüften Quellen."):ui("Verified local recommendations are coming here.")}</p><button onClick={onDiscover}>{lang==='de'?ui("Orte aus Frankfurt finden"):ui("Explore Frankfurt places")} <ChevronRight size={16}/></button><small>{lang==='de'?ui("Weitere Einträge sind derzeit noch nicht auf ihren Betriebsstatus geprüft."):ui("Other listings have not yet been checked for current operating status.")}</small></div>
     }
    </div>
    <div className="ffm-quick-feature-block">
     <div className="ffm-quick-feature-heading"><CalendarDays size={18}/><h3>{lang==='de'?ui("Veranstaltungen"):ui("Events")}</h3></div>
     {upcoming.length?<div className="ffm-quick-item-list">{upcoming.slice(0,3).map(ev=><button key={ev.id} type="button" onClick={onEvents} className="ffm-quick-list-item"><span><strong>{ev.title}</strong><small>{germanDate(ev.starts_at,ui.locale)} · {ev.venue}</small></span><ChevronRight size={18}/></button>)}</div>:
      <div className="ffm-quick-empty"><p>{lang==='de'?ui("Hier erscheinen bestätigte Veranstaltungen."):ui("Confirmed events will appear here.")}</p><button onClick={onEvents}>{lang==='de'?ui("Zu den Veranstaltungen"):ui("View events")} <ChevronRight size={16}/></button><small>{lang==='de'?ui("Beispieltermine sind keine buchbaren Events."):ui("Sample dates are not bookable events.")}</small></div>}
    </div>
   </div>
  </section>),community:(<section className="ffm-quick-quiet ffm-quick-container" aria-label={ui("Mehr Frankfurt")}>
   <div><Compass size={23}/><h2>{lang==='de'?ui("Frankfurt hat noch mehr zu bieten."):ui("There is more to Frankfurt.")}</h2><p>{lang==='de'?ui("Entdecke die Stadt auf deine Weise – oder teile deine Lieblingsorte."):ui("Explore the city your way, or share your favourite places.")}</p></div>
   <div className="ffm-quick-quiet-actions"><button onClick={onCommunity}>{lang==='de'?ui("Miteinander entdecken"):ui("Explore together")} <ChevronRight size={17}/></button><button onClick={onBusiness}>{lang==='de'?ui("Für Unternehmen"):ui("For businesses")} <ChevronRight size={17}/></button></div>
  </section>),news:(news.length>0&&<details className="ffm-quick-extras ffm-quick-container"><summary>{lang==='de'?ui("Stadtgeschichten ansehen"):ui("See stories from the city")} <ChevronRight size={16}/></summary>
   <div className="v3-home-news-grid" aria-label={ui("03 / STADTJOURNAL")}>{news.slice(0,3).map(n=><article key={n.id} className="ffm-quick-news"><img src={ortsbild('',n.image_url)} loading="lazy" alt={ui("Stimmungsbild aus Frankfurt")}/><div><small>{n.demo?'MUSTERBEITRAG':'STADTGESCHICHTE'}</small><strong>{n.title}</strong></div></article>)}</div>
  </details>)};
 return <main className="ffm-quick-home">
  <section className="ffm-quick-hero" aria-labelledby="quick-home-title">
   <div className="ffm-quick-container">
    <div className="ffm-quick-hero-top"><span className="ffm-quick-eyebrow"><span className="ffm-quick-spark"/> {lang==='de'?ui("DEIN FRANKFURT. GANZ EINFACH."):ui("YOUR FRANKFURT. MADE EASY.")}</span><span className="ffm-quick-geo">{ui("50°06′ N · 8°40′ O")}</span></div>
    <h1 id="quick-home-title">{lang==='de'?<>{ui("Was hast du ")}<em>{ui("heute")}</em> {ui(" vor?")}</>:<>{ui("What are you doing ")}<em>{ui("today")}</em>?</>}</h1>
    <p>{lang==='de'?ui("Entdecke Cafés, Restaurants, Aktivitäten und Lieblingsorte in Frankfurt. Ohne langes Suchen."):ui("Find cafés, restaurants, activities and favourite places in Frankfurt. Without endless searching.")}</p>
    <form onSubmit={search} role="search" className="ffm-quick-search">
     <Search size={22} strokeWidth={1.8} aria-hidden="true"/>
     <label className="sr-only" htmlFor="atlas-home-search">{lang==='de'?ui("Ort, Aktivität oder Stadtteil suchen"):ui("Find a place, activity or district")}</label>
     <input id="atlas-home-search" autoComplete="off" value={query} onChange={e=>setQuery(e.target.value)} placeholder={lang==='de'?ui("Wonach suchst du?"):ui("What are you looking for?")} enterKeyHint="search"/>
     <button type="submit">{lang==='de'?ui("Finden"):ui("Find")} <ChevronRight size={20}/></button>
    </form>
    <div className="ffm-quick-hero-note"><CheckCircle2 size={15}/> {lang==='de'?ui("Ortsdaten transparent gekennzeichnet. Öffnungszeiten bitte beim Anbieter prüfen."):ui("Every venue is marked with its verification status. Confirm opening hours with the venue.")}</div>
   </div>
   <div className="ffm-quick-horizon" aria-hidden="true">
    <svg viewBox="0 0 1400 200" preserveAspectRatio="xMidYMax slice">
     <path fill="#bed7c6" d="M0 200v-65h70V98h44v102h38V66h34v134h35V89h31v111h27V35h40v165h15V109h42v91h24V73h40v127h29V98h45v102h25V20h49v180h26V94h44v106h38V49h37v151h36V121h56v79h38V64h43v136h26V30h42v170h44V80h41v120h31v-55h41v55h34V76h53v124h33V102h41v98h62V90h38v110h43V64h37v136h48V200z" opacity=".58"/>
     <path fill="#82aa96" d="M0 200v-35h60V146h45v54h53v-80h24v80h78V108h24v92h40v-99h35v99h52V155h58v45h49V88h31v112h38V147h43v53h65V133h26v67h47V90h26v110h63V148h34v52h49V110h23v90h67V155h56v45h46V100h27v100h65V129h50v71h67V160h57v40h64V135h45v65z" opacity=".55"/>
     <path d="M528 19V3M859 28V2M310 35V6" stroke="#32664f" strokeWidth="3"/>
    </svg>
   </div>
  </section>

  {layout.filter(m=>m.enabled).map(m=><Fragment key={m.code}>{modules[m.code]}</Fragment>)}
 </main>;
}

