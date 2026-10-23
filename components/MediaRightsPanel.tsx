'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
type Media={id:string;media_type:string;status:'pending'|'approved'|'rejected';created_at:string};
type Company={id:string;name:string};
type Grant={id:string;media_id:string;business_name:string;expires_at:string;revoked_at:string|null};
export default function MediaRightsPanel({onNotice}:{onNotice:(m:string)=>void}){
 const ui=useUiText();
 const [media,setMedia]=useState<Media[]>([]),[businesses,setBusinesses]=useState<Company[]>([]),[grants,setGrants]=useState<Grant[]>([]);
 const [selectedMedia,setSelectedMedia]=useState(''),[selectedBusiness,setSelectedBusiness]=useState(''),[days,setDays]=useState(30),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/media/rights');if(!r.ok)return;const d=await r.json();setMedia(d.media||[]);setBusinesses(d.businesses||[]);setGrants(d.grants||[])}catch{}}
 useEffect(()=>{void load()},[]);
 const approvedMedia=media.filter(m=>m.status==='approved');
 async function deleteOwn(id:string){if(!window.confirm(ui("Diese Datei und alle damit verbundenen Stories oder Highlight Freigaben dauerhaft löschen?")))return;setBusy(true);try{const r=await fetch('/api/media/manage',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const d=await r.json();if(!r.ok)throw Error(d.error||ui("Löschen fehlgeschlagen"));setSelectedMedia('');onNotice(ui("Deine Datei und zugehörige Freigaben wurden entfernt."));await load();}catch(e){onNotice(e instanceof Error?e.message:ui("Datei konnte nicht gelöscht werden"))}finally{setBusy(false)}}
 async function action(body:object){setBusy(true);try{const r=await fetch('/api/media/rights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();if(!r.ok)throw Error(d.error||ui("Fehlgeschlagen"));onNotice(ui("Medienfreigabe aktualisiert."));await load();
 }catch(e){onNotice(e instanceof Error?e.message:ui("Fehler bei Medienfreigabe"))}finally{setBusy(false)}}
 return <section className="ffm-rights-panel"><h2>{ui("Deine Fotos und Videos")}</h2><p>{ui("Nur du kannst Unternehmen erlauben, deine freigegebenen Bilder in Highlights zu verwenden. Jede Erlaubnis ist befristet und kann sofort widerrufen werden.")}</p>
  {media.length>0&&<div className="ffm-own-media-list"><strong>{ui("Meine Uploads")}</strong>{media.map(m=><article key={m.id}><span>{m.media_type.startsWith('image/')?ui("Foto"):ui("Video")} · {new Date(m.created_at).toLocaleDateString((ui.locale==='de'?'de-DE':'en-GB'))} · {m.status==='approved'?ui("Freigegeben"):m.status==='pending'?ui("Wartet auf Prüfung"):ui("Abgelehnt")}</span><button type="button" disabled={busy} onClick={()=>void deleteOwn(m.id)}>{ui("Datei dauerhaft löschen")}</button></article>)}</div>}
  {approvedMedia.length>0&&businesses.length>0&&<div className="ffm-rights-form">
   <label>{ui("Deine Datei")}<select value={selectedMedia} onChange={e=>setSelectedMedia(e.target.value)}><option value="">{ui("Datei wählen")}</option>{approvedMedia.map(m=><option value={m.id} key={m.id}>{m.media_type} · {m.id.slice(0,8)}</option>)}</select></label>
   <label>{ui("Unternehmen")}<select value={selectedBusiness} onChange={e=>setSelectedBusiness(e.target.value)}><option value="">{ui("Unternehmen wählen")}</option>{businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
   <label>{ui("Gültigkeit")}<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>{ui("7 Tage")}</option><option value={30}>{ui("30 Tage")}</option><option value={90}>{ui("90 Tage")}</option><option value={365}>{ui("1 Jahr")}</option></select></label>
   <button type="button" disabled={busy||!selectedMedia||!selectedBusiness} onClick={()=>void action({action:'grant',media_id:selectedMedia,business_id:selectedBusiness,expires_at:new Date(Date.now()+days*86400000+60000).toISOString()})}>{ui("Explizit freigeben")}</button>
  </div>}
  <div className="ffm-rights-list">{grants.filter(g=>!g.revoked_at).map(g=><article key={g.id}>
   <strong>{g.business_name}</strong><span>{ui("Bis ")}{new Date(g.expires_at).toLocaleDateString((ui.locale==='de'?'de-DE':'en-GB'))}</span>
   <button type="button" disabled={busy} onClick={()=>void action({action:'revoke',id:g.id})}>{ui("Freigabe widerrufen")}</button></article>)}</div>
  {media.length===0&&<p>{ui("Deine Medien erscheinen hier, sobald du einen Foto- oder Videobeitrag hochgeladen hast.")}</p>}
 </section>;
}
