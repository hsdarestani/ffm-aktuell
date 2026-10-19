'use client';
import {useEffect,useState} from 'react';
type Media={id:string;media_type:string};
type Company={id:string;name:string};
type Grant={id:string;media_id:string;business_name:string;expires_at:string;revoked_at:string|null};
export default function MediaRightsPanel({onNotice}:{onNotice:(m:string)=>void}){
 const [media,setMedia]=useState<Media[]>([]),[businesses,setBusinesses]=useState<Company[]>([]),[grants,setGrants]=useState<Grant[]>([]);
 const [selectedMedia,setSelectedMedia]=useState(''),[selectedBusiness,setSelectedBusiness]=useState(''),[days,setDays]=useState(30),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch('/api/media/rights');if(!r.ok)return;const d=await r.json();setMedia(d.media||[]);setBusinesses(d.businesses||[]);setGrants(d.grants||[])}catch{}}
 useEffect(()=>{void load()},[]);
 async function action(body:object){setBusy(true);try{const r=await fetch('/api/media/rights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Fehlgeschlagen');onNotice('Medienfreigabe aktualisiert.');await load();
 }catch(e){onNotice(e instanceof Error?e.message:'Fehler bei Medienfreigabe')}finally{setBusy(false)}}
 return <section className="ffm-rights-panel"><h2>Rechte an deinen Bildern</h2><p>Nur du kannst Unternehmen erlauben, deine freigegebenen Bilder in Highlights zu verwenden. Jede Erlaubnis ist befristet und kann sofort widerrufen werden.</p>
  {media.length>0&&businesses.length>0&&<div className="ffm-rights-form">
   <label>Deine Datei<select value={selectedMedia} onChange={e=>setSelectedMedia(e.target.value)}><option value="">Datei wählen</option>{media.map(m=><option value={m.id} key={m.id}>{m.media_type} · {m.id.slice(0,8)}</option>)}</select></label>
   <label>Unternehmen<select value={selectedBusiness} onChange={e=>setSelectedBusiness(e.target.value)}><option value="">Unternehmen wählen</option>{businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
   <label>Gültigkeit<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>7 Tage</option><option value={30}>30 Tage</option><option value={90}>90 Tage</option><option value={365}>1 Jahr</option></select></label>
   <button type="button" disabled={busy||!selectedMedia||!selectedBusiness} onClick={()=>void action({action:'grant',media_id:selectedMedia,business_id:selectedBusiness,expires_at:new Date(Date.now()+days*86400000+60000).toISOString()})}>Explizit freigeben</button>
  </div>}
  <div className="ffm-rights-list">{grants.filter(g=>!g.revoked_at).map(g=><article key={g.id}>
   <strong>{g.business_name}</strong><span>Bis {new Date(g.expires_at).toLocaleDateString('de-DE')}</span>
   <button type="button" disabled={busy} onClick={()=>void action({action:'revoke',id:g.id})}>Freigabe widerrufen</button></article>)}</div>
  {media.length===0&&<p>Deine geprüften Medien erscheinen hier nach redaktioneller Freigabe.</p>}
 </section>;
}