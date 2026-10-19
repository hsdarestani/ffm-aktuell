'use client';
import {useState,useEffect,useMemo,useCallback,type FormEvent} from 'react';
import dynamic from 'next/dynamic';
import {Compass,MapPin,Map as MapIcon,Heart,CalendarDays,Users,UserRound,Search,Menu,X,Globe,Plus,Check,Building2,Newspaper,LockKeyhole,Coffee,UtensilsCrossed,Martini,Activity,Landmark,Pill,Info,ChevronRight,ShieldAlert} from 'lucide-react';
import type {MapPlace} from '@/components/CityMap';
import AtlasHome from '@/components/AtlasHome';
import AdminStudio from '@/components/AdminStudio';
import PlaceLocationMap from '@/components/PlaceLocationMap';
import PlaceActions from '@/components/PlaceActions';
import VenueReviews from '@/components/VenueReviews';
import PostEngagement from '@/components/PostEngagement';
import {DealActions,BusinessCouponRedeem} from '@/components/CouponPilot';
import FollowButton from '@/components/FollowButton';
import {validLocationId} from '@/lib/location-actions';
import './assistant-discovery.css';
import {KATEGORIEN,passendeRubrik,frischBestaetigt,statusLabel} from '@/lib/ortskategorien';
import {VORSCHAU_HINWEIS,ortsbild,vorschauOrte,vorschauVeranstaltungen,vorschauBeitraege,vorschauPosts,vorschauAngebote,vorschauGruppen} from '@/lib/vorschau';
const Atlas3D=dynamic(()=>import('@/components/Atlas3D'),{ssr:false});
const TourPlanner=dynamic(()=>import('@/components/TourPlanner'),{ssr:false});
const CuratedTours=dynamic(()=>import('@/components/CuratedTours'),{ssr:false});
const SmartDiscover=dynamic(()=>import('@/components/SmartDiscover'),{ssr:false});
const ProfileSettings=dynamic(()=>import('@/components/ProfileSettings'),{ssr:false});
const EventActions=dynamic(()=>import('@/components/EventActions'),{ssr:false});
const BusinessBranchEditor=dynamic(()=>import('@/components/BusinessBranchEditor'),{ssr:false});
type Place=MapPlace & {district:string,address:string,description_de:string,description_en:string,website:string|null,source_url:string|null,image_url?:string|null,demo?:true,candidate?:boolean,osm_id?:string,phone?:string,verification_status?:'verified'|'unverified'|'disputed',activity_status?:'unknown'|'operating'|'temporarily_closed'|'permanently_closed',verified_at?:string|null,verification_source?:string|null,editorial_rank?:number|null,opening_hours_text?:string|null,business_id?:string|null,following_business?:boolean};
type User={id:string,email:string,display_name:string,role:string};
type Event={id:string,title:string,venue:string,starts_at:string,description_de:string,description_en:string,ticket_url:string|null,image_url?:string,demo?:true};
type News={id:string,title:string,body_de:string,body_en:string,source_url:string|null,published_at:string,image_url?:string,demo?:true};
type Post={id:string,body:string,created_at:string,display_name:string,place_name:string|null,image_url?:string,demo?:true,likes_count?:number,comments_count?:number,liked?:boolean,author_id?:string,following_author?:boolean,own_post?:boolean};
type Deal={id:string,title:string,details:string,business_name:string,image_url?:string,demo?:true};
type Page='home'|'discover'|'map'|'saved'|'tours'|'profile'|'events'|'community'|'business'|'admin';
const categories=KATEGORIEN.map(x=>x.id);
const kategorienAnzeigen=Object.fromEntries(KATEGORIEN.map(x=>[x.id,x.label])) as Record<string,string>;
const words={
 de:{home:'Start',discover:'Entdecken',map:'Karte',community:'Miteinander',events:'Veranstaltungen',business:'Für Unternehmen',sign:'Anmelden',hero:'Deine Stadt.',hero2:'Neu entdeckt.',intro:'Das echte Frankfurt beginnt abseits des Gewöhnlichen. Orte, Perspektiven und besondere Momente. Alles an einem Ort.',cta:'Frankfurt entdecken',curated:'Dein Frankfurt, heute.',curatedSub:'Finde deinen nächsten Lieblingsort.',more:'Alle entdecken',search:'Orte, Viertel oder Ideen suchen',district:'Alle Stadtteile',news:'Aus der Stadt',deals:'Lokale Angebote',stories:'Geschichten aus der Stadt',eventTitle:'Was steht an?',empty:'Hier gibt es noch keine bestätigten Einträge.',saved:'Gemerkt',save:'Merken',source:'Quelle',website:'Internetseite öffnen',welcome:'Willkommen bei FFM',register:'Registrieren',email:'E-Mail',password:'Passwort',name:'Dein Name',send:'Absenden',login:'Anmelden',post:'Beitrag zur Prüfung senden',postPlaceholder:'Was hast du in Frankfurt entdeckt?',pending:'Vor Veröffentlichung wird dein Beitrag geprüft.',businessTitle:'Dein Unternehmen. Deine Stadt.',businessIntro:'Verwalte deinen Eintrag, beantrage die Inhaberschaft und veröffentliche lokale Angebote.',businessRegister:'Unternehmen registrieren',company:'Firmenname',registry:'Gewerbe oder Registerangabe (optional)',claim:'Eintrag beanspruchen',claimNote:'Begründung / Nachweis',offer:'Angebot vorschlagen',offerText:'Bedingungen / Beschreibung',admin:'Redaktion & Moderation',queue:'Offene Prüfungen',approve:'Freigeben',reject:'Ablehnen',newPlace:'Neuen Ort veröffentlichen',title:'Titel',category:'Kategorie',address:'Adresse',description:'Beschreibung',latitude:'Breitengrad',longitude:'Längengrad',submitPlace:'Ort speichern',newNews:'Stadtbeitrag veröffentlichen',newEvent:'Veranstaltung veröffentlichen',venue:'Veranstaltungsort',datetime:'Datum und Uhrzeit',logout:'Abmelden',notice:'Zeiten und Preise beim Anbieter prüfen.',mapTitle:'Frankfurt auf einen Blick.',mapSub:'Die Stadt, ein Ort nach dem anderen.',city:'Frankfurt am Main'},
 en:{home:'Home',discover:'Explore',map:'Map',community:'Community',events:'Events',business:'For business',sign:'Sign in',hero:'Your city.',hero2:'Rediscovered.',intro:'The real Frankfurt begins beyond the ordinary. Places, perspectives and special moments. All in one place.',cta:'Explore Frankfurt',curated:'Your Frankfurt, today.',curatedSub:'Find your next favorite place.',more:'Explore all',search:'Search places, neighborhoods or ideas',district:'All districts',news:'Around town',deals:'Local offers',stories:'Stories from the city',eventTitle:'What is on?',empty:'There are no confirmed entries yet.',saved:'Saved',save:'Save',source:'Source',website:'Open website',welcome:'Welcome to FFM',register:'Register',email:'Email',password:'Password',name:'Your name',send:'Submit',login:'Sign in',post:'Submit for review',postPlaceholder:'What did you discover in Frankfurt?',pending:'Your post will be reviewed before publication.',businessTitle:'Your business. Your city.',businessIntro:'Manage your listing, request ownership and publish local offers.',businessRegister:'Register business',company:'Business name',registry:'Business registration information (optional)',claim:'Claim a listing',claimNote:'Explanation / proof',offer:'Suggest an offer',offerText:'Terms / description',admin:'Editorial & moderation',queue:'Pending reviews',approve:'Approve',reject:'Reject',newPlace:'Publish a new place',title:'Title',category:'Category',address:'Address',description:'Description',latitude:'Latitude',longitude:'Longitude',submitPlace:'Save place',newNews:'Publish news',newEvent:'Publish event',venue:'Venue',datetime:'Date and time',logout:'Sign out',notice:'Confirm times and prices with the venue.',mapTitle:'Frankfurt at a glance.',mapSub:'One place at a time.',city:'Frankfurt am Main'}
};
function nutzerfehler(message:string){const msg=(message||'').toLowerCase();if(msg.includes('invalid credentials'))return 'E-Mail-Adresse oder Passwort ist falsch.';if(msg.includes('login required')||msg.includes('admin required'))return 'Bitte melde dich mit der erforderlichen Berechtigung an.';if(msg.includes('email already registered'))return 'Diese E-Mail-Adresse ist bereits registriert.';if(msg.includes('too many requests'))return 'Zu viele Anfragen. Bitte versuche es später erneut.';if(msg.includes('invalid fields'))return 'Bitte überprüfe deine Eingaben.';if(msg.includes('invalid request origin'))return 'Die Anfrage konnte nicht sicher verarbeitet werden.';if(msg.includes('register a business first'))return 'Bitte registriere zuerst dein Unternehmen.';return 'Die Anfrage konnte nicht abgeschlossen werden. Bitte versuche es erneut.';}
async function api(path:string,body?:unknown){const r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(nutzerfehler(d.error));return d;}
const date=(s:string,l:string)=>new Date(s).toLocaleDateString(l==='de'?'de-DE':'en-GB',{day:'2-digit',month:'short',year:'numeric'});
export default function Home(){
 const [lang,setLang]=useState<'de'|'en'>('de');const t=words[lang];
 const [page,setPage]=useState<Page>('home'),[places,setPlaces]=useState<Place[]>([]),[events,setEvents]=useState<Event[]>([]),[news,setNews]=useState<News[]>([]),[posts,setPosts]=useState<Post[]>([]),[deals,setDeals]=useState<Deal[]>([]);
 const [user,setUser]=useState<User|null>(null),[favorites,setFavorites]=useState<string[]>([]),[savedPlaces,setSavedPlaces]=useState<Place[]>([]),[savedLoading,setSavedLoading]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [query,setQuery]=useState(''),[category,setCategory]=useState('Alle'),[district,setDistrict]=useState(''),[selected,setSelected]=useState<Place|null>(null),[nurGepruefte,setNurGepruefte]=useState(false);
 const [followingOnly,setFollowingOnly]=useState(false);
 const [nearby,setNearby]=useState<{lat:number;lon:number}|null>(null);
 const [findingNearby,setFindingNearby]=useState(false);
 const [eventFavorites,setEventFavorites]=useState<string[]>([]);
 const [auth,setAuth]=useState(false),[register,setRegister]=useState(false),[menu,setMenu]=useState(false),[toast,setToast]=useState(''),[refresh,setRefresh]=useState(0);
 const [candidates,setCandidates]=useState<Place[]>([]),[candidateTotal,setCandidateTotal]=useState(0),[candidateLoading,setCandidateLoading]=useState(false);
 const [business,setBusiness]=useState<any>(null),[businessDetail,setBusinessDetail]=useState<any>(null),[queue,setQueue]=useState<Record<string,any[]>|null>(null);
 const flash=(m:string)=>{setToast(m);window.setTimeout(()=>setToast(''),4500);};
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const [p,e,n,m]=await Promise.all([api('places'),api('events'),api('news'),api('me')]);setPlaces(p.items);setEvents(e.items);setNews(n.items);setUser(m.user);if(m.user){void api('favorites').then(d=>setFavorites(d.items)).catch(()=>setFavorites([]))}else setFavorites([]);}catch(e){setError('Die Inhalte konnten nicht geladen werden. Bitte versuche es erneut.')}finally{setLoading(false)}
 },[refresh]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{document.documentElement.lang=lang},[lang]);
 useEffect(()=>{if(new URLSearchParams(window.location.search).has('tour'))setPage('tours')},[]);
 // Deep links resolve directly to the actual place record, even when that
 // raw OSM candidate isn't in the first search page. Never invent demo venues.
 useEffect(()=>{
  const placeId=new URLSearchParams(window.location.search).get('ort')||'';
  if(!validLocationId(placeId))return;
  let live=true;
  void fetch('/api/location?id='+encodeURIComponent(placeId),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('not found');return r.json()})
   .then(data=>{if(live&&data.place)setSelected(data.place as Place)})
   .catch(()=>{if(live)flash('Der geteilte Ort ist derzeit nicht verfügbar.')});
  return()=>{live=false};
 // Landing deep link should only resolve on initial load.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 
 useEffect(()=>{if(page!=='discover')return;let disposed=false;const controller=new AbortController();setCandidateLoading(true);setCandidates([]);setCandidateTotal(0);const timer=window.setTimeout(()=>{
  const q=new URLSearchParams({limit:'18',offset:'0'});
  if(category!=='Alle')q.set('category',category==='Apotheken Notdienst'?'Apotheken':category);
  if(query.trim())q.set('q',query.trim());
  if(nearby){q.set('lat',String(nearby.lat));q.set('lon',String(nearby.lon));q.set('radius','3');}
  fetch('/api/discovery?'+q,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Fehler');return r.json()})
   .then(data=>{if(!disposed){setCandidates(data.items||[]);setCandidateTotal(data.total||0);}})
   .catch(()=>{if(!disposed){setCandidates([]);setCandidateTotal(0);}})
   .finally(()=>{if(!disposed)setCandidateLoading(false)});
  },240);return()=>{disposed=true;window.clearTimeout(timer);controller.abort()};
 },[page,category,query,nearby,refresh]);
 const mehrLaden=async()=>{if(candidateLoading||candidates.length>=candidateTotal)return;
  setCandidateLoading(true);try{const q=new URLSearchParams({limit:'18',offset:String(candidates.length)});
   if(category!=='Alle')q.set('category',category==='Apotheken Notdienst'?'Apotheken':category);
   if(query.trim())q.set('q',query.trim());
   if(nearby){q.set('lat',String(nearby.lat));q.set('lon',String(nearby.lon));q.set('radius','3');}
   const r=await fetch('/api/discovery?'+q);if(!r.ok)throw Error('Fehler');const d=await r.json();
   setCandidates(prev=>[...prev,...d.items.filter((p:Place)=>!prev.some(o=>o.id===p.id))]);
  }catch{flash('Weitere Orte konnten nicht geladen werden.')}finally{setCandidateLoading(false)}
 };

 useEffect(()=>{if(page==='business'&&user){api('businesses').then(b=>{setBusiness(b.items[0]||null);if(b.items[0])api('business/overview').then(setBusinessDetail).catch(()=>{})}).catch(()=>{})}if(page==='admin'&&user?.role==='admin')api('admin/queue').then(setQueue).catch(()=>{})},[page,user,refresh]);
 useEffect(()=>{if(page==='community')void api('posts?scope='+(followingOnly?'following':'all')).then(d=>setPosts(d.items||[])).catch(()=>setPosts([]));if(page==='events')void api('deals').then(d=>setDeals(d.items||[])).catch(()=>{})},[page,refresh,user?.id,followingOnly]);
 useEffect(()=>{if(page!=='events'||!user){setEventFavorites([]);return;}void api('event-favorites').then(d=>setEventFavorites((d.items||[]).map((e:Event)=>e.id))).catch(()=>setEventFavorites([]))},[page,user?.id,refresh]);

 useEffect(()=>{
  if(page!=='saved'||!user)return;
  let active=true;setSavedLoading(true);
  void api('favorites/details').then(data=>{
   if(active)setSavedPlaces(data.items||[]);
  }).catch(()=>{if(active){setSavedPlaces([]);flash('Deine Merkliste konnte nicht geladen werden.')}})
   .finally(()=>{if(active)setSavedLoading(false)});
  return()=>{active=false};
 // favorites.length ensures fresh data after a save or unsave.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[page,user?.id,refresh,favorites.length]);

 const sichtbareOrte=useMemo(()=>[...places,...vorschauOrte.filter(v=>!places.some(p=>p.name===v.name))],[places]);
 const sichtbareVeranstaltungen=useMemo(()=>[...events,...vorschauVeranstaltungen],[events]);
 const sichtbareBeitraege=useMemo(()=>[...news,...vorschauBeitraege],[news]);
 const sichtbarePosts=useMemo(()=>followingOnly?posts:[...posts,...vorschauPosts],[posts,followingOnly]);
 const sichtbareAngebote=useMemo(()=>[...deals,...vorschauAngebote],[deals]);
 const distanceKm=(p:Place)=>!nearby?0:(!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)?Infinity:6371*2*Math.asin(Math.sqrt(Math.sin(((p.latitude as number)-nearby.lat)*Math.PI/360)**2+Math.cos(nearby.lat*Math.PI/180)*Math.cos((p.latitude as number)*Math.PI/180)*Math.sin(((p.longitude as number)-nearby.lon)*Math.PI/360)**2)));
 const filtered=useMemo(()=>sichtbareOrte.filter(p=>(!nearby||distanceKm(p)<=3)&&passendeRubrik(p,category)&&(!nurGepruefte||frischBestaetigt(p))&&(!district||p.district===district)&&[p.name,p.category,p.district,p.description_de,p.description_en].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())),[sichtbareOrte,category,district,query,nurGepruefte,nearby]);
 const toggleNearby=()=>{if(nearby){setNearby(null);return;}if(!navigator.geolocation){flash('Standortzugriff nicht verfügbar. Bitte normal suchen.');return;}setFindingNearby(true);navigator.geolocation.getCurrentPosition(pos=>{setFindingNearby(false);const {latitude:lat,longitude:lon}=pos.coords;if(lat<49.7||lat>50.4||lon<8.2||lon>9.1){flash('Der Standort liegt außerhalb des Frankfurter Suchbereichs.');return;}setNearby({lat,lon});},()=>{setFindingNearby(false);flash('Standort nicht freigegeben. Suche ohne Standort bleibt möglich.');},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});};
 const navigate=(p:Page)=>{if(new URLSearchParams(window.location.search).has('tour'))window.history.replaceState(null,'',window.location.pathname);setPage(p);setMenu(false);window.scrollTo({top:0,behavior:'smooth'})};
 const selectPlace=useCallback((id:string)=>{
  const cached=[...sichtbareOrte,...candidates].find(p=>p.id===id);
  if(cached){setSelected(cached);return;}
  if(!validLocationId(id))return;
  void api('location?id='+encodeURIComponent(id))
   .then(data=>{if(data.place)setSelected(data.place as Place)})
   .catch(()=>flash('Ort konnte nicht geöffnet werden.'));
 },[sichtbareOrte,candidates]);
 const submit=async(path:string,data:unknown,success:string)=>{try{await api(path,data);flash(success);setRefresh(x=>x+1);return true}catch(e){flash((e as Error).message||'Die Anfrage ist fehlgeschlagen.');return false}};
 const favoriteEvent=async(id:string,active:boolean)=>{try{await api('event-favorites',{event_id:id,active});setEventFavorites(v=>active?[...new Set([...v,id])]:v.filter(x=>x!==id));flash(active?'Veranstaltung gemerkt.':'Veranstaltung entfernt.')}catch{flash('Veranstaltung konnte nicht gespeichert werden.')}};
 const favorite=async(id:string)=>{if(!validLocationId(id)){flash('Dieser Musterort kann nicht gespeichert werden.');return}if(!user){setAuth(true);return}try{const active=!favorites.includes(id);await api('favorites',{place_id:id,active});setFavorites(a=>active?[...a,id]:a.filter(x=>x!==id));flash(active?'Ort gemerkt.':'Aus Merkliste entfernt.')}catch(e){flash((e as Error).message||'Die Merkliste konnte nicht geändert werden.')}};
 const handle=(e:FormEvent<HTMLFormElement>,path:string,transform?:(x:Record<string,FormDataEntryValue>)=>unknown)=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));submit(path,transform?transform(data):data,t.pending).then(success=>{if(success)form.reset()})};
 const onAuth=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const ok=await submit(register?'auth/register':'auth/login',data,t.welcome);if(ok){setAuth(false);setRegister(false)}};
 const nav:[Page,any,string][]=[['home',Compass,t.home],['discover',Search,t.discover],['map',MapIcon,t.map]];
 const picture=(index:number,p?:Place)=> <div className="v3-photo"><img src={ortsbild(p?.name||'',p?.image_url)} alt="Stimmungsbild zur Stadtempfehlung" loading="lazy"/><span className="v3-photo-index">{String(index+1).padStart(2,'0')}</span><span className="v3-photo-credit">Stimmungsbild</span></div>;
 const cards=(arr:Place[])=>arr.length?<div className="cards v3-place-grid">{arr.map((p,i)=><article className="card v3-place-card" key={p.id}><button className="card-cover" onClick={()=>setSelected(p)} aria-label={p.name}>{picture(i,p)}<span className="v3-visit-mark"><Plus size={18}/></span></button><div className="card-info"><div className="v3-card-label"><span>{catBezeichnungen[p.category]||p.category} · {p.district||t.city}</span><span className="v4-check-label">{statusLabel(p)}</span></div><div><button onClick={()=>setSelected(p)}>{p.name}</button><button className={'heart '+(favorites.includes(p.id)?'liked':'')} onClick={()=>favorite(p.id)} aria-label={t.save}><Heart size={19} fill={favorites.includes(p.id)?'currentColor':'none'}/></button></div><p>{p.description_de}</p><span><MapPin size={14}/>{p.district||t.city}</span></div></article>)}</div>:<div className="empty"><Compass size={28}/><p>{t.empty}</p></div>;
 const sectionHeading=(index:string,head:string,sub:string)=> <div className="section-head"><small>{index} / FFM JOURNAL <span/></small><h2>{head}</h2><p>{sub}</p></div>;
 const catBezeichnungen:Record<string,string>=kategorienAnzeigen;
 const categoriesEl=<div className="chips">{categories.map(cat=><button key={cat} className={category===cat?'active':''} onClick={()=>setCategory(cat)}>{catBezeichnungen[cat]||cat}</button>)}</div>;
 const formField=(label:string,name:string,required=false,type='text')=><label className="form-label">{label}<input name={name} type={type} required={required}/></label>;
 const reviewSection=(type:string,items:any[])=><div className="review-section" key={type}><h3>{{businesses:'Unternehmen',claims:'Inhaberschaft',places:'Orte',deals:'Angebote',posts:'Beiträge'}[type]||'Einträge'} <span>{items.length}</span></h3>{items.map(a=><div className="review-row" key={a.id}><span>{a.name||a.title||a.body||a.business_name+' / '+a.place_name}</span><div><button title={t.approve} onClick={()=>submit('admin/review',{type:type==='businesses'?'business':type==='claims'?'claim':type==='places'?'place':type==='deals'?'deal':'post',id:a.id,approve:true},t.approve)}><Check size={18}/></button><button title={t.reject} onClick={()=>submit('admin/review',{type:type==='businesses'?'business':type==='claims'?'claim':type==='places'?'place':type==='deals'?'deal':'post',id:a.id,approve:false},t.reject)}><X size={18}/></button></div></div>)}{items.length===0&&<p className="subdued">—</p>}</div>;
 return <div className={'site v3-site'+(page==='admin'?' ffm-studio-active':'')}>
  <header className="header"><div className="header-inner"><button className="logo" onClick={()=>navigate('home')} aria-label="FFM Aktuell Startseite"><span className="ml-brand-mark" aria-hidden="true"><svg viewBox="0 0 60 44" fill="none" role="presentation"><path d="M2 29C15 5 23 7 34 22C43 33 51 37 58 16" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round"/><circle cx="34" cy="22" r="2.7" fill="currentColor"/></svg></span><span className="ml-brand-word">ffm<b>aktuell</b><small>FRANKFURT VON INNEN</small></span></button><nav className="desktop-nav">{nav.map(([p,,txt])=><button key={p} className={page===p?'active':''} onClick={()=>navigate(p)}>{txt}</button>)}</nav><div className="header-end"><button type="button" onClick={()=>setLang(l=>l==='de'?'en':'de')} aria-label={lang==='de'?'Switch to English':'Auf Deutsch wechseln'} title={lang==='de'?'English':'Deutsch'} className="ffm-language-toggle">{lang==='de'?'EN':'DE'}</button><button className="business-nav" onClick={()=>navigate('business')}>{t.business}<span className="ui-dot" aria-hidden="true"/></button><button className="user-button" title={user?'Meine Orte':t.sign} aria-label={user?'Meine Orte':t.sign} onClick={()=>user?navigate(user.role==='admin'?'admin':'profile'):setAuth(true)}><UserRound size={20}/></button><button className="menu-button" onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button></div></div>{menu&&<div className="mobile-menu"><button onClick={()=>navigate('business')}>{t.business}</button><button onClick={()=>user?navigate('saved'):setAuth(true)}>{user?'Meine Orte':t.login}</button>{user&&<button onClick={()=>navigate('profile')}>Mein Profil</button>}{user&&<button onClick={()=>navigate('tours')}>Meine Touren</button>}{user?.role==='admin'&&<button onClick={()=>navigate('admin')}>Verwaltung</button>}</div>}</header>
  {(page==='events'||page==='community')&&<div className="v3-preview-strip" role="status"><span className="v3-preview-spark"/><strong>VORSCHAU</strong><span>{VORSCHAU_HINWEIS}</span></div>}
   {toast&&<div className="toast" role="status"><Check size={16}/>{toast}<button onClick={()=>setToast('')}><X size={16}/></button></div>}
  {error&&<div className="error">{error}<button onClick={()=>setRefresh(x=>x+1)}>{lang==='de'?'Erneut laden':'Retry'}</button></div>}
  {page==='home'&&<><AtlasHome lang={lang} places={sichtbareOrte} events={sichtbareVeranstaltungen} news={sichtbareBeitraege} onDiscover={()=>navigate('discover')} onMap={()=>navigate('map')} onEvents={()=>navigate('events')} onCommunity={()=>navigate('community')} onBusiness={()=>navigate('business')} onPlace={selectPlace} onCategory={cat=>{setCategory(cat);navigate('discover')}} onSearch={value=>{setQuery(value);setCategory('Alle');setDistrict('');navigate('discover')}} onTours={()=>navigate('tours')} /><SmartDiscover onPlace={selectPlace} onDiscover={()=>navigate('discover')} lang={lang}/></>}
  {page==='discover'&&<main className="ffm-find-page ffm-find-visual" id="entdecken">
 <section className="ffm-find-head">
  <h1>Entdecken<span>.</span></h1>
  <div className="ffm-find-search" role="search">
   <Search size={21} aria-hidden="true"/>
   <label htmlFor="ffm-find-query" className="sr-only">Orte oder Stadtteile suchen</label>
   <input id="ffm-find-query" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Was suchst du?" autoComplete="off"/>
   {query&&<button type="button" className="ffm-find-clear" onClick={()=>setQuery('')} aria-label="Suche löschen"><X size={18}/></button>}
   <button className="ffm-find-map" type="button" onClick={()=>navigate('map')} aria-label="Karte öffnen"><MapIcon size={20}/><span>Karte</span></button>
  </div>
 </section>

 <section className="ffm-find-filters" aria-label="Kategorien">
  <div className="ffm-find-main-cats">
   {[
    {id:'Alle',label:'Alle',Icon:Compass,tone:'all'},
    {id:'Cafés',label:'Cafés',Icon:Coffee,tone:'coffee'},
    {id:'Restaurants',label:'Essen',Icon:UtensilsCrossed,tone:'food'},
    {id:'Bars',label:'Bars',Icon:Martini,tone:'night'},
    {id:'Freizeit',label:'Freizeit',Icon:Activity,tone:'play'},
    {id:'Museen',label:'Kultur',Icon:Landmark,tone:'culture'},
    {id:'Apotheken',label:'Apotheken',Icon:Pill,tone:'health'}
   ].map(({id,label,Icon,tone})=><button key={id} type="button" aria-pressed={category===id} onClick={()=>{setCategory(id);setNurGepruefte(false)}} className={'ffm-find-category '+tone+(category===id?' active':'')}>
    <span className="ffm-find-category-visual"><Icon size={24} strokeWidth={1.9} aria-hidden="true"/></span>
    <span>{label}</span>
   </button>)}
  </div>
  <details className="ffm-find-more">
   <summary><Plus size={16}/> Mehr {category!=='Alle'&&!['Cafés','Restaurants','Bars','Freizeit','Museen','Apotheken'].includes(category)?'· '+(catBezeichnungen[category]||category):''}</summary>
   <div className="ffm-find-extra">
    <button type="button" aria-pressed={Boolean(nearby)} disabled={findingNearby} onClick={toggleNearby}>{nearby?'✓ In meiner Nähe (3 km)':findingNearby?'Standort wird gesucht …':'Standort verwenden (3 km)'}</button>
    <div className="ffm-find-extra-cats">{categories.filter(cat=>!['Alle','Cafés','Restaurants','Bars','Freizeit','Museen','Apotheken'].includes(cat)).map(cat=><button type="button" key={cat} className={category===cat?'active':''} onClick={()=>setCategory(cat)}>{catBezeichnungen[cat]||cat}</button>)}</div>
    <label className="ffm-find-verified"><input type="checkbox" checked={nurGepruefte} onChange={e=>setNurGepruefte(e.target.checked)}/> Nur aktuell geprüfte Betriebe</label>
   </div>
  </details>
 </section>

 {category==='Apotheken Notdienst'&&<section className="ffm-find-duty"><strong>Apotheken-Notdienst</strong><p>Unsere Ortsliste ist keine Notdienstbestätigung.</p><a href="https://www.aponet.de/notdienstsuche/60320-Frankfurt" target="_blank" rel="noopener noreferrer">Aktuellen Dienst bei aponet prüfen <ChevronRight size={16}/></a></section>}

 <section className="ffm-find-results" aria-labelledby="ffm-find-results-title">
  <div className="ffm-find-result-head">
   <h2 id="ffm-find-results-title">Orte <span>{nurGepruefte?filtered.filter(p=>!p.demo).length:candidateTotal+filtered.filter(p=>!p.demo).length}</span></h2>
   <details className="ffm-find-data"><summary><Info size={16}/> Dateninfo</summary><div><strong>Hinweis zu den Orten</strong><p>OSM Einträge sind noch nicht auf Betrieb oder Öffnungszeiten geprüft. Bitte vor dem Besuch beim Anbieter nachsehen. Redaktionell bestätigte Orte sind gesondert gekennzeichnet.</p><small>© OpenStreetMap-Mitwirkende · ODbL</small></div></details>
  </div>

  {filtered.some(p=>!p.demo)&&<div className="ffm-find-verified-results"><div className="ffm-find-subhead"><Check size={17}/><strong>Redaktionelle Orte</strong></div>{cards(filtered.filter(p=>!p.demo))}</div>}

  {!nurGepruefte&&<>
   <div className="ffm-find-source-line"><span className="ffm-find-source-dot"/><strong>Weitere Orte</strong><small>OSM · ungeprüft</small></div>
   <div className="ffm-find-list" aria-busy={candidateLoading&&candidates.length===0}>
    {candidates.map(p=>{
     const Icon=p.category==='Cafés'||p.category==='Brunch'?Coffee:p.category==='Restaurants'||p.category==='Imbiss'?UtensilsCrossed:p.category==='Bars'||p.category==='Clubs'||p.category==='Shisha Bars'?Martini:p.category==='Museen'||p.category==='Kultur'?Landmark:p.category==='Apotheken'?Pill:MapPin;
     const tone=p.category==='Cafés'||p.category==='Brunch'?'coffee':p.category==='Restaurants'||p.category==='Imbiss'?'food':p.category==='Bars'||p.category==='Clubs'||p.category==='Shisha Bars'?'night':p.category==='Museen'||p.category==='Kultur'?'culture':p.category==='Apotheken'?'health':'play';
     return <button type="button" className={'ffm-find-item '+tone} key={p.id} onClick={()=>setSelected(p)} aria-label={p.name+' · Details öffnen'}>
      <span className="ffm-find-place-visual" aria-hidden="true"><span className="ffm-find-visual-rim"/><Icon size={32} strokeWidth={1.45}/></span>
      <span className="ffm-find-item-copy"><strong title={p.name}>{p.name}</strong><small title={p.address||''}>{p.address||catBezeichnungen[p.category]||p.category}</small></span>
      <span className="ffm-find-item-footer"><span><ShieldAlert size={12}/> Ungeprüft</span><ChevronRight size={17}/></span>
     </button>;
    })}
   </div>
   {candidateLoading&&<p className="ffm-find-empty" role="status">Orte werden geladen …</p>}
   {!candidateLoading&&candidates.length===0&&<div className="ffm-find-empty">Keine Treffer. Anderes Wort probieren.</div>}
   {candidateTotal>candidates.length&&<button className="ffm-find-load" disabled={candidateLoading} onClick={mehrLaden}>Weitere Orte anzeigen <span>{candidates.length} / {candidateTotal}</span></button>}
   <p className="ffm-find-source-credit">© OpenStreetMap-Mitwirkende (ODbL)</p>
  </>}

  {nurGepruefte&&filtered.filter(p=>!p.demo).length===0&&<div className="ffm-find-empty">Noch keine bestätigten Orte.</div>}
  {filtered.some(p=>p.demo)&&!nurGepruefte&&<details className="ffm-find-preview"><summary>Musterorte anzeigen <Plus size={16}/></summary><p>Beispiele, keine bestätigten Empfehlungen.</p>{cards(filtered.filter(p=>p.demo))}</details>}
 </section>
 </main>}
 {page==='saved'&&<main className="ffm-saved-page">
  <div className="ffm-saved-heading"><span>DEIN FRANKFURT</span><h1>Meine Orte<span>.</span></h1><p>Deine gemerkten Plätze auf einen Blick.</p><button type="button" className="ffm-saved-tour-link" onClick={()=>navigate('tours')}>Tour planen <ChevronRight size={16}/></button></div>
  {!user?<div className="ffm-saved-empty"><p>Bitte melde dich an, um deine Orte zu sehen.</p><button onClick={()=>setAuth(true)}>Anmelden</button></div>:
  savedLoading?<p role="status">Deine Orte werden geladen …</p>:
  !savedPlaces.length?<div className="ffm-saved-empty"><Heart size={29}/><h2>Noch keine Orte gemerkt.</h2><p>Entdecke Frankfurt und tippe beim nächsten Lieblingsort auf Merken.</p><button onClick={()=>navigate('discover')}>Orte entdecken <ChevronRight size={18}/></button></div>:
   <div className="ffm-saved-list" aria-label="Gespeicherte Orte">{savedPlaces.map(p=><article key={p.id} className="ffm-saved-item">
    <div className="ffm-saved-pin"><MapPin size={21}/></div>
    <button className="ffm-saved-name" onClick={()=>setSelected(p)}><strong>{p.name}</strong><small>{p.category} · {p.address||p.district||'Frankfurt'}</small><span>{p.candidate?'OSM · Ungeprüft':statusLabel(p)}</span></button>
    <button className="ffm-saved-remove" title="Aus Merkliste entfernen" aria-label={p.name+' entfernen'} onClick={()=>void favorite(p.id)}><Heart size={20} fill="currentColor"/></button>
   </article>)}</div>}
  </main>}
 {page==='tours'&&<><CuratedTours/><TourPlanner loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash}/></>}
 {page==='profile'&&<ProfileSettings user={user} onLogin={()=>setAuth(true)} onNotice={flash}
  onSavedPlaces={()=>navigate('saved')} onTours={()=>navigate('tours')}
  onDeleted={()=>{setUser(null);setFavorites([]);setSelected(null);navigate('home');flash('Dein Konto wurde gelöscht.')}}/>}
 {page==='map'&&<main className="atlas-app-map"><Atlas3D places={places} lang={lang} variant="full" onSelect={selectPlace}/><div className="atlas-app-map-note">{t.notice} · © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap</div></main>}
  {page==='events'&&<main className="inner-page v3-editorial-page">
 <div className="page-title v3-page-head"><small>03 / STADTJOURNAL</small><h1>Die Stadt lebt<em>.</em></h1><p>Ideen, Begegnungen und neue Perspektiven auf Frankfurt.</p></div>
 <section className="v3-section"><div className="v3-section-head"><div><span className="v3-eyebrow">FÜR DEINEN KALENDER</span><h2>Was steht an?</h2></div><span className="v3-section-trail">Veranstaltungen in Frankfurt</span></div>
   <div className="v3-events-grid">{sichtbareVeranstaltungen.map(e=><article className="v3-event-card" key={e.id}>
     <div className="v3-event-photo"><img src={ortsbild('',e.image_url)} alt="Stimmungsbild zur Veranstaltung" loading="lazy"/><span className="v3-event-date">{date(e.starts_at,lang)}</span><span className="v3-image-note">Stimmungsbild</span></div>
     <div className="v3-event-info">{e.demo&&<span className="v3-demo-label">Musterveranstaltung · nicht buchbar</span>}<h3>{e.title}</h3><p>{e.description_de}</p><span className="v3-place-meta"><MapPin size={15}/>{e.venue}</span><EventActions key={e.id} event={e} saved={eventFavorites.includes(e.id)} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onSaved={favoriteEvent} onNotice={flash}/></div>
   </article>)}</div>
 </section>
 <section className="v3-section v3-journal"><div className="v3-section-head"><div><span className="v3-eyebrow">WAS UNS BEWEGT</span><h2>Aus der Stadt.</h2></div><span className="v3-section-trail">Geschichten und Inspiration</span></div>
   <div className="v3-journal-grid">{sichtbareBeitraege.map((n,i)=><article className={'v3-journal-card '+(i===0?'v3-wide':'')} key={n.id}><div className="v3-journal-image"><img src={ortsbild('',n.image_url)} alt="Stimmungsbild aus Frankfurt" loading="lazy"/><span className="v3-image-note">Stimmungsbild</span></div><div className="v3-journal-copy"><span className="v3-eyebrow">{n.demo?'MUSTERBEITRAG':'STADTGESCHICHTE'} · {date(n.published_at,lang)}</span><h3>{n.title}</h3><p>{n.body_de}</p>{n.source_url&&<a href={n.source_url} rel="noopener noreferrer" target="_blank">Originalquelle ansehen</a>}</div></article>)}</div>
 </section>
 <section className="v3-section v3-offers"><div className="v3-section-head"><div><span className="v3-eyebrow">AUS DEINEM VIERTEL</span><h2>Lokale Angebote.</h2></div><span className="v3-section-trail">Entdecken und vormerken</span></div>
   <div className="v3-offer-grid">{sichtbareAngebote.map(d=><article className="v3-offer-card" key={d.id}><div className="v3-offer-image"><img src={ortsbild('',d.image_url)} alt="Stimmungsbild zum Angebot" loading="lazy"/><span className="v3-image-note">Stimmungsbild</span></div><div className="v3-offer-copy"><span className="v3-eyebrow">{d.demo?'MUSTERANGEBOT · NICHT EINLÖSBAR':'LOKALES ANGEBOT'}</span><h3>{d.title}</h3><p>{d.details}</p><small>{d.business_name}</small><DealActions deal={d} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash}/></div></article>)}</div>
 </section>
</main>}
{page==='community'&&<main className="inner-page v3-community-page">
 <div className="page-title v3-page-head"><small>04 / MENSCHEN DER STADT</small><h1>Frankfurt verbindet<em>.</em></h1><p>Lieblingsorte, kleine Geschichten und ein Blick auf die Stadt durch andere Augen.</p></div>
 <section className="v4-groups-preview"><span className="v3-eyebrow">GEMEINSAM AKTIV</span><h2 className="v4-group-heading">Laufen. Spazieren. Lesen.</h2><p className="v4-group-sub">Entdecke, wie Frankfurter Gruppen künftig eigene Treffen präsentieren können. Die folgenden Profile sind Ideen für die Vorschau, keine bestätigten Anbieter.</p><div className="v4-group-grid">{vorschauGruppen.map(g=><article key={g.id} className="v4-group"><small>{g.typ} · MUSTERGRUPPE</small><h3>{g.name}</h3><p>{g.beschreibung}</p></article>)}</div></section><div className="v3-community-layout"><section className="v3-community-posts"><div className="v3-section-head"><div><span className="v3-eyebrow">STIMMEN AUS FRANKFURT</span><h2>Unsere Geschichten.</h2></div></div><div className="ffm-follow-filter" role="group" aria-label="Community-Feed">
    <button type="button" className={!followingOnly?'active':''} aria-pressed={!followingOnly} onClick={()=>setFollowingOnly(false)}>Alle Beiträge</button>
    <button type="button" className={followingOnly?'active':''} aria-pressed={followingOnly} onClick={()=>{if(!user){setAuth(true);return;}setFollowingOnly(true)}}>Folge ich</button>
   </div>
   {followingOnly&&posts.length===0&&<p className="ffm-follow-empty">Noch keine Beiträge von Personen oder Unternehmen, denen du folgst.</p>}
   <div className="v3-post-grid">{sichtbarePosts.map(p=><article className="v3-post-card" key={p.id}>
  <div className="v3-post-image"><img src={ortsbild('',p.image_url)} alt="Stimmungsbild zum Beitrag" loading="lazy"/><span className="v3-image-note">Stimmungsbild</span></div>
  <div className="v3-post-content"><div className="v3-post-person"><span className="v3-avatar">{p.display_name.charAt(0).toUpperCase()}</span><div><strong>{p.display_name}</strong><small>{p.place_name||'Frankfurt'} · {date(p.created_at,lang)}</small></div>
   {!p.demo&&p.author_id&&<FollowButton key={p.author_id} targetType="user" targetId={p.author_id} initialFollowing={Boolean(p.following_author)} own={Boolean(p.own_post)} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash} onChanged={()=>{if(followingOnly)setRefresh(v=>v+1)}}/>}
   </div><p>{p.body}</p>
   {p.demo?<span className="v3-demo-label">Musterbeitrag · erfundenes Profil</span>:
    <PostEngagement postId={p.id} likes={p.likes_count||0} comments={p.comments_count||0} liked={Boolean(p.liked)} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash}/>} </div>
 </article>)}</div></section>
  <aside className="panel v3-community-compose"><span className="v3-eyebrow">MITMACHEN</span><h2>Und deine Geschichte?</h2><p>Zeig uns Frankfurt aus deiner Perspektive. Neue Beiträge werden vor der Veröffentlichung geprüft.</p>{user?<form onSubmit={e=>handle(e,'posts')}><textarea name="body" maxLength={1000} required placeholder={t.postPlaceholder}/><button className="primary-btn small">{t.post}<Plus size={16}/></button></form>:<button className="primary-btn small" onClick={()=>setAuth(true)}>{t.sign}<Plus size={16}/></button>}</aside>
 </div>
</main>}
{page==='business'&&<main className="inner-page"><div className="page-title"><small>LOKALE UNTERNEHMEN</small><h1>{t.businessTitle}</h1><p>{t.businessIntro}</p></div>{!user?<div className="panel standalone"><Building2 size={36}/><h2>{t.businessRegister}</h2><p>{t.sign}</p><button className="primary-btn" onClick={()=>setAuth(true)}>{t.sign}<span className="ui-dot" aria-hidden="true"/></button></div>:!business?<div className="panel standalone"><h2>{t.businessRegister}</h2><form onSubmit={e=>handle(e,'businesses')}>{formField(t.company,'name',true)}{formField(t.registry,'registry_reference')}<button className="primary-btn">{t.send}<span className="ui-dot" aria-hidden="true"/></button></form></div>:<><div className="business-status"><div><small>UNTERNEHMENSBEREICH</small><h2>{business.name}</h2><p>{business.status==='approved'?'✓ BESTÄTIGT':'◌ '+t.pending}</p></div><Building2 size={44}/></div><div className="dashboard-grid"><div className="panel"><h2>{t.claim}</h2><form onSubmit={e=>handle(e,'claims')}><label className="form-label">{t.discover}<select name="place_id" required><option value="">—</option>{places.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label className="form-label">{t.claimNote}<textarea name="note" maxLength={500}/></label><button className="primary-btn small">{t.send}<span className="ui-dot" aria-hidden="true"/></button></form></div><div className="panel"><h2>{t.offer}</h2><p>{t.pending}</p><form onSubmit={e=>handle(e,'deals')}><label className="form-label">{t.title}<input name="title" required/></label><label className="form-label">{t.offerText}<textarea name="details"/></label><button className="primary-btn small" disabled={business.status!=='approved'}>{t.send}<span className="ui-dot" aria-hidden="true"/></button></form></div></div>{businessDetail&&<BusinessBranchEditor places={businessDetail.places||[]} changes={businessDetail.changes||[]} businessStatus={business.status} onNotice={flash} onChanged={()=>setRefresh(v=>v+1)}/>}<BusinessCouponRedeem status={business.status} onNotice={flash}/>{businessDetail&&<p className="subdued">{businessDetail.claims.length} Anfragen · {businessDetail.deals.length} Angebote</p>}</>}<section className="v3-business-preview"><div className="v3-section-head"><div><span className="v3-eyebrow">SO KÖNNTE DEIN ANGEBOT AUSSEHEN</span><h2>Mehr Sichtbarkeit vor Ort.</h2></div></div><div className="v3-offer-grid">{vorschauAngebote.map(a=><article className="v3-offer-card" key={a.id}><div className="v3-offer-image"><img src={ortsbild('',a.image_url)} loading="lazy" alt="Stimmungsbild zum Musterangebot"/><span className="v3-image-note">Stimmungsbild</span></div><div className="v3-offer-copy"><span className="v3-eyebrow">MUSTERANGEBOT · NICHT EINLÖSBAR</span><h3>{a.title}</h3><p>{a.details}</p><small>{a.business_name}</small></div></article>)}</div></section></main>}
  {page==='admin'&&(user?.role==='admin'?<AdminStudio onChanged={()=>setRefresh(n=>n+1)}/>:<main className="inner-page"><div className="empty"><LockKeyhole/><p>Zugriff nur für die Redaktion. Bitte melde dich als Administrator an.</p></div></main>)}
  <footer className="footer"><div className="footer-top"><div><strong>ffm<b>aktuell</b><em>.</em></strong><p>FRANKFURT VON INNEN. DEINE STADT, DEIN BLICK.</p></div><div><button onClick={()=>navigate('discover')}>{t.discover}</button><button onClick={()=>navigate('events')}>{t.events}</button><button onClick={()=>navigate('business')}>{t.business}</button></div></div><div className="footer-bottom"><span>© 2026 FFM Aktuell</span><span>Frankfurt am Main</span></div></footer>
  <nav className="mobile-bottom">{nav.map(([p,Icon,title])=><button className={page===p?'active':''} key={p} onClick={()=>navigate(p)}><Icon size={21}/><span>{title}</span></button>)}</nav>
  {selected&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="place-dialog" role="dialog" aria-modal="true" aria-label="Ortsdetails"><div className="ffm-place-dialog-header"><span>Ortsdetails</span><button type="button" className="dialog-close" aria-label="Details schließen" onClick={()=>setSelected(null)}><X size={20}/></button></div><div className="dialog-body">{selected.demo&&<span className="v3-demo-label">Musterort – noch keine redaktionelle Freigabe</span>}<small>{catBezeichnungen[selected.category]||selected.category} / {selected.district}</small><p className="v4-place-check">{selected.candidate?'OSM · Ungeprüft':statusLabel(selected)}{selected.verified_at&&frischBestaetigt(selected)?' · Zuletzt geprüft: '+date(selected.verified_at,lang):''}</p><h2>{selected.name}</h2><p>{!selected.candidate&&(lang==='de'?selected.description_de||selected.description_en:selected.description_en||selected.description_de)}</p><p className="address"><MapPin size={16}/>{selected.address}</p><PlaceActions key={selected.id} venue={selected} saved={favorites.includes(selected.id)} loggedIn={Boolean(user)}
 onSave={()=>favorite(selected.id)} onLogin={()=>setAuth(true)} onNotice={flash}
 onReport={(reason,message)=>submit('place-reports',{place_id:selected.id,reason,message},'Danke! Die Redaktion prüft deine Meldung.')}
 onPost={body=>submit('posts',{body,place_id:selected.id},'Dein Tipp wartet auf Freigabe.')}
/>{!selected.demo&&!selected.candidate&&selected.business_id&&<div className="ffm-venue-follow">
  <span>Dieses Unternehmen</span>
  <FollowButton key={selected.business_id} targetType="business" targetId={selected.business_id} initialFollowing={Boolean(selected.following_business)} own={false} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash}/>
 </div>}<VenueReviews key={selected.id} placeId={selected.id} demo={Boolean(selected.demo)} loggedIn={Boolean(user)} onLogin={()=>setAuth(true)} onNotice={flash}/>{selected.candidate&&<p className="v5-candidate-alert">Betrieb und Öffnungszeiten nicht geprüft. Bitte beim Anbieter nachsehen.</p>}{selected.verification_source&&<a className="source" target="_blank" rel="noopener noreferrer" href={selected.verification_source}>Quelle der Betriebsprüfung</a>}{selected.source_url&&<a className="source" target="_blank" rel="noopener noreferrer" href={selected.source_url}>{t.source}<span className="ui-dot" aria-hidden="true"/></a>}<p className="fineprint">{t.notice}</p></div><PlaceLocationMap key={selected.id} name={selected.name} address={selected.address} latitude={selected.latitude} longitude={selected.longitude}/></div></div>}
  {auth&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAuth(false)}}><div className="auth-dialog" role="dialog" aria-modal="true"><button className="dialog-close" onClick={()=>setAuth(false)}><X/></button><span className="auth-mark">F✳</span><small>DEIN ZUGANG ZU FFM AKTUELL</small><h2>{register?t.register:t.welcome}</h2><form onSubmit={onAuth}>{register&&formField(t.name,'display_name',true)}{formField(t.email,'email',true,'email')}{formField(t.password,'password',true,'password')}<button className="primary-btn">{register?t.register:t.login}<span className="ui-dot" aria-hidden="true"/></button></form><button className="switch-auth" onClick={()=>setRegister(!register)}>{register?t.login:t.register}<span className="ui-dot" aria-hidden="true"/></button></div></div>}
 </div>;
}
