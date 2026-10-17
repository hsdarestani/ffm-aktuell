'use client';

import {useState,type FormEvent} from 'react';
import {ArrowRight,ArrowUpRight,MapPin,Search,CalendarDays,BookOpen,Compass} from 'lucide-react';

type Place={
 id:string;name:string;category:string;district:string;
 description_de:string;description_en:string;address:string;
};
type Event={id:string;title:string;venue:string;starts_at:string};
type News={id:string;title:string;published_at:string};
type Props={
 lang:'de'|'en';places:Place[];events:Event[];news:News[];
 onDiscover:()=>void;onMap:()=>void;onEvents:()=>void;
 onCommunity:()=>void;onBusiness:()=>void;onPlace:(id:string)=>void;
 onCategory:(category:string)=>void;onSearch:(query:string)=>void;
};
const copy={
 de:{
 eyebrow:'Dein Stadtguide für Frankfurt',title1:'Frankfurt.',title2:'Immer wieder neu.',
 intro:'Die schönsten Seiten der Stadt entdecken. Orte, Menschen und Geschichten, die Frankfurt besonders machen.',
 search:'Was möchtest du entdecken?',searchAction:'Suchen',photo:'Ein Blick auf Frankfurt am Main',
 photoCredit:'Stadtfotografie · Unsplash',
 index:'Eine Stadt. Viele Perspektiven.',indexSub:'Ob ein neuer Lieblingsort oder ein vertrauter Klassiker: Hier beginnt deine nächste Entdeckung.',
 explore:'Orte entdecken',categoriesTitle:'Entdecke nach Interesse',categoriesSub:'Was passt heute zu dir?',
 curated:'Orte, die es wert sind.',curatedSub:'Ein kleiner Anfang. Mit der Zeit wird daraus dein persönlicher Frankfurt-Guide.',
 allPlaces:'Alle Orte ansehen',placeAction:'Ort ansehen',neighborhood:'Stadtteil',
 journal:'Aus Frankfurt.',journalSub:'Aktuelle Veranstaltungen und Geschichten aus deiner Stadt.',
 events:'Veranstaltungen',news:'Stadtgeschichten',allEvents:'Zum Stadtjournal',
 emptyEvent:'Noch keine bestätigten Veranstaltungen veröffentlicht.',
 emptyNews:'Die ersten redaktionellen Beiträge folgen.',
 more:'Mehr entdecken',quote:'Frankfurt ist mehr als seine Skyline.',
 quoteBody:'Eine Stadt voller kleiner Entdeckungen, spannender Viertel und neuer Perspektiven.',
 community:'Deine Sicht auf Frankfurt.',communityBody:'Teile deine Entdeckungen und erfahre, was andere an dieser Stadt lieben.',
 communityCta:'Zur Community',business:'Ein Ort für lokale Unternehmen.',businessBody:'Mach dein Unternehmen für Menschen sichtbar, die Frankfurt neu entdecken möchten.',
 businessCta:'Für Unternehmen',end:'Mit Liebe zu Frankfurt. Unabhängig entdecken.',
 categories:[['Restaurants','Essen & Trinken','Restaurants'],['Kultur','Kunst & Kultur','Kultur'],['Natur','Draußen sein','Natur'],['Sehenswürdigkeiten','Besondere Orte','Sehenswürdigkeiten']]
 },
 en:{
 eyebrow:'Your personal guide to Frankfurt',title1:'Frankfurt.',title2:'Always something new.',
 intro:'Discover the best of the city. Places, people and stories that make Frankfurt worth exploring.',
 search:'What would you like to discover?',searchAction:'Search',photo:'A view of Frankfurt am Main',
 photoCredit:'City photography · Unsplash',
 index:'One city. Many perspectives.',indexSub:'A new favorite or a familiar classic. Your next discovery starts here.',
 explore:'Explore places',categoriesTitle:'Explore by interest',categoriesSub:'What feels right today?',
 curated:'Places worth your time.',curatedSub:'A thoughtful beginning. Over time, your personal guide to Frankfurt.',
 allPlaces:'View all places',placeAction:'View place',neighborhood:'Neighborhood',
 journal:'From Frankfurt.',journalSub:'Events and stories from around the city.',
 events:'Events',news:'City stories',allEvents:'Explore the journal',
 emptyEvent:'No confirmed events have been published yet.',
 emptyNews:'The first editorial stories are coming soon.',
 more:'Discover more',quote:'Frankfurt is more than its skyline.',
 quoteBody:'A city of small discoveries, remarkable neighborhoods and fresh perspectives.',
 community:'Your perspective on Frankfurt.',communityBody:'Share what you discover and see what others love about this city.',
 communityCta:'Join the community',business:'A place for local businesses.',businessBody:'Help people who are discovering Frankfurt find your business.',
 businessCta:'For businesses',end:'Made for Frankfurt. Independently discovered.',
 categories:[['Restaurants','Food & drink','Restaurants'],['Kultur','Art & culture','Culture'],['Natur','Outdoors','Nature'],['Sehenswürdigkeiten','Places to see','Sights']]
 }
};
function displayDate(date:string,lang:'de'|'en'){
 const d=new Date(date);
 return Number.isNaN(d.getTime())?'':d.toLocaleDateString(lang==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
export default function MinimalHome({lang,places,events,news,onDiscover,onMap,onEvents,onCommunity,onBusiness,onPlace,onCategory,onSearch}:Props){
 const t=copy[lang];
 const [term,setTerm]=useState('');
 const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSearch(term.trim());};
 return <main className="mh">
  <section className="mh-hero" aria-labelledby="mh-title">
   <div className="mh-hero-copy">
    <div className="mh-location"><span className="mh-location-dot"/><span>Frankfurt am Main</span><span className="mh-location-sep">/</span><span>{t.eyebrow}</span></div>
    <div className="mh-hero-message">
     <h1 id="mh-title"><span>{t.title1}</span><em>{t.title2}</em></h1>
     <p>{t.intro}</p>
     <form className="mh-search" onSubmit={submit} role="search">
      <label htmlFor="mh-search-term" className="sr-only">{t.search}</label>
      <Search size={20} strokeWidth={1.7} aria-hidden="true"/>
      <input id="mh-search-term" value={term} onChange={e=>setTerm(e.target.value)} placeholder={t.search} autoComplete="off"/>
      <button type="submit" aria-label={t.searchAction}><ArrowRight size={20}/></button>
     </form>
     <div className="mh-hero-links">
      <button onClick={onDiscover}>{t.explore}<ArrowUpRight size={16}/></button>
      <button onClick={onMap}><MapPin size={15}/>{lang==='de'?'Karte ansehen':'View map'}</button>
     </div>
    </div>
    <div className="mh-hero-bottom"><span>50° 06′ N &nbsp; 8° 41′ E</span><span>FFM / AKTUELL</span></div>
   </div>
   <figure className="mh-hero-visual">
     <img src="https://images.unsplash.com/photo-1661503847943-c6bb6a0101aa?auto=format&fit=crop&w=1500&q=85" alt={t.photo} loading="eager" fetchPriority="high" width="1300" height="1600"/>
     <figcaption><span>01 / {t.photo}</span><span>{t.photoCredit}</span></figcaption>
   </figure>
  </section>
  <div className="mh-divider"><div><span>FFM Aktuell</span><span className="mh-divider-line"/><span>{t.end}</span></div></div>

  <section className="mh-section mh-discover" aria-labelledby="mh-interests">
   <header className="mh-section-header">
    <div><span className="mh-eyebrow">01 &nbsp; / &nbsp; {lang==='de'?'Entdecken':'Discover'}</span><h2 id="mh-interests">{t.categoriesTitle}</h2><p>{t.categoriesSub}</p></div>
    <button className="mh-inline-link" onClick={onDiscover}>{t.allPlaces}<ArrowUpRight size={17}/></button>
   </header>
   <div className="mh-category-grid">{t.categories.map(([value,label,english],i)=><button key={value} onClick={()=>onCategory(value)} className="mh-category">
     <span className="mh-category-index">{String(i+1).padStart(2,'0')}</span>
     <span className="mh-category-name">{label}</span>
     <ArrowUpRight size={19} strokeWidth={1.6} aria-hidden="true"/>
   </button>)}</div>
  </section>

  <section className="mh-section mh-selection" aria-labelledby="mh-places">
   <header className="mh-section-header">
    <div><span className="mh-eyebrow">02 &nbsp; / &nbsp; {lang==='de'?'Ausgewählt':'Selected'}</span><h2 id="mh-places">{t.curated}</h2><p>{t.curatedSub}</p></div>
    <button className="mh-inline-link" onClick={onDiscover}>{t.allPlaces}<ArrowUpRight size={17}/></button>
   </header>
   {places.length?<div className="mh-place-grid">{places.slice(0,4).map((place,i)=><button key={place.id} className="mh-place" onClick={()=>onPlace(place.id)}>
    <div className="mh-place-top"><span>{String(i+1).padStart(2,'0')}</span><span><MapPin size={13}/>{place.district||'Frankfurt'}</span></div>
    <div className="mh-place-main">
     <span className="mh-place-category">{place.category}</span>
     <h3>{place.name}</h3>
     <p>{lang==='de'?place.description_de||place.description_en:place.description_en||place.description_de}</p>
    </div>
    <span className="mh-place-bottom">{t.placeAction}<ArrowUpRight size={17}/></span>
   </button>)}</div>:<p className="mh-empty">{lang==='de'?'Die ersten Orte werden vorbereitet.':'The first places are being prepared.'}</p>}
  </section>

  <section className="mh-photo-note" aria-labelledby="mh-photo-title">
   <div className="mh-photo-note-image" role="img" aria-label={lang==='de'?'Frankfurter Straßen und Architektur':'Frankfurt streets and architecture'}/>
   <div className="mh-photo-note-copy">
    <span className="mh-eyebrow">Frankfurt am Main</span>
    <h2 id="mh-photo-title">{t.quote}</h2>
    <p>{t.quoteBody}</p>
    <button className="mh-inline-link" onClick={onDiscover}>{t.more}<ArrowUpRight size={18}/></button>
   </div>
  </section>

  <section className="mh-section mh-journal" aria-labelledby="mh-journal">
   <header className="mh-section-header">
    <div><span className="mh-eyebrow">03 &nbsp; / &nbsp; Journal</span><h2 id="mh-journal">{t.journal}</h2><p>{t.journalSub}</p></div>
    <button className="mh-inline-link" onClick={onEvents}>{t.allEvents}<ArrowUpRight size={17}/></button>
   </header>
   <div className="mh-journal-grid">
     <div className="mh-journal-column">
      <div className="mh-journal-title"><CalendarDays size={19} strokeWidth={1.5}/><h3>{t.events}</h3></div>
      {events.length?events.slice(0,3).map(event=><button key={event.id} className="mh-journal-row" onClick={onEvents}>
       <time dateTime={event.starts_at}>{displayDate(event.starts_at,lang)}</time>
       <span><strong>{event.title}</strong><small>{event.venue}</small></span><ArrowUpRight size={17}/>
      </button>):<p className="mh-journal-empty">{t.emptyEvent}</p>}
     </div>
     <div className="mh-journal-column">
      <div className="mh-journal-title"><BookOpen size={19} strokeWidth={1.5}/><h3>{t.news}</h3></div>
      {news.length?news.slice(0,3).map(item=><button key={item.id} className="mh-journal-row" onClick={onEvents}>
       <time dateTime={item.published_at}>{displayDate(item.published_at,lang)}</time><span><strong>{item.title}</strong></span><ArrowUpRight size={17}/>
      </button>):<p className="mh-journal-empty">{t.emptyNews}</p>}
     </div>
   </div>
  </section>

  <section className="mh-community">
   <div className="mh-community-item"><span className="mh-eyebrow">04 &nbsp; / &nbsp; Community</span><h2>{t.community}</h2><p>{t.communityBody}</p><button className="mh-inline-link" onClick={onCommunity}>{t.communityCta}<ArrowUpRight size={17}/></button></div>
   <div className="mh-community-item"><span className="mh-eyebrow">05 &nbsp; / &nbsp; Local business</span><h2>{t.business}</h2><p>{t.businessBody}</p><button className="mh-inline-link" onClick={onBusiness}>{t.businessCta}<ArrowUpRight size={17}/></button></div>
  </section>
 </main>;
}
