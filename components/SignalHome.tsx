'use client';

import {ArrowDownRight,ArrowRight,ArrowUpRight,CalendarDays,MapPin,Radio,MoveUpRight,Plus,Search,Signal,ScanLine,Ticket,Users} from 'lucide-react';

type Place = {
  id:string; name:string; category:string; district:string;
  description_de:string; description_en:string; address:string;
};
type Event = {id:string; title:string; venue:string; starts_at:string};
type News = {id:string; title:string; published_at:string};
type Deal = {id:string; title:string; business_name:string};
type Props = {
  lang:'de'|'en';
  places:Place[];
  events:Event[];
  news:News[];
  deals:Deal[];
  onDiscover:()=>void;
  onMap:()=>void;
  onEvents:()=>void;
  onCommunity:()=>void;
  onBusiness:()=>void;
  onPlace:(placeId:string)=>void;
  onCategory:(category:string)=>void;
};

const de = {
  live:'STADTFREQUENZ / FRANKFURT',scroll:'WEITER ENTDECKEN',
  chapter:'DEIN FRANKFURT. JEDEN TAG NEU.',line1:'DIE STADT',line2:'IST NICHT',line3:'STILL.',
  sub:'Nicht die nächste Liste. Dein direkter Draht zu den Orten, Ideen und Menschen, die Frankfurt bewegen.',
  cta:'STADT ENTDECKEN',map:'AUF DER KARTE',now:'FRANKFURT / JETZT',
  aside:'DU BIST HIER. ALLES ANDERE IST IN BEWEGUNG.',
  spots:'ORTE MIT CHARAKTER.',spotsSub:'Keine leeren Empfehlungen. Echte Orte. Echte Stadt.',
  all:'ALLE ORTE',open:'JETZT ENTDECKEN',handpicked:'KURATIERT FÜR DICH',
  editorial:'DIE STADT HAT WAS VOR.',editorialSub:'Termine, Geschichten und kleine große Entdeckungen.',
  events:'EVENTS',cityNews:'STADTNOTIZEN',emptyEvents:'Die nächsten bestätigten Events folgen.',
  emptyNews:'Neue Stadtgeschichten erscheinen hier.',
  note:'NICHTS VERPASSEN.',noteSub:'Frankfurt verändert sich jeden Tag. Entdecke, was dahintersteckt.',
  community:'STADT. MENSCHEN. STORIES.',communitySub:'Eine Stadt ist mehr als Adressen. Zeig, was sie für dich ausmacht.',
  communityCta:'COMMUNITY ERLEBEN',business:'DEIN BUSINESS. MITTENDRIN.',
  businessSub:'Dein Ort gehört auf den Radar. Werde Teil von FFM Aktuell.',
  businessCta:'FÜR UNTERNEHMEN',district:'IM VIERTEL',
  source:'Ortsinformationen ohne Gewähr. Aktuelle Zeiten beim Anbieter prüfen.',
  categories:[['Alle','ALLE'],['Kultur','KULTUR'],['Sehenswürdigkeiten','SPOTS'],['Natur','DRAUSSEN'],['Restaurants','FOOD'],['Bars','NACHTLEBEN']]
};
const en = {
  live:'CITY FREQUENCY / FRANKFURT',scroll:'SCROLL TO EXPLORE',
  chapter:'YOUR FRANKFURT. A NEW TAKE EVERY DAY.',line1:'THE CITY',line2:'NEVER',line3:'STANDS STILL.',
  sub:'Not another list. Your direct connection to the places, ideas and people moving Frankfurt forward.',
  cta:'EXPLORE THE CITY',map:'OPEN THE MAP',now:'FRANKFURT / NOW',
  aside:'YOU ARE HERE. EVERYTHING ELSE IS MOVING.',
  spots:'PLACES WITH CHARACTER.',spotsSub:'No empty recommendations. Real places. Real city.',
  all:'ALL PLACES',open:'DISCOVER THIS PLACE',handpicked:'CURATED FOR YOU',
  editorial:'THE CITY HAS PLANS.',editorialSub:'Events, stories and the little things worth discovering.',
  events:'EVENTS',cityNews:'CITY NOTES',emptyEvents:'New verified events are on their way.',
  emptyNews:'New city stories will appear here.',
  note:'STAY IN THE KNOW.',noteSub:'Frankfurt changes every day. Discover what is behind it.',
  community:'A CITY OF STORIES.',communitySub:'A city is more than addresses. Show what it means to you.',
  communityCta:'EXPLORE COMMUNITY',business:'YOUR BUSINESS. IN THE MIX.',
  businessSub:'Your place belongs on the radar. Be part of FFM Aktuell.',
  businessCta:'FOR BUSINESSES',district:'IN THE DISTRICT',
  source:'Venue information may change. Confirm opening hours with providers.',
  categories:[['Alle','ALL'],['Kultur','CULTURE'],['Sehenswürdigkeiten','SIGHTS'],['Natur','OUTDOORS'],['Restaurants','FOOD'],['Bars','NIGHTLIFE']]
};

function SignalMapArtwork(){
 return <div className="signal-map-art" aria-hidden="true">
   <div className="signal-map-art-top"><span>RADAR / FFM</span><span>50.1109° N<br/>08.6821° E</span></div>
   <svg viewBox="0 0 680 690" className="signal-route-svg" preserveAspectRatio="xMidYMid meet" role="presentation">
     <defs><pattern id="citygrain" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M0 30V0H30" fill="none" stroke="#202328" strokeWidth=".5" opacity=".23"/></pattern></defs>
     <rect width="680" height="690" fill="url(#citygrain)"/>
     <g fill="none" stroke="#55565b" strokeWidth="1" opacity=".45">
      <circle cx="335" cy="340" r="110"/><circle cx="335" cy="340" r="215"/><circle cx="335" cy="340" r="322"/>
      <path d="M335 20V660M15 340H665"/><path d="M75 80l520 520M595 80L75 600" strokeDasharray="3 7"/>
     </g>
     <path d="M-40 602 C120 555 184 461 252 446 S390 378 450 290 S575 215 725 164" fill="none" stroke="#f45b37" strokeWidth="18" strokeLinecap="round"/>
     <path d="M-40 602 C120 555 184 461 252 446 S390 378 450 290 S575 215 725 164" fill="none" stroke="#ffaf91" strokeWidth="1" strokeDasharray="10 12"/>
     <path d="M72 -15 L123 113 L190 172 L167 282 L281 322 L368 488 L408 705" stroke="#b0b0aa" strokeWidth="4" strokeLinejoin="round" fill="none" opacity=".5"/>
     <path d="M-15 124 L180 192 L288 171 L342 266 L512 370 L700 407" stroke="#b0b0aa" strokeWidth="4" strokeLinejoin="round" fill="none" opacity=".42"/>
     <g fill="#f45b37" stroke="#101319" strokeWidth="10"><circle cx="132" cy="536" r="13"/><circle cx="252" cy="446" r="13"/><circle cx="449" cy="291" r="13"/><circle cx="578" cy="204" r="13"/></g>
     <circle cx="335" cy="340" r="70" fill="#f45b37" opacity=".07"/><circle cx="335" cy="340" r="12" fill="#f45b37"/><circle cx="335" cy="340" r="22" stroke="#f45b37" strokeWidth="2" fill="none"/>
     <g fill="#eee9dc" fontSize="14" fontFamily="monospace" letterSpacing="2"><text x="148" y="508">SACHSENHAUSEN</text><text x="468" y="271">ALTSTADT</text><text x="420" y="454">069 / CENTER</text></g>
   </svg>
   <span className="signal-gigantic">069<span>/</span></span>
   <span className="signal-art-bottom"><i/> THE CITY IS LIVE <b>↗</b></span>
 </div>
}

export default function SignalHome({lang,places,events,news,deals,onDiscover,onMap,onEvents,onCommunity,onBusiness,onPlace,onCategory}:Props){
 const t=lang==='de'?de:en;
 const displayPlaces=places.slice(0,4);
 return <main className="signal-home">
  <section className="signal-hero" aria-label="FFM Aktuell">
   <div className="signal-hero-rail"><div className="signal-rail-inner">
    <span><span className="signal-live-dot"/> 069 / {t.live}</span>
    <span>VOL. 001 — 2026</span>
    <span>50°06&apos;39&quot;N 08°40&apos;55&quot;E</span>
   </div></div>
   <div className="signal-hero-body">
    <div className="signal-hero-copy">
      <div className="signal-overline"><span className="signal-cross">✳</span><span>{t.chapter}</span></div>
      <h1><span>{t.line1}</span><span className="signal-outline">{t.line2}</span><span className="signal-orange">{t.line3}<i>↗</i></span></h1>
      <div className="signal-hero-bottomrow">
       <p>{t.sub}</p>
       <div className="signal-hero-buttons">
        <button className="signal-button-primary" onClick={onDiscover}>{t.cta}<ArrowUpRight size={22}/></button>
        <button className="signal-button-simple" onClick={onMap}>{t.map}<ArrowRight size={18}/></button>
       </div>
      </div>
    </div>
    <div className="signal-hero-image"><SignalMapArtwork/></div>
   </div>
   <div className="signal-hero-foot"><span><span className="signal-skinny-bar"/> {t.aside}</span><button onClick={onDiscover}>{t.scroll} <ArrowDownRight size={20}/></button></div>
  </section>

  <div className="signal-moving-marquee" aria-label="Frankfurt districts">
   <div> <span>ALTSTADT</span><i>✳</i><span>SACHSENHAUSEN</span><i>✳</i><span>BAHNHOFVIERTEL</span><i>✳</i><span>WESTEND</span><i>✳</i><span>NORDEND</span><i>✳</i><span>069 / FFM AKTUELL</span><i>✳</i><span>ALTSTADT</span><i>✳</i><span>SACHSENHAUSEN</span><i>✳</i></div>
  </div>

  <section className="signal-places-section">
   <div className="signal-section-heading">
     <div className="signal-section-id"><b>01</b><span> / RADAR<br/> / PLACES</span></div>
     <div className="signal-section-intro"><span className="signal-mini-label">{t.handpicked} <i>↗</i></span><h2>{t.spots}</h2><p>{t.spotsSub}</p></div>
     <button className="signal-section-link" onClick={onDiscover}>{t.all}<ArrowUpRight size={21}/></button>
   </div>
   <div className="signal-category-row">{t.categories.map(([key,label])=><button key={key} onClick={()=>onCategory(key)}><span>{label}</span><ArrowUpRight size={14}/></button>)}</div>
   {displayPlaces.length>0?<div className="signal-place-grid">{displayPlaces.map((p,i)=><button key={p.id} className={'signal-place-block signal-place-'+i} onClick={()=>onPlace(p.id)}>
      <div className="signal-place-backdrop">
       <div className="signal-place-serial">{String(i+1).padStart(2,'0')} <i>/ 069</i></div>
       <div className="signal-place-symbol">{i===0?<svg viewBox="0 0 160 160"><path d="M19 136V56l61-41 61 41v80H19ZM39 136V68h83v68M80 28v108M27 91h108" fill="none" stroke="currentColor" strokeWidth="6"/></svg>:i===1?<svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="59" fill="none" stroke="currentColor" strokeWidth="5"/><circle cx="80" cy="80" r="30" fill="none" stroke="currentColor" strokeWidth="6"/><path d="M21 80h118M80 21v118" stroke="currentColor" strokeWidth="3"/></svg>:i===2?<svg viewBox="0 0 160 160"><path d="M25 132 77 18l54 114M43 99h70M76 18v114" fill="none" stroke="currentColor" strokeWidth="6"/></svg>:<svg viewBox="0 0 160 160"><path d="M20 131c20-65 35-99 64-100 28 0 44 40 55 100M25 110h110M40 89h80" fill="none" stroke="currentColor" strokeWidth="6"/></svg>}</div>
       <span className="signal-place-bgtext">{p.district||'FFM'}</span>
       <span className="signal-place-arrow"><ArrowUpRight size={22}/></span>
      </div>
      <div className="signal-place-summary"><small>{p.category} <span>/</span> {p.district||'FRANKFURT'}</small><h3>{p.name}</h3><span>{t.open} <ArrowRight size={15}/></span></div>
     </button>)}</div>:<div className="signal-no-content">RADAR / 00 — {lang==='de'?'Noch keine Orte freigegeben.':'No places published yet.'}</div>}
   <div className="signal-section-baseline"><span>DESIGNED FOR REAL CITY EXPLORATION</span><span>{String(places.length).padStart(2,'0')} / PUBLISHED PLACES</span></div>
  </section>

  <section className="signal-city-notes">
   <div className="signal-dark-heading"><span>02 / THE CITY FEED</span><h2>{t.editorial}</h2><p>{t.editorialSub}</p></div>
   <div className="signal-feeds">
    <div className="signal-feed-column">
      <div className="signal-feed-label"><CalendarDays size={20}/><span>{t.events}</span><b>↗</b></div>
      {events.length?events.slice(0,3).map((e,i)=><button className="signal-feed-story" key={e.id} onClick={onEvents}><span>{String(i+1).padStart(2,'0')}</span><div><small>{new Date(e.starts_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short',year:'numeric'})} / {e.venue}</small><strong>{e.title}</strong></div><ArrowUpRight size={21}/></button>):<p className="signal-feed-empty">{t.emptyEvents}</p>}
      <button className="signal-feed-more" onClick={onEvents}>{t.events}<ArrowRight size={18}/></button>
    </div>
    <div className="signal-feed-column">
      <div className="signal-feed-label"><Radio size={20}/><span>{t.cityNews}</span><b>↗</b></div>
      {news.length?news.slice(0,3).map((n,i)=><button className="signal-feed-story" key={n.id} onClick={onEvents}><span>{String(i+1).padStart(2,'0')}</span><div><small>{new Date(n.published_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</small><strong>{n.title}</strong></div><ArrowUpRight size={21}/></button>):<p className="signal-feed-empty">{t.emptyNews}</p>}
      <button className="signal-feed-more" onClick={onEvents}>{t.cityNews}<ArrowRight size={18}/></button>
    </div>
   </div>
   <div className="signal-notes-foot"><span>FRANKFURT IS IN MOTION</span><span><span className="signal-live-dot"/> SIGNAL 069</span></div>
  </section>

  <section className="signal-together">
   <div className="signal-together-content"><small>03 / PEOPLE MAKE THE CITY</small><h2>{t.community.split('.').map((part,i)=><span key={i}>{part}{i< t.community.split('.').length-1?'.':''}<br/></span>)}</h2><p>{t.communitySub}</p><button className="signal-button-primary" onClick={onCommunity}>{t.communityCta}<ArrowUpRight size={19}/></button></div>
   <div className="signal-together-art" aria-hidden="true"><span>069</span><div className="signal-ring a"/><div className="signal-ring b"/><div className="signal-ring c"/><span className="signal-together-stamp">STADT / MENSCHEN / SIGNAL</span></div>
  </section>

  <section className="signal-business-banner"><div><small>04 / FOR THE LOCAL ECONOMY</small><h2>{t.business}</h2><p>{t.businessSub}</p></div><button className="signal-button-black" onClick={onBusiness}>{t.businessCta}<MoveUpRight size={23}/></button></section>
  <div className="signal-finalline"><span>FFM AKTUELL</span><span>{t.source}</span><span>50.1109 / 8.6821</span></div>
 </main>;
}
