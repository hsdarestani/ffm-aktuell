'use client';

import dynamic from 'next/dynamic';
import {useState,type FormEvent} from 'react';
import {Bookmark,CalendarDays,Compass,MapPin,Plus,Search,Users} from 'lucide-react';
import type {AtlasPlace} from '@/components/Atlas3D';
import {ortsbild} from '@/lib/vorschau';

const Atlas3D=dynamic(()=>import('@/components/Atlas3D'),{ssr:false,loading:()=> <div className="atlas-shell-placeholder"><span>FRANKFURT WIRD GELADEN</span></div>});
type RichAtlasPlace=AtlasPlace&{image_url?:string|null,demo?:boolean};
type Event={id:string;title:string;venue:string;starts_at:string;demo?:boolean;image_url?:string};
type News={id:string;title:string;published_at:string;demo?:boolean;image_url?:string;body_de?:string};
type Props={lang:'de'|'en';places:RichAtlasPlace[];events:Event[];news:News[];onDiscover:()=>void;onMap:()=>void;onEvents:()=>void;onCommunity:()=>void;onBusiness:()=>void;onPlace:(id:string)=>void;onCategory:(category:string)=>void;onSearch:(query:string)=>void};
const labels={
 de:{intro:'DEIN FRANKFURT. NEU ENTDECKT.',title:'Die Stadt gehört dir.',sub:'Orte, die bleiben. Momente, die bewegen.',search:'Was möchtest du entdecken?',categories:['Essen & Trinken','Kultur','Draußen','Sehenswürdigkeiten'],all:'Alle Orte',featured:'Für deinen nächsten Stadtmoment.',featuredIntro:'Ausgewählte Orte. Direkt aus Frankfurt.',open:'Entdecken',location:'STADTTEIL',empty:'Bald noch mehr besondere Orte.',journal:'Die Stadt passiert jetzt.',journalSub:'Erlebnisse, Geschichten und Ereignisse.',events:'Veranstaltungen',news:'Stadtgeschichten',none:'Neue Inhalte folgen.',more:'Alle Veranstaltungen',community:'Gemeinsam Frankfurt entdecken.',communitySub:'Erlebnisse teilen. Neue Lieblingsorte finden.',join:'Zur Community',business:'Dein Geschäft. Unsere Stadt.',businessSub:'Mach deinen Ort für ganz Frankfurt sichtbar.',partner:'Für Unternehmen'},
 en:{intro:'YOUR FRANKFURT. REDISCOVERED.',title:'This city is yours.',sub:'Places worth keeping. Moments worth sharing.',search:'What would you like to discover?',categories:['Food & drink','Culture','Outdoors','Landmarks'],all:'All places',featured:'Your next city moment.',featuredIntro:'Selected places from Frankfurt.',open:'Discover',location:'DISTRICT',empty:'More remarkable places are on their way.',journal:'The city is happening.',journalSub:'Experiences, stories and events.',events:'Events',news:'City stories',none:'More stories coming soon.',more:'All events',community:'Discover Frankfurt together.',communitySub:'Share experiences. Find new favorite places.',join:'Explore community',business:'Your business. Your city.',businessSub:'Put your place on the map.',partner:'For businesses'}
};
const CAT_KEYS=['Restaurants','Kultur','Natur','Sehenswürdigkeiten'];
function formatDate(v:string,lang:'de'|'en'){const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleDateString(lang==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short'});}
export default function AtlasHome({lang,places,events,news,onDiscover,onMap,onEvents,onCommunity,onBusiness,onPlace,onCategory,onSearch}:Props){
 const t=labels[lang];
 const [query,setQuery]=useState('');
 const search=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSearch(query.trim())};
 return <main className="atlas-home">
  <div className="atlas-home-stage">
   <Atlas3D places={places} lang={lang} variant="hero" onSelect={onPlace}/>
   <div className="atlas-home-map-link"><button onClick={onMap}><Compass size={16}/>{lang==='de'?'Atlas im Vollbild':'Full-size atlas'}<span className="atlas-link-dot"/></button></div>
  </div>
  <section className="atlas-home-intro">
   <div><span className="atlas-editorial-index">01 / FFM AKTUELL</span><h1>{t.title}</h1><p>{t.sub}</p></div>
   <div className="atlas-home-searchbox"><form onSubmit={search} role="search"><Search size={21}/><label htmlFor="atlas-home-search" className="sr-only">{t.search}</label><input id="atlas-home-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/><button type="submit" aria-label={t.search}><span className="atlas-action-mark"/></button></form><div className="atlas-home-prompt">{CAT_KEYS.map((c,i)=><button key={c} onClick={()=>onCategory(c)}>{t.categories[i]}<Plus size={15}/></button>)}</div></div>
  </section>
  <section className="atlas-home-editorial">
   <header className="atlas-home-heading"><div><span className="atlas-editorial-index">02 / ENTDECKEN UND STAUNEN</span><h2>{t.featured}</h2><p>{t.featuredIntro}</p></div><button onClick={onDiscover}>{t.all}<span className="atlas-action-mark"/></button></header>
   {places.length?<div className="atlas-home-place-grid">{places.slice(0,4).map((p,i)=><button key={p.id} className="atlas-home-place" onClick={()=>onPlace(p.id)}><div className="atlas-home-place-art"><img src={ortsbild(p.name,p.image_url)} loading="lazy" alt="Stimmungsbild aus Frankfurt"/><span>{String(i+1).padStart(2,'0')}</span><span className="atlas-home-place-district">{p.district||'Frankfurt'}</span><small className="v3-photo-note">Stimmungsbild</small></div><div className="atlas-home-place-info"><small>{p.demo?'MUSTERORT · ':''}{p.category}</small><strong>{p.name}</strong><span>{t.open}<span className="atlas-action-mark"/></span></div></button>)}</div>:<p>{t.empty}</p>}
  </section>
  <section className="atlas-home-stories">
   <div className="atlas-home-stories-heading"><span className="atlas-editorial-index">03 / STADTJOURNAL</span><h2>{t.journal}</h2><p>{t.journalSub}</p></div>
   <div className="atlas-home-stories-list"><div className="atlas-home-story-head"><CalendarDays size={18}/><strong>{t.events}</strong></div>{events.length?events.slice(0,3).map(ev=><button key={ev.id} onClick={onEvents} className="atlas-story"><span>{formatDate(ev.starts_at,lang)}</span><strong>{ev.title}{ev.demo&&<small className="v3-demo-label">Mustertermin</small>}</strong><span className="atlas-action-mark"/></button>):<p>{t.none}</p>}<button className="atlas-home-all-events" onClick={onEvents}>{t.more}<span className="atlas-action-mark"/></button></div>
  </section>
  <section className="v3-home-journal"><div className="v3-home-journal-header"><span className="v3-eyebrow">FRANKFURT LESEN</span><h2>Die Stadt erzählt.</h2><p>Neue Perspektiven und kleine Geschichten.</p></div><div className="v3-home-news-grid">{news.slice(0,3).map(n=><button key={n.id} className="v3-home-news-card" onClick={onEvents}><div><img src={ortsbild('',n.image_url)} alt="Stimmungsbild aus Frankfurt" loading="lazy"/><span>Stimmungsbild</span></div><small>{n.demo?'MUSTERBEITRAG':'STADTGESCHICHTE'}</small><h3>{n.title}</h3><p>{n.body_de}</p></button>)}</div></section>
  <section className="atlas-home-bottomrow">
   <div><span className="atlas-editorial-index">04 / MITEINANDER</span><h2>{t.community}</h2><p>{t.communitySub}</p><button onClick={onCommunity}>{t.join}<span className="atlas-action-mark"/></button></div>
   <div><span className="atlas-editorial-index">05 / LOKALE UNTERNEHMEN</span><h2>{t.business}</h2><p>{t.businessSub}</p><button onClick={onBusiness}>{t.partner}<span className="atlas-action-mark"/></button></div>
  </section>
 </main>;
}
