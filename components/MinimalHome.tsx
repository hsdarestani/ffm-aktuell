'use client';
import {useUiText} from '@/lib/ui-locale';

import {useState,type FormEvent} from 'react';
import {Search,MapPin,CalendarDays,BookOpen,Compass,Plus,Heart,Globe2} from 'lucide-react';

type Place={id:string;name:string;category:string;district:string;description_de:string;description_en:string;address:string};
type Event={id:string;title:string;venue:string;starts_at:string};
type News={id:string;title:string;published_at:string};
type Props={lang:'de'|'en';places:Place[];events:Event[];news:News[];onDiscover:()=>void;onMap:()=>void;onEvents:()=>void;onCommunity:()=>void;onBusiness:()=>void;onPlace:(id:string)=>void;onCategory:(category:string)=>void;onSearch:(q:string)=>void};

const labels={
 de:{
  label:'DEIN FRANKFURT. DEIN BLICK.',description:'Unabhängiger Stadtguide · Frankfurt am Main',
  lead:'Eine Stadt,',accent:'tausend Blickwinkel.',
  intro:'Die Orte, Menschen und Geschichten, die Frankfurt besonders machen. Sorgfältig ausgesucht, für das echte Leben in der Stadt.',
  discover:'Stadt entdecken',map:'Stadtkarte',search:'Was möchtest du entdecken?',searchButton:'Suche starten',
  sideLabel:'FRANKFURT AM MAIN',photo:'Am Main. Mitten im Leben.',photoCaption:'MAINUFER / FRANKFURT',location:'Zwischen zwei Ufern und tausend Geschichten.',
  section1:'EIN GUTER ANFANG',selection:'Wonach ist dir?',selectionSub:'Einfach losziehen. Wir zeigen dir, was Frankfurt zu bieten hat.',
  categoryLabels:[['Restaurants','Essen & Trinken'],['Kultur','Kunst & Kultur'],['Natur','Draußen'],['Sehenswürdigkeiten','Stadt erleben']],
  section2:'DIE AUSWAHL',placesTitle:'Besondere Orte.',placesSub:'Nicht alles auf einmal. Lieber die Orte, die einen zweiten Blick verdienen.',
  seeAll:'Alle Orte entdecken',open:'Ort entdecken',district:'STADTTEIL',noPlaces:'Neue Orte werden gerade redaktionell vorbereitet.',
  interludeTop:'EINE STADT. VIELE SEITEN.',interlude:'Frankfurt hat mehr als eine Skyline.',interludeText:'Manchmal reicht es, einmal anders abzubiegen. Die schönsten Geschichten stehen selten auf dem Stadtplan.',
  section3:'IMMER IN BEWEGUNG',storiesTitle:'Was die Stadt bewegt.',storiesSub:'Veranstaltungen, Gespräche und kleine Entdeckungen. Alles an einem Ort.',
  events:'Veranstaltungen',news:'Stadtnotizen',eventEmpty:'Hier erscheinen die nächsten bestätigten Veranstaltungen.',newsEmpty:'Neue Stadtnotizen folgen in Kürze.',
  readMore:'Stadtjournal öffnen',community:'Frankfurt gehört uns allen.',communityText:'Dein Lieblingscafé. Eine überraschende Ecke. Ein besonderer Moment. Teile deine Perspektive auf die Stadt.',
  join:'Community entdecken',partner:'Dein Unternehmen. Teil der Stadt.',partnerText:'Werde dort sichtbar, wo Frankfurterinnen und Frankfurter ihre nächsten Lieblingsorte suchen.',partners:'Für Unternehmen',
  rights:'Für die Stadt. Aus der Stadt.',photoSource:'Frankfurt am Main · Bild: Unsplash'
 },
 en:{
  label:'YOUR FRANKFURT. YOUR VIEW.',description:'Independent city guide · Frankfurt am Main',
  lead:'One city,',accent:'a thousand perspectives.',
  intro:'The places, people and stories that make Frankfurt worth knowing. Thoughtfully selected for real life in the city.',
  discover:'Explore the city',map:'City map',search:'What would you like to discover?',searchButton:'Start searching',
  sideLabel:'FRANKFURT AM MAIN',photo:'Life on the Main.',photoCaption:'RIVER MAIN / FRANKFURT',location:'Between two riverbanks and a thousand stories.',
  section1:'A GOOD PLACE TO START',selection:'What are you in the mood for?',selectionSub:'Start somewhere. Let the city surprise you.',
  categoryLabels:[['Restaurants','Food & drink'],['Kultur','Art & culture'],['Natur','Outdoors'],['Sehenswürdigkeiten','Discover the city']],
  section2:'THE EDIT',placesTitle:'Places with character.',placesSub:'Not everything at once. Just the places worth a second look.',
  seeAll:'Discover all places',open:'Discover place',district:'NEIGHBORHOOD',noPlaces:'New places are being prepared by our editorial team.',
  interludeTop:'ONE CITY. MANY STORIES.',interlude:'Frankfurt is more than its skyline.',interludeText:'Sometimes all it takes is a different turn. The best stories rarely appear on a map.',
  section3:'ALWAYS MOVING',storiesTitle:'Around the city.',storiesSub:'Events, conversations and small discoveries. All in one place.',
  events:'Events',news:'City notes',eventEmpty:'The next confirmed events will appear here.',newsEmpty:'New editorial stories are coming soon.',
  readMore:'Open city journal',community:'Frankfurt belongs to all of us.',communityText:'Your favorite café. A surprising corner. A special moment. Share your perspective on the city.',
  join:'Explore community',partner:'Your business. Part of the city.',partnerText:'Be there when Frankfurt locals discover their next favorite place.',partners:'For businesses',
  rights:'For the city. From the city.',photoSource:'Frankfurt am Main · Photo: Unsplash'
 }
};

function Mainlinie({className=''}:{className?:string}){
 return <svg aria-hidden="true" className={'ml-river '+className} viewBox="0 0 520 88" fill="none"><path d="M3 63C91 3 146 8 206 40C261 70 303 84 371 49C426 21 467 20 517 45" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="206" cy="40" r="4.5" fill="currentColor"/><circle cx="371" cy="49" r="4.5" fill="currentColor"/></svg>;
}
function localDate(date:string,lang:'de'|'en'){return new Date(date).toLocaleDateString(lang==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short'});}
function Accent(){return <span className="ml-dot" aria-hidden="true"/>;}

export default function MinimalHome({lang,places,events,news,onDiscover,onMap,onEvents,onCommunity,onBusiness,onPlace,onCategory,onSearch}:Props){
 const ui=useUiText();
 const t=labels[lang], [search,setSearch]=useState('');
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSearch(search.trim())};
 return <main className="ml">
   <section className="ml-hero" aria-labelledby="ml-hero-title">
    <div className="ml-hero-main">
     <div className="ml-overline"><span className="ml-overline-mark">{ui("ffm.")}</span><span>{t.description}</span></div>
     <div className="ml-hero-center">
      <span className="ml-eyebrow"><Accent/>{t.label}</span>
      <h1 id="ml-hero-title"><span>{t.lead}</span><em>{t.accent}</em></h1>
      <p className="ml-hero-intro">{t.intro}</p>
      <form className="ml-search" role="search" onSubmit={submit}>
       <label className="sr-only" htmlFor="ml-search-input">{t.search}</label>
       <Search size={18} strokeWidth={1.7}/>
       <input id="ml-search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.search}/>
       <button type="submit" title={t.searchButton} aria-label={t.searchButton}><span className="ml-search-submit-circle"><span/></span></button>
      </form>
      <div className="ml-hero-actions"><button className="ml-primary" onClick={onDiscover}><span>{t.discover}</span><span className="ml-primary-glyph"><Plus size={16} strokeWidth={1.6}/></span></button><button className="ml-text-action" onClick={onMap}><MapPin size={15} strokeWidth={1.6}/>{t.map}</button></div>
     </div>
     <div className="ml-hero-foot"><span>{ui("50.1109° N / 8.6821° E")}</span><span>{ui("EDITION 01 · 2026")}</span></div>
    </div>
    <div className="ml-hero-visual">
      <img src="https://images.unsplash.com/photo-1775127493662-2e0fb1138b9c?auto=format&fit=crop&w=1700&q=82" alt={lang==='de'?ui("Frankfurter Skyline hinter dem Main und der alten Brücke"):ui("Frankfurt skyline beyond the Main river and the old bridge")} width="1200" height="1500" fetchPriority="high"/>
      <div className="ml-photo-side">{t.sideLabel} <span>·</span> 069</div>
      <div className="ml-photo-caption"><span>{t.photoCaption}</span><span>01 / 04</span></div>
    </div>
   </section>

   <div className="ml-signet-strip"><div><span>{ui("FFM AKTUELL")}</span><Mainlinie/><span>{t.location}</span></div></div>

   <section className="ml-container ml-categories" aria-labelledby="ml-categories-title">
    <div className="ml-head-row">
     <div><div className="ml-kicker"><span>01</span><span>{t.section1}</span></div><h2 id="ml-categories-title">{t.selection}</h2><p>{t.selectionSub}</p></div>
     <span className="ml-head-counter">FRANKFURT<br/>{ui("AM MAIN")}</span>
    </div>
    <div className="ml-category-board">
      {t.categoryLabels.map(([key,label],i)=><button type="button" onClick={()=>onCategory(key)} key={key} className="ml-category-tile">
       <span className="ml-category-no">{String(i+1).padStart(2,'0')}</span>
       <span className="ml-category-name">{ui(label)}</span>
       <span className="ml-category-disc"><Plus size={15} strokeWidth={1.5}/></span>
      </button>)}
    </div>
   </section>

   <section className="ml-container ml-featured" aria-labelledby="ml-featured-title">
     <div className="ml-head-row">
       <div><div className="ml-kicker"><span>02</span><span>{t.section2}</span></div><h2 id="ml-featured-title">{t.placesTitle}</h2><p>{t.placesSub}</p></div>
       <button className="ml-underlined" onClick={onDiscover}>{t.seeAll}<Accent/></button>
     </div>
     {places.length?<div className="ml-place-list">{places.slice(0,4).map((p,i)=><button className="ml-place-row" key={p.id} onClick={()=>onPlace(p.id)}>
       <span className="ml-place-no">{String(i+1).padStart(2,'0')}</span>
       <span className="ml-place-title"><strong>{p.name}</strong><small>{p.category}</small></span>
       <span className="ml-place-district"><MapPin size={14} strokeWidth={1.5}/>{p.district||'Frankfurt am Main'}</span>
       <span className="ml-place-open"><span className="ml-open-circle"><Plus size={18} strokeWidth={1.5}/></span><span className="sr-only">{t.open}</span></span>
     </button>)}</div>:<div className="ml-empty">{t.noPlaces}</div>}
   </section>

   <section className="ml-photo-story" aria-labelledby="ml-interlude-title">
      <div className="ml-photo-story-img" role="img" aria-label={ui("Stadtleben in Frankfurt")}><div className="ml-image-index">{ui("FFM 02 / 04")}</div></div>
      <div className="ml-photo-story-words">
        <span className="ml-eyebrow"><Accent/>{t.interludeTop}</span>
        <h2 id="ml-interlude-title">{t.interlude}</h2>
        <Mainlinie/>
        <p>{t.interludeText}</p>
        <button className="ml-underlined" onClick={onDiscover}>{t.discover}<Accent/></button>
      </div>
   </section>

   <section className="ml-container ml-journal" aria-labelledby="ml-journal-title">
      <div className="ml-head-row">
       <div><div className="ml-kicker"><span>03</span><span>{t.section3}</span></div><h2 id="ml-journal-title">{t.storiesTitle}</h2><p>{t.storiesSub}</p></div>
       <button className="ml-underlined" onClick={onEvents}>{t.readMore}<Accent/></button>
      </div>
      <div className="ml-journal-grid">
        <div className="ml-journal-col">
         <div className="ml-journal-colhead"><CalendarDays size={17} strokeWidth={1.5}/>{t.events}</div>
         {events.length?events.slice(0,3).map((ev,i)=><button onClick={onEvents} key={ev.id} className="ml-story-row"><span className="ml-story-time">{localDate(ev.starts_at,lang)}</span><span><strong>{ev.title}</strong><small>{ev.venue}</small></span><Plus size={16} strokeWidth={1.4}/></button>):<p className="ml-empty-text">{t.eventEmpty}</p>}
        </div>
        <div className="ml-journal-col">
         <div className="ml-journal-colhead"><BookOpen size={17} strokeWidth={1.5}/>{t.news}</div>
         {news.length?news.slice(0,3).map((n,i)=><button onClick={onEvents} key={n.id} className="ml-story-row"><span className="ml-story-time">{localDate(n.published_at,lang)}</span><span><strong>{n.title}</strong></span><Plus size={16} strokeWidth={1.4}/></button>):<p className="ml-empty-text">{t.newsEmpty}</p>}
        </div>
      </div>
   </section>

   <section className="ml-ending">
     <div className="ml-ending-inner">
      <div className="ml-ending-tile"><div className="ml-kicker"><span>04</span><span>COMMUNITY</span></div><h2>{t.community}</h2><p>{t.communityText}</p><button className="ml-underlined" onClick={onCommunity}>{t.join}<Accent/></button></div>
      <div className="ml-ending-tile"><div className="ml-kicker"><span>05</span><span>{ui("LOKALE PARTNER")}</span></div><h2>{t.partner}</h2><p>{t.partnerText}</p><button className="ml-underlined" onClick={onBusiness}>{t.partners}<Accent/></button></div>
     </div>
     <div className="ml-ending-line"><Mainlinie/><span>{ui("MAINLINIE / FFM")}</span></div>
   </section>
 </main>;
}

