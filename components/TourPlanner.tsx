'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
import {ArrowDown,ArrowUp,Check,ChevronRight,Clock3,ExternalLink,Link2,MapPin,Navigation,Plus,Share2,Trash2,X} from 'lucide-react';

type Stop={id:string;name:string;category:string;address:string;latitude:number|null;longitude:number|null;verification_status?:string;planned_time?:string|null;candidate?:boolean};
type Tour={id:string;title:string;share_token:string|null;stop_count:number;updated_at:string};
type SharedTour={title:string};
type Mode='walking'|'driving'|'bicycling';
type Props={loggedIn:boolean;onLogin:()=>void;onNotice:(message:string)=>void};
const safeCoords=(p:Stop)=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&p.latitude!=null&&p.longitude!=null;
async function get(path:string){
 const r=await fetch('/api/'+path,{cache:'no-store',credentials:'same-origin'});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;
}
async function post(body:unknown){
 const r=await fetch('/api/tours',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;
}
function directions(stops:Stop[],mode:Mode){
 if(stops.length<2||stops.some(p=>!safeCoords(p)))return null;
 const coords=(p:Stop)=>p.latitude+','+p.longitude;
 const params=new URLSearchParams({api:'1',origin:coords(stops[0]),destination:coords(stops[stops.length-1]),travelmode:mode});
 if(stops.length>2)params.set('waypoints',stops.slice(1,-1).map(coords).join('|'));
 return 'https://www.google.com/maps/dir/?'+params.toString();
}
function StopList({stops,onMove,onRemove,onTime}:{
 stops:Stop[];onMove?:(from:number,to:number)=>void;onRemove?:(idx:number)=>void;onTime?:(idx:number,value:string)=>void;
}){
 const ui=useUiText();
 return <ol className="ffm-tour-stops">{stops.map((s,i)=><li key={s.id}>
  <span className="ffm-tour-step">{i+1}</span><span className="ffm-tour-stop-text"><strong>{s.name}</strong><small>{s.address||s.category} {s.verification_status==='unverified'?ui(" · Ungeprüft"):''}</small></span>
  {onTime&&<label className="ffm-tour-time"><Clock3 size={13}/><input aria-label={ui("Uhrzeit bei ")+s.name} type="time" value={s.planned_time||''} onChange={e=>onTime(i,e.target.value)}/></label>}
  {onMove&&<span className="ffm-tour-order"><button type="button" aria-label={s.name+ui(" nach oben")} disabled={i===0} onClick={()=>onMove(i,i-1)}><ArrowUp size={16}/></button><button type="button" aria-label={s.name+ui(" nach unten")} disabled={i===stops.length-1} onClick={()=>onMove(i,i+1)}><ArrowDown size={16}/></button></span>}
  {onRemove&&<button type="button" className="ffm-tour-remove" aria-label={s.name+ui(" entfernen")} onClick={()=>onRemove(i)}><X size={17}/></button>}
 </li>)}</ol>;
}
export default function TourPlanner({loggedIn,onLogin,onNotice}:Props){
 const ui=useUiText();
 const [shared,setShared]=useState<{tour:SharedTour;stops:Stop[]}|null>(null);
 const [shareError,setShareError]=useState(false);
 const [mine,setMine]=useState<Tour[]>([]);
 const [saved,setSaved]=useState<Stop[]>([]);
 const [selected,setSelected]=useState<Stop[]>([]);
 const [title,setTitle]=useState('');
 const [tourId,setTourId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [mode,setMode]=useState<Mode>('walking');
 const [sharedToken,setSharedToken]=useState<string|null>(null);
 const token=typeof window==='undefined'?'':new URLSearchParams(window.location.search).get('tour')||'';
 useEffect(()=>{
  let active=true;
  if(token){
   get('tours/shared?token='+encodeURIComponent(token)).then(d=>{if(active)setShared(d)}).catch(()=>{if(active)setShareError(true)}).finally(()=>{if(active)setLoading(false)});
   return()=>{active=false};
  }
  if(!loggedIn){setLoading(false);return}
  Promise.all([get('tours'),get('favorites/details')]).then(([t,s])=>{
   if(active){setMine(t.items||[]);setSaved((s.items||[]).filter((p:Stop)=>safeCoords(p)))}
  }).catch(()=>{if(active)onNotice(ui("Touren konnten nicht geladen werden."))})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 // user auth and share-link identity are the only load dependencies
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[loggedIn,token]);
 const refresh=async()=>{
  const [t,s]=await Promise.all([get('tours'),get('favorites/details')]);
  setMine(t.items||[]);setSaved((s.items||[]).filter((p:Stop)=>safeCoords(p)));
 };
 const add=(place:Stop)=>{
  if(selected.some(s=>s.id===place.id))return;
  if(selected.length>=8){onNotice(ui("Eine Tour kann bis zu 8 Orte enthalten."));return}
  setSelected(prev=>[...prev,place]);
 };
 const move=(i:number,j:number)=>setSelected(prev=>{
  const copy=[...prev];const item=copy.splice(i,1)[0];copy.splice(j,0,item);return copy
 });
 const edit=async(id:string)=>{
  try{
   setBusy(true);const d=await get('tours/details?id='+id);
   setTitle(d.tour.title);setTourId(d.tour.id);
   setSelected(d.stops||[]);setSharedToken(d.tour.share_token||null);
   window.scrollTo({top:0,behavior:'smooth'});
  }catch{onNotice(ui("Tour konnte nicht geöffnet werden."))}
  finally{setBusy(false)}
 };
 const reset=()=>{setTitle('');setTourId(null);setSelected([]);setSharedToken(null)};
 const save=async(e:FormEvent)=>{
  e.preventDefault();
  if(selected.length<2){onNotice(ui("Bitte mindestens zwei Orte wählen."));return}
  setBusy(true);
  try{
   const data=await post({action:'save',id:tourId||undefined,title:title.trim(),stop_ids:selected.map(s=>s.id),
     planned_times:selected.map(s=>s.planned_time||null)});
   setTourId(data.id);await refresh();onNotice(ui("Deine Tour ist gespeichert."));
  }catch{onNotice(ui("Tour konnte nicht gespeichert werden."))}
  finally{setBusy(false)}
 };
 const share=async(enabled:boolean)=>{
  if(!tourId)return;
  setBusy(true);try{const d=await post({action:'share',id:tourId,enabled});setSharedToken(d.token||null);await refresh();onNotice(enabled?ui("Tourlink ist bereit."):ui("Tourlink wurde deaktiviert."))}
  catch{onNotice(ui("Freigabe konnte nicht geändert werden."))}
  finally{setBusy(false)}
 };
 const remove=async(id:string)=>{
  if(!window.confirm(ui("Diese Tour wirklich löschen?")))return;
  setBusy(true);try{await post({action:'delete',id});if(id===tourId)reset();await refresh();onNotice(ui("Tour gelöscht."))}
  catch{onNotice(ui("Tour konnte nicht gelöscht werden."))}
  finally{setBusy(false)}
 };
 const shareUrl=sharedToken?window.location.origin+'/?tour='+encodeURIComponent(sharedToken):null;
 const copy=async()=>{
  if(!shareUrl)return;
  try{await navigator.clipboard.writeText(shareUrl);onNotice(ui("Tourlink kopiert."))}
  catch{window.prompt('Tourlink kopieren',shareUrl)}
 };
 if(token)return <main className="ffm-tour-page">
  <div className="ffm-tour-head"><span>{ui("FFM · TOUR")}</span><h1>{shared?.tour.title||ui("Geteilte Tour")}</h1></div>
  {loading?<p role="status">{ui("Tour wird geladen …")}</p>:shareError||!shared?<div className="ffm-tour-empty">{ui("Dieser Tourlink ist nicht mehr verfügbar.")}</div>:
   <section className="ffm-tour-panel"><p className="ffm-tour-note">{ui("Die Tour enthält nur die freigegebenen Stationen. Öffnungszeiten bitte beim Anbieter prüfen.")}</p>
    <StopList stops={shared.stops}/><RouteActions stops={shared.stops} mode={mode} setMode={setMode}/></section>}
 </main>;
 return <main className="ffm-tour-page">
  <div className="ffm-tour-head"><span>{ui("DEIN FRANKFURT")}</span><h1>{ui("Meine Touren")}<span>.</span></h1><p>{ui("Orte auswählen, Reihenfolge festlegen, losgehen.")}</p></div>
  {!loggedIn?<div className="ffm-tour-empty"><p>{ui("Zum Planen bitte anmelden.")}</p><button onClick={onLogin}>{ui("Anmelden")}</button></div>:
   loading?<p role="status">{ui("Touren werden geladen …")}</p>:
   <div className="ffm-tour-layout">
    <div className="ffm-tour-builder">
     <form onSubmit={save} className="ffm-tour-panel">
      <div className="ffm-tour-panel-title"><h2>{tourId?ui("Tour bearbeiten"):ui("Neue Tour")}</h2>{tourId&&<button type="button" onClick={reset}>{ui("Neu ")}<Plus size={15}/></button>}</div>
      <label className="ffm-tour-label">{ui("Name")}<input maxLength={100} minLength={2} required value={title} onChange={e=>setTitle(e.target.value)} placeholder={ui("Mein Frankfurt Spaziergang")}/></label>
      <div className="ffm-tour-mini-head"><strong>{ui("Stationen")}</strong><span>{selected.length} / 8</span></div>
      {selected.length?<StopList stops={selected} onMove={move}
       onRemove={i=>setSelected(prev=>prev.filter((_,j)=>i!==j))}
       onTime={(i,time)=>setSelected(prev=>prev.map((s,j)=>i===j?{...s,planned_time:time||null}:s))}/>:
       <div className="ffm-tour-empty">{ui("Wähle unten mindestens 2 gespeicherte Orte.")}</div>}
      <button className="ffm-tour-primary" type="submit" disabled={busy||selected.length<2}><Check size={17}/> {ui(" Tour speichern")}</button>
      {tourId&&<div className="ffm-tour-share"><button type="button" disabled={busy} onClick={()=>void share(!sharedToken)}><Share2 size={16}/>{sharedToken?ui("Link deaktivieren"):ui("Link teilen")}</button>{shareUrl&&<button type="button" onClick={()=>void copy()}><Link2 size={16}/> {ui(" Link kopieren")}</button>}</div>}
      {selected.length>=2&&<RouteActions stops={selected} mode={mode} setMode={setMode}/>}
     </form>
     <section className="ffm-tour-panel ffm-tour-pick"><h2>{ui("Gespeicherte Orte")}</h2>{!saved.length?<div className="ffm-tour-empty">{ui("Noch keine gespeicherten Orte. Merke zuerst Orte unter Entdecken.")}</div>:
       saved.map(p=><button type="button" key={p.id} disabled={selected.some(s=>s.id===p.id)||selected.length>=8} onClick={()=>add(p)}>
        <span><strong>{p.name}</strong><small>{p.category} · {p.verification_status==='unverified'?ui("Ungeprüft"):ui("Status im Ort prüfen")}</small></span><Plus size={19}/></button>)}
     </section>
    </div>
    <aside className="ffm-tour-panel ffm-tour-list"><h2>{ui("Meine Touren")}</h2>{!mine.length?<p className="ffm-tour-muted">{ui("Noch keine Tour gespeichert.")}</p>:
       mine.map(t=><div key={t.id} className="ffm-tour-row"><span><strong>{t.title}</strong><small>{t.stop_count} {ui(" Stopps · ")}{t.share_token?ui("Link aktiv"):ui("Privat")}</small></span><button aria-label={t.title+ui(" bearbeiten")} onClick={()=>void edit(t.id)} disabled={busy}><ChevronRight size={19}/></button><button aria-label={t.title+ui(" löschen")} onClick={()=>void remove(t.id)} disabled={busy}><Trash2 size={16}/></button></div>)}
    </aside>
   </div>}
 </main>;
}
function RouteActions({stops,mode,setMode}:{stops:Stop[];mode:Mode;setMode:(m:Mode)=>void}){
 const ui=useUiText();
 const url=directions(stops,mode);
 return <div className="ffm-tour-route">
  <label>{ui("Unterwegs")}<select value={mode} onChange={e=>setMode(e.target.value as Mode)}>
    <option value="walking">{ui("Zu Fuß")}</option><option value="bicycling">{ui("Fahrrad")}</option><option value="driving">{ui("Auto")}</option>
   </select></label>
  {url?<a href={url} target="_blank" rel="noopener noreferrer"><Navigation size={16}/> {ui(" Route öffnen ")}<ExternalLink size={13}/></a>:
   <span><MapPin size={15}/> {ui(" Mindestens zwei Orte mit Standort")}</span>}
 </div>;
}

