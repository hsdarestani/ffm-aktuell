'use client';
import {useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,ExternalLink,RefreshCw,Search,ShieldAlert} from 'lucide-react';
type Candidate={osm_id:string;name:string;category:string;address:string|null;website:string|null;phone:string|null;opening_hours:string|null;last_osm_check:string|null;osm_url:string;reviewed_status:string;possible_duplicate:boolean;missing_details:boolean;missing_address:boolean;missing_contact:boolean;missing_hours:boolean};
type Published={id:string;name:string;category:string;district:string;address:string|null;image_url:string|null;source_url:string|null;verification_status:string;verification_source:string|null;website:string|null;missing_photo:boolean;missing_hours:boolean;missing_address:boolean;requires_verification:boolean};
type Overview={total:number;duplicates?:number;incomplete?:number;review?:number;missing_photos?:number;missing_hours?:number;needs_verification?:number};
type Data={items:(Candidate|Published)[];total:number;overview:Overview;notice:string};
const req=async(url:string,options?:RequestInit)=>{const r=await fetch(url,{...options,credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage nicht erfolgreich');return d};
export default function DataQualityStudio({onNotice}:{onNotice:(message:string,success:boolean)=>void}){
 const [scope,setScope]=useState<'candidates'|'editorial'>('candidates');
 const [kind,setKind]=useState<'all'|'duplicate'|'incomplete'|'review'>('all');
 const [q,setQ]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0),[epoch,setEpoch]=useState(0);
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState<string|null>(null);
 const load=useCallback(async(signal:AbortSignal)=>{
  setLoading(true);
  try{const params=new URLSearchParams({scope,kind:scope==='editorial'?'all':kind,q:search,page:String(page)});
   const r=await fetch('/api/admin/data-quality?'+params,{cache:'no-store',credentials:'same-origin',signal});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Datenqualität nicht erreichbar');
   if(!signal.aborted)setData(d);
  }catch(e){if(!signal.aborted){setData(null);onNotice(e instanceof Error?e.message:'Datenprüfung nicht erreichbar',false)}}
  finally{if(!signal.aborted)setLoading(false)}
 },[scope,kind,search,page,epoch]);
 useEffect(()=>{const c=new AbortController();void load(c.signal);return()=>c.abort()},[load]);
 const switchScope=(next:'candidates'|'editorial')=>{setScope(next);setKind('all');setPage(0)};
 const doReview=async(item:Candidate)=>{
  if(!window.confirm('Eintrag zur redaktionellen Prüfung vormerken? Es wird nichts automatisch veröffentlicht oder gelöscht.'))return;
  setBusy(item.osm_id);
  try{await req('/api/admin/review-candidate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   action:'needs_review',osm_id:item.osm_id,reason:'Datenqualität: mögliche Dublette, Quellen, Kontaktangaben und Öffnungszeiten manuell prüfen.'
  })});onNotice('Ort wurde in die bestehende Prüfliste verschoben.',true);setEpoch(x=>x+1)}
  catch(e){onNotice(e instanceof Error?e.message:'Markierung fehlgeschlagen',false)}
  finally{setBusy(null)}
 };
 const c=data?.overview||{total:0};
 return <section className="ffm-quality">
  <div className="ffm-studio-page-heading"><div><h1>Datenqualität<span>.</span></h1><p>Fehlende Angaben erkennen, mögliche Dubletten prüfen. Keine erfundenen Daten, keine automatischen Freigaben.</p></div></div>
  <div className="ffm-quality-scope">
   <button type="button" className={scope==='candidates'?'active':''} onClick={()=>switchScope('candidates')}>OSM Kandidaten</button>
   <button type="button" className={scope==='editorial'?'active':''} onClick={()=>switchScope('editorial')}>Redaktionelle Orte</button>
  </div>
  <div className="ffm-quality-stats" aria-live="polite">
   <article><strong>{c.total||0}</strong><small>{scope==='candidates'?'Zu prüfende OSM Einträge':'Veröffentlichte Orte'}</small></article>
   {scope==='candidates'?<>
    <article><strong>{c.duplicates||0}</strong><small>Mögliche Dubletten</small></article>
    <article><strong>{c.incomplete||0}</strong><small>Angaben fehlen</small></article>
    <article><strong>{c.review||0}</strong><small>In Prüfung</small></article>
   </>:<>
    <article><strong>{c.needs_verification||0}</strong><small>Betriebsprüfung fehlt oder veraltet</small></article>
    <article><strong>{c.missing_photos||0}</strong><small>Kein Foto hinterlegt</small></article>
    <article><strong>{c.missing_hours||0}</strong><small>Keine Öffnungszeiten</small></article>
   </>}
  </div>
  {scope==='candidates'&&<div className="ffm-quality-filters" role="group" aria-label="Eintrag auswählen">
   {([['all','Alle'],['duplicate','Dubletten'],['incomplete','Unvollständig'],['review','Rückfragen']] as const).map(([id,label])=>
    <button key={id} type="button" aria-pressed={kind===id} className={kind===id?'active':''} onClick={()=>{setKind(id);setPage(0)}}>{label}</button>)}
  </div>}
  <form className="ffm-quality-search" onSubmit={e=>{e.preventDefault();setSearch(q.trim());setPage(0)}}>
   <Search size={17}/><input aria-label="Qualitätsprüfung nach Name oder Adresse durchsuchen" placeholder="Ort oder Adresse suchen" value={q} onChange={e=>setQ(e.target.value)} maxLength={90}/>
   <button type="submit">Suchen</button>
   <button type="button" title="Aktualisieren" onClick={()=>setEpoch(n=>n+1)}><RefreshCw size={16}/></button>
  </form>
  <p className="ffm-quality-explainer">{data?.notice||'Einträge mit fehlenden oder zweifelhaften Angaben müssen manuell geprüft werden.'}</p>
  {loading&&<p role="status">Prüfliste wird geladen …</p>}
  {!loading&&data&&<><p className="ffm-quality-count">{data.total} Treffer</p>
   <div className="ffm-quality-list">{data.items.map(item=>{
    if(scope==='candidates'){const v=item as Candidate;return <article key={v.osm_id}>
     <div className="ffm-quality-item-head"><div><strong>{v.name}</strong><small>{v.category} · {v.address||'Adresse fehlt'}</small></div>
      <span className="ffm-quality-tag">{v.reviewed_status==='needs_review'?'In Prüfung':'OSM · ungeprüft'}</span></div>
     <div className="ffm-quality-flags">
      {v.possible_duplicate&&<span><AlertTriangle size={13}/> Mögliche Dublette</span>}
      {v.missing_address&&<span>Adresse fehlt</span>}
      {v.missing_contact&&<span>Kontakt fehlt</span>}
      {v.missing_hours&&<span>Öffnungszeiten fehlen</span>}
      {!v.possible_duplicate&&!v.missing_details&&<span><CheckCircle2 size={13}/> Grunddaten vorhanden, nicht bestätigt</span>}
     </div>
     <div className="ffm-quality-actions">
      <a href={v.osm_url} target="_blank" rel="noopener noreferrer">OSM Quelle <ExternalLink size={13}/></a>
      {v.website?.startsWith('https://')&&<a href={v.website} target="_blank" rel="noopener noreferrer">Webseite <ExternalLink size={13}/></a>}
      {v.reviewed_status!=='needs_review'&&<button disabled={busy!==null} type="button" onClick={()=>void doReview(v)}><ShieldAlert size={14}/> Zur Prüfung vormerken</button>}
     </div>
    </article>}
    const v=item as Published;return <article key={v.id}>
     <div className="ffm-quality-item-head"><div><strong>{v.name}</strong><small>{v.category} · {v.district||'Frankfurt'} · {v.address||'Adresse fehlt'}</small></div><span className="ffm-quality-tag">Redaktionell</span></div>
     <div className="ffm-quality-flags">
      {v.requires_verification&&<span><AlertTriangle size={13}/> Betriebsprüfung fehlt oder veraltet</span>}
      {v.missing_photo&&<span>Kein lizenziertes Foto hinterlegt</span>}
      {v.missing_hours&&<span>Öffnungszeiten fehlen</span>}
      {v.missing_address&&<span>Adresse fehlt</span>}
     </div><div className="ffm-quality-actions">
      {v.source_url?.startsWith('https://')&&<a target="_blank" rel="noopener noreferrer" href={v.source_url}>Verzeichnisquelle <ExternalLink size={13}/></a>}
      {v.verification_source?.startsWith('https://')&&<a target="_blank" rel="noopener noreferrer" href={v.verification_source}>Prüfnachweis <ExternalLink size={13}/></a>}
     </div>
    </article>
   })}</div>
   {!data.items.length&&<p className="ffm-quality-none">In dieser Auswahl keine Einträge.</p>}
   <div className="ffm-quality-pages">
    <button type="button" disabled={page===0||loading} onClick={()=>setPage(v=>Math.max(0,v-1))}>Zurück</button>
    <span>Seite {page+1} von {Math.max(1,Math.ceil(data.total/20))}</span>
    <button type="button" disabled={(page+1)*20>=data.total||loading} onClick={()=>setPage(v=>v+1)}>Weiter</button>
   </div>
  </>}
 </section>;
}
