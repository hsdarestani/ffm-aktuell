'use client';
import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {
 ArrowRight,ArrowUpRight,BarChart3,Building2,Check,ChevronLeft,ChevronRight,
 CircleHelp,Clock3,Compass,ExternalLink,FileCheck2,Filter,Flag,LayoutDashboard,
 MapPin,MapPinned,Menu,Newspaper,Plus,RefreshCw,Search,ShieldCheck,ShieldAlert,
 Sparkles,SquarePen,UsersRound,X,CalendarDays,CheckCheck,EyeOff,Globe2
} from 'lucide-react';
import {KATEGORIEN} from '@/lib/ortskategorien';
import {EDITORIAL_SOURCE_LEADS} from '@/lib/editorial-source-leads';
import MediaEditorial from '@/components/MediaEditorial';
import CatalogStudio from '@/components/CatalogStudio';
import CampaignStudio from '@/components/CampaignStudio';
import AdminTeamSeats from '@/components/AdminTeamSeats';
import AdminTariffs from '@/components/AdminTariffs';
import NotificationStudio from '@/components/NotificationStudio';
import AdminRoles from '@/components/AdminRoles';
import ServiceStatus from '@/components/ServiceStatus';
import DataQualityStudio from '@/components/DataQualityStudio';
import '@/app/data-quality.css';
import '@/app/tariffs.css';
import '@/app/team-management.css';
import '@/app/campaigns.css';
import '@/app/catalog-studio.css';

type View='overview'|'review'|'moderation'|'publish'|'catalog'|'ads'|'team'|'tariffs'|'quality'|'services'|'roles'|'notifications';
type PublishMode='place'|'news'|'event';
type ReviewMode='unverified'|'needs_review'|'existing';
type Candidate={osm_id:string;name:string;category:string;address:string|null;website:string|null;phone:string|null;opening_hours:string|null;last_osm_check:string|null;osm_url:string;latitude:number;longitude:number};
type Stats={kandidaten:number;rueckfragen:number;ausgeblendet:number;apotheken:number;aktuell_geprueft:number;offen_zur_pruefung:number};
type Due={id:string;name:string;category:string;verified_at:string|null;verification_source?:string|null;verification_note?:string|null};
type Place={id:string;name:string;category:string;address?:string;verification_status:string;activity_status:string};
type QueueItem={id:string;name?:string;title?:string;body?:string;business_name?:string;place_name?:string;note?:string;rating?:number;review_id?:string};
type Queue=Record<'businesses'|'claims'|'places'|'deals'|'posts'|'reports'|'reviews'|'reviewReports'|'comments'|'branchChanges',QueueItem[]>;
type Notice={kind:'success'|'error';text:string};
type IconComponent=typeof LayoutDashboard;
const emptyQueue:Queue={businesses:[],claims:[],places:[],deals:[],posts:[],reports:[],reviews:[],reviewReports:[],comments:[],branchChanges:[]};
const NAV:{view:View;label:string;small:string;icon:IconComponent;index:string}[]=[
 {view:'overview',label:'Heute',small:'Heute',icon:LayoutDashboard,index:'01'},
 {view:'review',label:'Orte prüfen',small:'Prüfen',icon:MapPinned,index:'02'},
 {view:'moderation',label:'Freigaben',small:'Freigaben',icon:ShieldCheck,index:'03'},
 {view:'publish',label:'Erstellen',small:'Erstellen',icon:SquarePen,index:'04'},
 {view:'catalog',label:'Kategorien',small:'Rubriken',icon:Filter,index:'05'},
 {view:'ads',label:'Werbung',small:'Werbung',icon:BarChart3,index:'06'},
 {view:'team',label:'Teamplätze',small:'Teams',icon:UsersRound,index:'07'},
 {view:'tariffs',label:'Tarife',small:'Tarife',icon:BarChart3,index:'08'},
 {view:'quality',label:'Datenqualität',small:'Qualität',icon:FileCheck2,index:'09'},
 {view:'services',label:'Dienste',small:'Dienste',icon:FileCheck2,index:'10'},
 {view:'roles',label:'Berechtigungen',small:'Rechte',icon:ShieldCheck,index:'11'},
 {view:'notifications',label:'Stadttipps',small:'Tipps',icon:SquarePen,index:'12'}
];
const queueNames:{key:keyof Queue;title:string;singular:string}[]=[
 {key:'businesses',title:'Unternehmen',singular:'business'},
 {key:'claims',title:'Inhaberschaft',singular:'claim'},
 {key:'places',title:'Orte',singular:'place'},
 {key:'deals',title:'Angebote',singular:'deal'},
 {key:'posts',title:'Beiträge',singular:'post'},
 {key:'reports',title:'Ortsmeldungen',singular:'report'},
 {key:'reviews',title:'Bewertungen',singular:'review'},
 {key:'reviewReports',title:'Gemeldete Bewertungen',singular:'reviewReport'},
 {key:'comments',title:'Kommentare',singular:'comment'},
 {key:'branchChanges',title:'Standortänderungen',singular:'branchChange'}
];
const fmt=(value:number|undefined)=>new Intl.NumberFormat('de-DE').format(value||0);
const safeLink=(value:string|null|undefined)=>{try{const u=new URL(value||'');return ['http:','https:'].includes(u.protocol)?u.toString():null}catch{return null}};
const today=()=>new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long',day:'numeric',month:'long'}).format(new Date());
async function request<T>(path:string,payload?:unknown):Promise<T>{
 const result=await fetch('/api/'+path,{method:payload===undefined?'GET':'POST',
  credentials:'same-origin',cache:'no-store',headers:payload===undefined?undefined:{'Content-Type':'application/json'},
  body:payload===undefined?undefined:JSON.stringify(payload)});
 const text=await result.text();
 let data:{error?:string}&T;
 try{data=JSON.parse(text)}catch{throw Error('Der Server hat keine gültige Antwort geliefert.')}
 if(!result.ok)throw Error(data.error||'Die Aktion konnte nicht ausgeführt werden.');
 return data;
}
function Skyline({large=false}:{large?:boolean}){
 return <svg aria-hidden="true" viewBox="0 0 610 148" className={'ffm-studio-skyline'+(large?' big':'')} fill="none" preserveAspectRatio="xMidYMax meet">
  <path d="M2 126H42V93H65V126H94V51H112V126H133V77H147V58H156V77H165V126H189V38H204V25H215V38H228V126H254V66H278V126H304V43H316V24H326V43H337V126H354V69H373V126H395V34H409V9H418V34H431V126H454V82H476V126H504V53H520V126H548V99H570V126H608" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  <path d="M2 141H609M316 24V3M411 9V1M147 58V40" stroke="currentColor" opacity=".3" strokeWidth="1.5"/>
  <circle cx="316" cy="24" r="3.5" fill="currentColor"/><circle cx="411" cy="9" r="3.5" fill="currentColor"/>
 </svg>;
}
function Mark(){return <svg aria-hidden="true" className="ffm-studio-mark" viewBox="0 0 44 44" fill="none">
 <path d="M3 28L12 17L18 24L27 9L41 25" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
 <path d="M19 38V26L27 21V38M28 38V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
 <circle cx="37" cy="9" r="3" fill="#FFAD66"/>
 </svg>}
function Caption({children}:{children:React.ReactNode}){return <span className="ffm-studio-overline">{children}</span>}
function DateStamp(){return <span className="ffm-studio-date"><span className="ffm-studio-status-dot"/> {today()} · Frankfurt am Main</span>}
function CityPanel({children,className=''}:{children:React.ReactNode;className?:string}){return <section className={'ffm-studio-panel '+className}>{children}</section>}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}){return <label className="ffm-studio-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>}

export default function AdminStudio({onChanged,permissions=['*']}:{onChanged:()=>void;permissions?:string[]}){
 const root=permissions.includes('*');
 const allowed=(cap:string)=>root||permissions.includes(cap);
 const navPermission:Record<View,string>={overview:'root',review:'editorial',moderation:'access',publish:'editorial',catalog:'editorial',ads:'marketing',team:'business',tariffs:'finance',quality:'editorial',services:'operations',roles:'root',notifications:'editorial'};
 const availableNav=NAV.filter(n=>root||navPermission[n.view]==='access'&&permissions.some(p=>['editorial','moderation','business','marketing'].includes(p))||allowed(navPermission[n.view]));
 const queuePermission:Record<keyof Queue,string>={businesses:'business',claims:'business',places:'editorial',deals:'marketing',posts:'moderation',reports:'moderation',reviews:'moderation',reviewReports:'moderation',comments:'moderation',branchChanges:'business'};
 const visibleQueues=queueNames.filter(q=>allowed(queuePermission[q.key]));
 const [view,setView]=useState<View>(availableNav[0]?.view||'moderation');
 const [reviewMode,setReviewMode]=useState<ReviewMode>('unverified');
 const [publishMode,setPublishMode]=useState<PublishMode>('place');
 const [stats,setStats]=useState<Stats|null>(null);
 const [due,setDue]=useState<Due[]>([]);
 const [places,setPlaces]=useState<Place[]>([]);
 const [queue,setQueue]=useState<Queue>(emptyQueue);
 const [candidates,setCandidates]=useState<Candidate[]>([]);
 const [total,setTotal]=useState(0);
 const [page,setPage]=useState(0);
 const [category,setCategory]=useState('');
 const [search,setSearch]=useState('');
 const [applied,setApplied]=useState('');
 const [selected,setSelected]=useState<Candidate|null>(null);
 const [selectedDue,setSelectedDue]=useState<Due|null>(null);
 const [drawer,setDrawer]=useState(false);
 const [reason,setReason]=useState('');
 const [notice,setNotice]=useState<Notice|null>(null);
 const [loading,setLoading]=useState(true);
 const [loadingList,setLoadingList]=useState(true);
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const [queueSection,setQueueSection]=useState<keyof Queue>(visibleQueues[0]?.key||'businesses');
 const [mobileMenu,setMobileMenu]=useState(false);
 const [detailDecision,setDetailDecision]=useState(false);
 const [newPlaceId,setNewPlaceId]=useState('');

 const refresh=useCallback(()=>{setRevision(n=>n+1);onChanged()},[onChanged]);
 const navigate=useCallback((next:View)=>{
  if(!availableNav.some(n=>n.view===next))return;setView(next);setMobileMenu(false);setNotice(null);setDrawer(false);
 },[permissions.join(',')]);
 useEffect(()=>{const id=setTimeout(()=>{setPage(0);setApplied(search.trim())},290);return()=>clearTimeout(id)},[search]);
 useEffect(()=>{
  let active=true;
  const run=async()=>{
   try{
    const [a,b,c]=await Promise.all([
     allowed('editorial')?request<{stats:Stats;recheck:Due[]}>('admin/validation'):Promise.resolve({stats:null,recheck:[]}),
     request<Queue>('admin/queue'),
     request<{items:Place[]}>('places')
    ]);
    if(!active)return;
    setStats(a.stats);setDue(a.recheck);setQueue(b);setPlaces(c.items);setLoading(false);
   }catch(e){if(active){setNotice({kind:'error',text:(e as Error).message});setLoading(false)}}
  };
  void run();return()=>{active=false};
 },[revision]);
 useEffect(()=>{
  let active=true;
  if(!allowed('editorial')){setLoadingList(false);return}
  setLoadingList(true);
  const params=new URLSearchParams({state:reviewMode==='existing'?'unverified':reviewMode,page:String(page),q:applied,category});
  request<{items:Candidate[];total:number}>('admin/candidates?'+params)
   .then(result=>{if(!active)return;setCandidates(result.items);setTotal(result.total);
     setSelected(previous=>result.items.find(item=>item.osm_id===previous?.osm_id)||result.items[0]||null);
     setLoadingList(false);
   }).catch(e=>{if(active){setLoadingList(false);setCandidates([]);setTotal(0);setNotice({kind:'error',text:(e as Error).message})}});
  return()=>{active=false};
 },[reviewMode,page,applied,category,revision]);
 async function action(path:string,body:unknown,success:string){
  if(busy)return false;
  setBusy(true);setNotice(null);
  try{
   await request(path,body);
   setNotice({kind:'success',text:success});refresh();return true;
  }catch(e){setNotice({kind:'error',text:(e as Error).message});return false}
  finally{setBusy(false)}
 }
 const currentCount=visibleQueues.reduce((n,{key})=>n+(queue[key]?.length||0),0);
 const hasReviewTarget=Boolean(selected);
 const openCandidate=(item:Candidate)=>{setSelected(item);setSelectedDue(null);setReason('');setDetailDecision(false);setDrawer(true)};
 const openDue=(item:Due)=>{setSelectedDue(item);setDrawer(true);setReason('');setDetailDecision(false)};
 const handleDecision=async(decision:'hide'|'needs_review')=>{
  if(!selected||reason.trim().length<10){setNotice({kind:'error',text:'Bitte den Grund in mindestens 10 Zeichen beschreiben.'});return}
  if(decision==='hide'&&!window.confirm('Diesen OSM Kandidaten wirklich ausblenden?'))return;
  const ok=await action('admin/review-candidate',{action:decision,osm_id:selected.osm_id,reason:reason.trim()},decision==='hide'?'Ort ausgeblendet.':'Zur Rückfrage vorgemerkt.');
  if(ok){setDrawer(false);setSelected(null);setReason('')}
 };
 async function submitCandidate(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selected)return;
  const f=new FormData(e.currentTarget);
  const body={
   action:'publish',osm_id:selected.osm_id,
   verification_source:String(f.get('verification_source')||''),
   verification_method:String(f.get('verification_method')||'betreiber_webseite'),
   verification_note:String(f.get('verification_note')||''),
   confirms_existence:f.has('confirms_existence'),
   confirms_address:f.has('confirms_address'),
   confirms_operation:f.has('confirms_operation'),
   editorial_rank:Number(f.get('editorial_rank')||0),
   opening_hours_text:String(f.get('opening_hours_text')||'')
  };
  if(!window.confirm('Ist die unabhängige Primärquelle geprüft und der Betrieb aktuell bestätigt?'))return;
  const ok=await action('admin/review-candidate',body,'Ort mit Quellenbeleg freigegeben. Kein Live Öffnungsstatus.');
  if(ok){setDrawer(false);setSelected(null)}
 }
 async function submitExisting(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selectedDue)return;
  const f=new FormData(e.currentTarget);
  const body={id:selectedDue.id,activity_status:String(f.get('activity_status')||'unknown'),
   verification_source:String(f.get('verification_source')||''),
   verification_method:String(f.get('verification_method')||'betreiber_webseite'),
   verification_note:String(f.get('verification_note')||''),
   confirms_existence:f.has('confirms_existence'),confirms_address:f.has('confirms_address'),confirms_status:f.has('confirms_status'),
   editorial_rank:Number(f.get('editorial_rank')||0),opening_hours_text:String(f.get('opening_hours_text')||'')};
  const ok=await action('admin/verify-place',body,'Bestehender Ort erneut geprüft und aktualisiert.');
  if(ok){setSelectedDue(null);setDrawer(false)}
 }
 async function moderation(type:keyof Queue,item:QueueItem,approve:boolean){
  if(!approve&&!window.confirm('Diesen Eintrag wirklich ablehnen?'))return;
  if(type==='branchChanges'){
   await action('admin/review-place-change',{id:item.id,approve},approve?'Standortdaten übernommen. Erneute Betriebsprüfung erforderlich.':'Standortänderung abgelehnt.');return;
  }
  if(type==='reviews'){
   await action('admin/moderate-review',{id:item.id,approve},
    approve?'Bewertung veröffentlicht.':'Bewertung abgelehnt.');
   return;
  }
  if(type==='reviewReports'){
   await action('admin/moderate-review-report',{id:item.id,reviewed:approve},
    approve?'Meldung geprüft, Bewertung bleibt bis zu einer eigenen Entscheidung sichtbar.':'Meldung zurückgewiesen.');
   return;
  }
  if(type==='reports'){
   await action('admin/review-report',{id:item.id,reviewed:approve},
    approve?'Meldung geprüft. Den Ortsstatus nur nach unabhängiger Verifikation ändern.':'Meldung zurückgewiesen.');
   return;
  }
  const name=visibleQueues.find(q=>q.key===type)?.singular;
  await action('admin/review',{type:name,id:item.id,approve},approve?'Freigabe gespeichert.':'Eintrag abgelehnt.');
 }
 async function publish(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  const form=e.currentTarget,f=new FormData(form);
  const value=(key:string)=>String(f.get(key)||'').trim();
  let body:Record<string,unknown>,endpoint:string;
  if(publishMode==='place'){
   endpoint='admin/places';
   body={name:value('name'),category:value('category'),district:value('district'),address:value('address'),
    description_de:value('description_de'),website:value('website'),source_url:value('source_url'),
    latitude:value('latitude')===''?null:Number(value('latitude')),
    longitude:value('longitude')===''?null:Number(value('longitude'))};
   if((body.latitude!==null&&!Number.isFinite(body.latitude))||(body.longitude!==null&&!Number.isFinite(body.longitude))){
    setNotice({kind:'error',text:'Bitte gültige geografische Koordinaten eingeben.'});return;
   }
  }else if(publishMode==='event'){
   endpoint='admin/events';
   const at=new Date(value('starts_at'));
   if(!Number.isFinite(at.getTime())){setNotice({kind:'error',text:'Bitte Datum und Uhrzeit angeben.'});return}
   const end=value('ends_at')?new Date(value('ends_at')):null;
   const price=value('price_eur')===''?null:Number(value('price_eur'));
   if(end&&!Number.isFinite(end.getTime())){setNotice({kind:'error',text:'Bitte gültiges Enddatum angeben.'});return}
   if(price!==null&&(!Number.isFinite(price)||price<0||!value('price_source_url'))){setNotice({kind:'error',text:'Ein Preis benötigt einen belegbaren Quellenlink.'});return}
   body={title:value('title'),venue:value('venue'),description_de:value('description_de'),starts_at:at.toISOString(),
    ends_at:end?.toISOString()||null,category:value('category'),organizer:value('organizer'),
    price_cents:price===null?null:Math.round(price*100),price_source_url:value('price_source_url'),
    source_url:value('source_url'),ticket_url:value('ticket_url')};
  }else{
   endpoint='admin/news';const at=value('published_at')?new Date(value('published_at')):null;
   if(at&&!Number.isFinite(at.getTime())){setNotice({kind:'error',text:'Bitte ein gültiges Veröffentlichungsdatum angeben.'});return}
   body={title:value('title'),body_de:value('body_de'),category:value('category'),source_url:value('source_url'),published_at:at?.toISOString()||null};
  }
  const planned=publishMode==='news'&&typeof body.published_at==='string'&&Date.parse(body.published_at)>Date.now();
  if(!window.confirm(planned?'Beitrag für das angegebene Datum zur Veröffentlichung vormerken?':'Diesen Inhalt jetzt öffentlich veröffentlichen?'))return;
  const ok=await action(endpoint,body,planned?'Beitrag zur Veröffentlichung eingeplant.':'Veröffentlicht. Dein Frankfurt wächst.');
  if(ok){form.reset();setNewPlaceId(String(Date.now()))}
 }
 const actual=reviewMode==='existing'?due:[]; const totalPages=Math.max(1,Math.ceil(total/25));
 const reviewDetail=selectedDue?(
  <div key={selectedDue.id} className="ffm-studio-detail">
   <div className="ffm-studio-detail-top"><Caption>ERNEUT PRÜFEN</Caption><span className="ffm-studio-pill warn">Fällig</span></div>
   <h2>{selectedDue.name}</h2><p className="ffm-studio-muted">{selectedDue.category} · Letzte Prüfung: {selectedDue.verified_at?new Date(selectedDue.verified_at).toLocaleDateString('de-DE'):'Keine'}</p>
   <p className="ffm-studio-note"><ShieldAlert size={17}/> Quelle erneut prüfen.</p>
   <button type="button" className="ffm-simple-start" aria-expanded={detailDecision} onClick={()=>setDetailDecision(v=>!v)}><FileCheck2 size={19}/>{detailDecision?"Prüfung schließen":"Prüfung starten"}<ChevronRight size={19}/></button>
   {detailDecision&&<form className="ffm-studio-form ffm-simple-review-form" onSubmit={submitExisting}>
    <div className="ffm-studio-form-pair">
     <Field label="Betriebsstatus"><select name="activity_status"><option value="operating">In Betrieb</option><option value="temporarily_closed">Vorübergehend geschlossen</option><option value="permanently_closed">Dauerhaft geschlossen</option><option value="unknown">Unklar</option></select></Field>
     <Field label="Prüfweg"><select name="verification_method"><option value="betreiber_webseite">Offizielle Betreiberseite</option><option value="betreiber_kontakt">Betreiberkontakt</option><option value="behoerde">Behörde</option></select></Field>
    </div>
    <Field label="Unabhängiger Quellenlink (HTTPS)"><input name="verification_source" type="url" required placeholder="https://..." defaultValue={selectedDue.verification_source||''}/></Field>
    <Field label="Prüfprotokoll" hint="Mindestens 25 Zeichen · Wer hat was und wann geprüft?"><textarea name="verification_note" required minLength={25} maxLength={2000} rows={3} defaultValue={selectedDue.verification_note||''}/></Field>
    <div className="ffm-studio-checks"><label><input type="checkbox" name="confirms_existence" required/> Existenz geprüft</label><label><input type="checkbox" name="confirms_address" required/> Standort geprüft</label><label><input type="checkbox" name="confirms_status" required/> Betriebsstatus geprüft</label></div>
    <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Weitere Angaben</summary><div className="ffm-studio-form-pair"><Field label="Redaktionelle Priorität"><input type="number" name="editorial_rank" min={0} max={100} defaultValue={0}/></Field><Field label="Bestätigte Öffnungszeiten"><input name="opening_hours_text" placeholder="Optional"/></Field></div></details>
    <button className="ffm-studio-primary" disabled={busy}><FileCheck2 size={18}/> Prüfung speichern <ArrowRight size={18}/></button>
   </form>}
  </div>
 ):selected?(
  <div key={selected.osm_id} className="ffm-studio-detail">
   <div className="ffm-studio-detail-top"><Caption>ORTSDATEN</Caption><span className="ffm-studio-pill warn">Ungeprüft</span></div>
   <div className="ffm-studio-detail-name"><h2>{selected.name}</h2><div className="ffm-studio-location-mark"><MapPin size={20}/></div></div>
   <p className="ffm-studio-muted">{selected.category} · {selected.address||'Noch keine Adresse hinterlegt'}</p>
   <details className="ffm-simple-geo"><summary>Weitere Ortsdaten <ChevronRight size={15}/></summary><div className="ffm-studio-geo-line"><span><MapPin size={14}/> {Number(selected.latitude).toFixed(4)}° N, {Number(selected.longitude).toFixed(4)}° O</span><span><Clock3 size={14}/> OSM {selected.last_osm_check||'Datum unbekannt'}</span></div></details>
   <div className="ffm-studio-source-strip"><ShieldAlert size={17}/><span>Betrieb noch nicht bestätigt.</span></div>
   <div className="ffm-studio-linkline">{safeLink(selected.osm_url)&&<a href={safeLink(selected.osm_url)!} target="_blank" rel="noopener noreferrer">OSM <ExternalLink size={14}/></a>}{safeLink(selected.website)&&<a href={safeLink(selected.website)!} target="_blank" rel="noopener noreferrer">Webseite <ExternalLink size={14}/></a>}</div>
   <button type="button" className="ffm-simple-start" aria-expanded={detailDecision} onClick={()=>setDetailDecision(v=>!v)}><FileCheck2 size={19}/>{detailDecision?"Prüfung schließen":"Prüfung starten"}<ChevronRight size={19}/></button>
   {detailDecision&&<form className="ffm-studio-form ffm-simple-review-form" onSubmit={submitCandidate}>
    <div className="ffm-studio-formheading"><h3>Quelle bestätigen</h3></div>
    <Field label="Unabhängiger Quellenlink (HTTPS)"><input name="verification_source" type="url" required placeholder="https://offizielle-betreiberseite.de" defaultValue={safeLink(selected.website)?.startsWith('https://')?selected.website||'':''}/></Field>
    <Field label="Wie wurde geprüft?"><select name="verification_method"><option value="betreiber_webseite">Offizielle Betreiberseite</option><option value="betreiber_kontakt">Betreiber persönlich kontaktiert</option><option value="behoerde">Amtliche Quelle</option></select></Field>
    <Field label="Prüfnotiz" hint="Mindestens 25 Zeichen. Beschreibe die aktuelle Quelle und das Datum."><textarea name="verification_note" minLength={25} maxLength={2000} rows={3} required placeholder="Quelle und Datum der Bestätigung, geprüfter Standort, aktueller Betrieb ..."/></Field>
    <div className="ffm-studio-formheading"><h3>3 Kontrollen</h3></div>
    <div className="ffm-studio-checks"><label><input type="checkbox" name="confirms_existence" required/> Existenz unabhängig bestätigt</label><label><input type="checkbox" name="confirms_address" required/> Identität und Adresse verglichen</label><label><input type="checkbox" name="confirms_operation" required/> Aktuellen Betrieb nachgewiesen</label></div>
    <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Weitere Angaben</summary><div className="ffm-studio-form-pair">
     <Field label="Redaktionelle Priorität"><input type="number" name="editorial_rank" min={0} max={100} defaultValue={0}/></Field>
     <Field label="Geprüfte reguläre Öffnungszeiten"><input name="opening_hours_text" maxLength={300} placeholder="Optional"/></Field>
    </div></details>
    
    <button type="submit" disabled={busy} className="ffm-studio-primary"><CheckCheck size={18}/>{busy?'Wird gespeichert …':'Mit Beleg freigeben'}<ArrowRight size={18}/></button>
   </form>}
   <details className="ffm-studio-decision ffm-simple-danger"><summary><Flag size={15}/> Rückfrage oder ausblenden <ChevronRight size={16}/></summary>
    <Field label="Grund für Rückfrage oder Ausblendung"><textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={10} rows={2} placeholder="Mindestens 10 Zeichen"/></Field>
    <div className="ffm-studio-decision-row"><button disabled={busy} type="button" className="ffm-studio-secondary" onClick={()=>void handleDecision('needs_review')}><Flag size={16}/> Rückfrage</button><button disabled={busy} type="button" className="ffm-studio-quiet-danger" onClick={()=>void handleDecision('hide')}><EyeOff size={16}/> Ausblenden</button></div>
   </details>
  </div>
 ):<div className="ffm-studio-no-selection"><div className="ffm-studio-orbit"><Compass size={40}/><span/></div><Caption>DIE STADT WARTET</Caption><h3>Wähle einen Ort.</h3><p>Links eine Adresse öffnen, Quelle prüfen und eine sichere Entscheidung treffen.</p></div>;

 return <main className="ffm-studio" aria-label="FFM Redaktion">
  <aside className={'ffm-studio-rail'+(mobileMenu?' open':'')}>
   <div className="ffm-studio-rail-top">
    <div className="ffm-studio-brand"><Mark/><div><strong>ffm<span>.</span>aktuell</strong><small>STADTSTUDIO / REDAKTION</small></div></div>
    <button className="ffm-studio-closemenu" onClick={()=>setMobileMenu(false)} aria-label="Menü schließen"><X size={20}/></button>
   </div>
   
   <nav className="ffm-studio-rail-nav" aria-label="Redaktionsbereiche">
    {availableNav.map(n=><button type="button" key={n.view} className={view===n.view?'active':''} aria-current={view===n.view?'page':undefined} onClick={()=>navigate(n.view)}>
     <n.icon size={19} strokeWidth={1.8}/><span>{n.label}</span><small>{n.index}</small></button>)}
   </nav>
   <div className="ffm-studio-rail-bottom">
    
    
    <a href="/" className="ffm-studio-back">Zur Stadtansicht <ArrowUpRight size={15}/></a>
   </div>
  </aside>

  <div className="ffm-studio-work">
   <header className="ffm-studio-top">
    <div className="ffm-studio-mobile-brand"><Mark/><span>ffm<span>.</span>stadtstudio</span></div>
    <div className="ffm-studio-breadcrumb"><strong>FFM</strong> <span>/</span> {NAV.find(n=>n.view===view)?.label}</div>
    <div className="ffm-studio-top-end"><button type="button" title="Aktualisieren" aria-label="Daten aktualisieren" className="ffm-studio-refresh" onClick={refresh}><RefreshCw size={18}/></button><span className="ffm-studio-avatar">R</span></div>
    <button type="button" className="ffm-studio-menubutton" aria-label="Menü öffnen" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(v=>!v)}><Menu size={23}/></button>
   </header>
   <div className="ffm-studio-mobile-tabs">{availableNav.map(n=><button type="button" key={n.view} onClick={()=>navigate(n.view)} aria-current={view===n.view?'page':undefined} className={view===n.view?'active':''}><n.icon size={17}/>{n.small}</button>)}</div>

   <div className="ffm-studio-content">
    {view==='catalog'&&<CatalogStudio onNotice={(msg,success)=>setNotice({kind:success?'success':'error',text:msg})}/>}
    {view==='ads'&&<CampaignStudio onNotice={(msg,success)=>setNotice({kind:success?'success':'error',text:msg})}/>}
    {view==='team'&&<AdminTeamSeats onNotice={(msg,success)=>setNotice({kind:success?'success':'error',text:msg})}/>}
    {view==='tariffs'&&<AdminTariffs onNotice={(msg,success)=>setNotice({kind:success?'success':'error',text:msg})}/>}
    {view==='notifications'&&<NotificationStudio/>}
    {view==='roles'&&root&&<AdminRoles/>}
    {view==='services'&&<ServiceStatus/>}
    {view==='quality'&&<DataQualityStudio onNotice={(msg,success)=>setNotice({kind:success?'success':'error',text:msg})}/>}
    {notice&&<div role={notice.kind==='error'?'alert':'status'} className={'ffm-studio-notice '+notice.kind}><span>{notice.kind==='success'?<Check size={18}/>:<ShieldAlert size={18}/>}</span>{notice.text}<button type="button" onClick={()=>setNotice(null)} aria-label="Meldung schließen"><X size={16}/></button></div>}

    {view==='overview'&&<>
 <section className="ffm-simple-intro" aria-labelledby="ffm-simple-today">
  <div><span className="ffm-simple-kicker"><span className="ffm-studio-status-dot"/> FFM REDAKTION</span><h1 id="ffm-simple-today">Was steht <em>an?</em></h1></div>
  <span className="ffm-simple-todaydate">{today()}</span>
 </section>
 <section className="ffm-simple-actions" aria-label="Womit möchtest du beginnen?">
  <button type="button" className="ffm-simple-action mint" onClick={()=>{setReviewMode('unverified');navigate('review')}}>
   <span className="ffm-simple-action-icon"><MapPin size={29}/></span>
   <strong>Orte prüfen</strong><span className="ffm-simple-action-count">{loading?'…':fmt(stats?.kandidaten)}</span>
   <ChevronRight size={21} className="ffm-simple-action-arrow"/>
  </button>
  <button type="button" className="ffm-simple-action peach" onClick={()=>navigate('moderation')}>
   <span className="ffm-simple-action-icon"><ShieldCheck size={29}/></span>
   <strong>Freigaben</strong><span className="ffm-simple-action-count">{loading?'…':fmt(currentCount)}</span>
   <ChevronRight size={21} className="ffm-simple-action-arrow"/>
  </button>
  <button type="button" className="ffm-simple-action blue" onClick={()=>navigate('publish')}>
   <span className="ffm-simple-action-icon"><Plus size={31}/></span>
   <strong>Neu erstellen</strong><span className="ffm-simple-action-caption">Ort, Beitrag, Event</span>
   <ChevronRight size={21} className="ffm-simple-action-arrow"/>
  </button>
 </section>
 <div className="ffm-simple-stats">
  <button onClick={()=>{setReviewMode('needs_review');navigate('review')}}><Flag size={16}/><strong>{fmt(stats?.rueckfragen)}</strong><span>Rückfragen</span><ChevronRight size={16}/></button>
  <button onClick={()=>{setReviewMode('existing');navigate('review')}}><Clock3 size={16}/><strong>{fmt(stats?.offen_zur_pruefung)}</strong><span>Erneut prüfen</span><ChevronRight size={16}/></button>
  <span><CheckCheck size={16}/><strong>{fmt(stats?.aktuell_geprueft)}</strong><span>Frisch geprüft</span></span>
 </div>
 <section className="ffm-simple-next" aria-labelledby="ffm-simple-next-title">
  <div className="ffm-simple-next-head"><h2 id="ffm-simple-next-title">Nächste Orte</h2><button onClick={()=>navigate('review')}>Alle <ArrowRight size={17}/></button></div>
  {loadingList?<p role="status" className="ffm-studio-loading">Wird geladen …</p>:
   candidates.length?candidates.slice(0,3).map(item=><button type="button" key={item.osm_id} className="ffm-simple-next-item" onClick={()=>{setReviewMode('unverified');navigate('review');openCandidate(item)}}>
    <span className="ffm-simple-next-pin"><MapPin size={18}/></span><span><strong>{item.name}</strong><small>{item.category}</small></span><ChevronRight size={18}/>
   </button>):<p className="ffm-studio-blank">Keine offenen Orte.</p>}
 </section>
 </>}

 {view==='review'&&<>
     <div className="ffm-studio-page-heading"><div><h1>Orte prüfen<span>.</span></h1></div></div>
     <details className="ffm-evidence-leads">
      <summary>Vier Orte mit unabhängigen Quellen zur Prüfung <span>Keine automatische Bestätigung</span></summary>
      <p>Die folgenden Quellen helfen der Redaktion. Nur nach eigener Kontrolle von Standort, Datum und Betriebsstatus freigeben.</p>
      <div className="ffm-evidence-leads-grid">{EDITORIAL_SOURCE_LEADS.map(item=><article key={item.name}>
       <strong>{item.name}</strong><small>{item.publisher}</small>
       <p>{item.note}</p>
       <a href={item.source} target="_blank" rel="noopener noreferrer">Offizielle Quelle ansehen <ExternalLink size={14}/></a>
      </article>)}</div>
     </details>
     <div className="ffm-studio-review-tabs" role="tablist" aria-label="Prüfbereiche">
      {[{id:'unverified',label:'Noch ungeprüft',count:stats?.kandidaten},{id:'needs_review',label:'Rückfragen',count:stats?.rueckfragen},{id:'existing',label:'Erneut prüfen',count:stats?.offen_zur_pruefung}].map(r=><button key={r.id} type="button" role="tab" aria-selected={reviewMode===r.id} className={reviewMode===r.id?'active':''} onClick={()=>{setReviewMode(r.id as ReviewMode);setPage(0);setDrawer(false);setSelectedDue(null)}}>{r.label}<span>{fmt(r.count)}</span></button>)}
     </div>
     <div className="ffm-studio-review-layout">
      <CityPanel className="ffm-studio-queue-panel">
       <div className="ffm-studio-queue-top"><strong>{reviewMode==='existing'?"Erneut prüfen":"Orte"}</strong><span>{reviewMode==='existing'?fmt(due.length):fmt(total)}</span></div>
       {reviewMode!=='existing'&&<>
        <div className="ffm-studio-filterrow"><div className="ffm-studio-search"><Search size={18}/><input aria-label="Orte suchen" placeholder="Name oder Adresse suchen" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" onClick={()=>setSearch('')} aria-label="Suche leeren"><X size={15}/></button>}</div>
        <label className="ffm-studio-categoryfilter"><Filter size={17}/><select aria-label="Kategorie" value={category} onChange={e=>{setCategory(e.target.value);setPage(0)}}><option value="">Alle Kategorien</option>{KATEGORIEN.filter(c=>c.id!=='Alle').map(c=><option value={c.id} key={c.id}>{c.label}</option>)}</select></label></div>
       </>}
       <div className="ffm-studio-queue-list">
        {reviewMode==='existing'?(
         actual.length?actual.map((item,i)=><button type="button" key={item.id} className={'ffm-studio-queue-item '+(selectedDue?.id===item.id?'selected':'')} onClick={()=>openDue(item)}><span className="ffm-studio-item-index">{String(i+1).padStart(2,'0')}</span><div><strong>{item.name}</strong><small>{item.category}</small></div><ChevronRight size={18}/></button>)
         :<div className="ffm-studio-blank"><Check size={19}/> Keine fälligen Bestandsprüfungen.</div>
        ):(
         loadingList?<div className="ffm-studio-loading">Orte werden geladen …</div>:candidates.length?candidates.map((item,i)=><button type="button" key={item.osm_id} className={'ffm-studio-queue-item '+(selected?.osm_id===item.osm_id&&!selectedDue?'selected':'')} onClick={()=>openCandidate(item)}><span className="ffm-studio-item-index">{String(page*25+i+1).padStart(2,'0')}</span><div><strong>{item.name}</strong><small>{item.category} · {item.address||'Frankfurt'}</small></div><ChevronRight size={18}/></button>):<div className="ffm-studio-blank"><Search size={21}/> Keine passenden Einträge. Andere Suche versuchen.</div>
        )}
       </div>
       {reviewMode!=='existing'&&<div className="ffm-studio-pagination"><span>Seite {page+1} von {totalPages}</span><div><button type="button" disabled={page===0} onClick={()=>{setPage(p=>p-1);setDrawer(false)}} aria-label="Vorherige Seite"><ChevronLeft size={18}/></button><button type="button" disabled={page+1>=totalPages} onClick={()=>{setPage(p=>p+1);setDrawer(false)}} aria-label="Nächste Seite"><ChevronRight size={18}/></button></div></div>}
      </CityPanel>
      <CityPanel className={'ffm-studio-detail-panel'+(drawer?' drawer-open':'')}>
       <button type="button" className="ffm-studio-drawer-close" onClick={()=>setDrawer(false)} aria-label="Details schließen"><X size={20}/></button>
       {reviewMode==='existing'?(selectedDue?reviewDetail:<div className="ffm-studio-no-selection"><Compass size={40}/><h3>Bestandsort auswählen.</h3><p>Eine fällige Prüfung links auswählen.</p></div>):hasReviewTarget?reviewDetail:<div className="ffm-studio-no-selection"><Compass size={40}/><h3>Ort auswählen.</h3><p>Einen Eintrag aus der Liste öffnen.</p></div>}
      </CityPanel>
      {drawer&&<button type="button" className="ffm-studio-drawer-scrim" aria-label="Details schließen" onClick={()=>setDrawer(false)}/>}
     </div>
    </>}

    {view==='moderation'&&<>
     <div className="ffm-studio-page-heading"><div><h1>Freigaben<span>.</span></h1></div></div>
     <div className="ffm-studio-mod-layout"><CityPanel className="ffm-studio-mod-left"><h2>{fmt(currentCount)} offen</h2><div className="ffm-studio-mod-menu">{visibleQueues.map(q=><button type="button" key={q.key} className={queueSection===q.key?'active':''} onClick={()=>setQueueSection(q.key)}><span>{q.title}</span><b>{fmt(queue[q.key]?.length)}</b><ChevronRight size={17}/></button>)}</div></CityPanel>
     <CityPanel className="ffm-studio-mod-right"><div className="ffm-studio-panel-heading"><h2>{visibleQueues.find(q=>q.key===queueSection)?.title}</h2></div>
      {queue[queueSection]?.length?queue[queueSection].map((item,i)=><article key={item.id} className="ffm-studio-mod-record"><span className="ffm-studio-item-index">{String(i+1).padStart(2,'0')}</span><div><strong>{item.name||item.title||item.body||[item.business_name,item.place_name].filter(Boolean).join(' · ')||'Eintrag'}</strong>
       {item.rating&&<p>{'★'.repeat(item.rating)}{'☆'.repeat(5-item.rating)}</p>}
       {item.note&&<p>{item.note}</p>}{queueSection==='branchChanges'&&<p>Neue Angaben: {String((item as any).address||'')} · {String((item as any).phone||'')} · {String((item as any).opening_hours_text||'')}</p>}
       {item.place_name&&<small>Ort: {item.place_name}</small>}<div className="ffm-studio-mod-actions"><button disabled={busy} type="button" className="ffm-studio-approve" onClick={()=>void moderation(queueSection,item,true)}><Check size={16}/> {queueSection==='reports'||queueSection==='reviewReports'?'Geprüft':'Freigeben'}</button><button disabled={busy} type="button" className="ffm-studio-quiet-danger" onClick={()=>void moderation(queueSection,item,false)}><X size={16}/> {queueSection==='reports'||queueSection==='reviewReports'?'Unbegründet':'Ablehnen'}</button>{queueSection==='reviewReports'&&item.review_id&&<button
       disabled={busy} className="ffm-studio-quiet-danger" type="button" onClick={()=>{
        const reason=window.prompt('Grund für die Entfernung (mind. 10 Zeichen):');
        if(!reason||reason.trim().length<10)return;
        if(window.confirm('Diese veröffentlichte Bewertung wirklich entfernen?')){
         void action('admin/remove-review',{id:item.review_id,reason:reason.trim()},'Bewertung entfernt.');
        }
       }}>Bewertung entfernen</button>}</div></div></article>):<div className="ffm-studio-mod-empty"><div><CheckCheck size={32}/></div><h3>Alles erledigt.</h3></div>}
     </CityPanel></div>
     {allowed('moderation')&&<MediaEditorial/>}
    </>}

    {view==='publish'&&<>
     <div className="ffm-studio-page-heading"><div><h1>Erstellen<span>.</span></h1></div></div>
     <div className="ffm-studio-publish-layout"><CityPanel className="ffm-studio-publish-choice"><div className="ffm-studio-publish-options">
      {[{mode:'place',title:'Ort',icon:MapPin,index:'01'},{mode:'news',title:'Beitrag',icon:Newspaper,index:'02'},{mode:'event',title:'Event',icon:CalendarDays,index:'03'}].map(o=><button type="button" key={o.mode} className={publishMode===o.mode?'active':''} onClick={()=>{setPublishMode(o.mode as PublishMode);setNotice(null)}}><o.icon size={26}/><strong>{o.title}</strong></button>)}
      </div></CityPanel>
     <CityPanel className="ffm-studio-publish-form-panel"><h2>{publishMode==='place'?"Neuer Ort":publishMode==='news'?"Neuer Beitrag":"Neues Event"}</h2>
      <form key={publishMode+'-'+newPlaceId} className="ffm-studio-form" onSubmit={publish}>
       {publishMode==='place'?<>
        <Field label="Name des Orts"><input name="name" required maxLength={150} placeholder="Zum Beispiel: Stadtteilcafé ..."/></Field>
        <Field label="Kategorie"><select name="category">{KATEGORIEN.filter(c=>c.id!=='Alle').map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Adresse"><input name="address" maxLength={200} placeholder="Straße und Hausnummer"/></Field>
        <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Weitere Angaben</summary><div className="ffm-simple-more-content">
        <Field label="Stadtteil"><input name="district" maxLength={100} placeholder="z. B. Bornheim"/></Field>
        <Field label="Kurzbeschreibung"><textarea name="description_de" rows={3} maxLength={2000} placeholder="Was macht diesen Ort besonders?"/></Field>
        <div className="ffm-studio-form-pair"><Field label="Breitengrad"><input type="number" step="any" name="latitude" placeholder="50.1109"/></Field><Field label="Längengrad"><input type="number" step="any" name="longitude" placeholder="8.6821"/></Field></div>
        <div className="ffm-studio-form-pair"><Field label="Offizielle Internetseite"><input type="url" name="website" placeholder="https://..."/></Field><Field label="Quellenlink"><input type="url" name="source_url" placeholder="https://..."/></Field></div>
        </div></details>
       </>:publishMode==='news'?<>
        <Field label="Titel"><input name="title" required maxLength={150} placeholder="Was ist passiert?"/></Field>
        <Field label="Dein Stadtbeitrag"><textarea name="body_de" rows={7} maxLength={10000} placeholder="Erzähle deine Geschichte aus Frankfurt ..."/></Field>
        <Field label="Rubrik"><select name="category"><option value="Stadtleben">Stadtleben</option><option value="Kultur">Kultur</option><option value="Verkehr">Verkehr</option><option value="Sport">Sport</option><option value="Freizeit">Freizeit</option></select></Field>
        <Field label="Veröffentlichung planen (optional)"><input type="datetime-local" name="published_at"/><small>Ohne Datum wird der Beitrag sofort veröffentlicht. Zukunftstermine bleiben bis dahin unsichtbar.</small></Field>
        <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Quellenlink ergänzen</summary><div className="ffm-simple-more-content"><Field label="Quelle"><input type="url" name="source_url" placeholder="https://..."/></Field></div></details>
       </>:<>
        <Field label="Titel der Veranstaltung"><input name="title" required maxLength={150} placeholder="Name der Veranstaltung"/></Field>
        <Field label="Veranstaltungsort"><input name="venue" required maxLength={150} placeholder="Wo findet es statt?"/></Field>
        <Field label="Datum und Uhrzeit"><input name="starts_at" type="datetime-local" required/></Field>
        <Field label="Kategorie"><select name="category"><option value="Weitere">Weitere</option><option value="Kultur">Kultur</option><option value="Musik">Musik</option><option value="Sport">Sport</option><option value="Familie">Familie</option><option value="Kostenlos">Kostenlos</option></select></Field>
        <Field label="Veranstalter"><input name="organizer" maxLength={150} placeholder="Offizieller Veranstalter"/></Field>
        <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Zeitpunkt und Preis</summary><div className="ffm-simple-more-content">
         <Field label="Ende (optional)"><input name="ends_at" type="datetime-local"/></Field>
         <Field label="Belegter Preis in EUR (leer = unbekannt)"><input name="price_eur" type="number" min="0" step="0.01"/></Field>
         <Field label="Offizielle Preisquelle"><input name="price_source_url" type="url" placeholder="https://..."/></Field>
         <Field label="Quelle des Events"><input name="source_url" type="url" placeholder="https://..."/></Field>
        </div></details>
        <details className="ffm-simple-more-fields"><summary><Plus size={17}/> Beschreibung & Link</summary><div className="ffm-simple-more-content">
        <Field label="Beschreibung"><textarea name="description_de" rows={4} maxLength={3000} placeholder="Für wen ist dieses Event und was erwartet die Gäste?"/></Field>
        <Field label="Ticket oder Infoseite"><input type="url" name="ticket_url" placeholder="https://..."/></Field>
        </div></details>
       </>}
       <div className="ffm-studio-publish-confirm"><ShieldCheck size={18}/><span>Quellen vor Veröffentlichung prüfen. Geplante Beiträge erscheinen erst zum festgelegten Zeitpunkt.</span></div>
       <button className="ffm-studio-primary" disabled={busy}>{busy?'Wird veröffentlicht …':'Jetzt veröffentlichen'} <ArrowRight size={18}/></button>
      </form>
     </CityPanel></div>
    </>}
   </div>
   <footer className="ffm-studio-footer"><span>FFM AKTUELL / STADTSTUDIO</span><span>MIT SORGFALT FÜR FRANKFURT GEMACHT <span className="ffm-studio-status-dot"/></span></footer>
  </div>
 </main>;
}

