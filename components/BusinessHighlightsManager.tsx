'use client';
import {useCallback,useEffect,useState} from 'react';
type MediaGrant={grant_id:string;media_id:string;media_url:string;media_type:string;expires_at:string;highlight_status:string};
export default function BusinessHighlightsManager({businessId,approved,onNotice}:{businessId:string;approved:boolean;onNotice:(message:string)=>void}){
 const [items,setItems]=useState<MediaGrant[]>([]),[loading,setLoading]=useState(false),[working,setWorking]=useState<string|null>(null);
 const reload=useCallback(async()=>{
  if(!approved)return;
  setLoading(true);
  try{
   const r=await fetch('/api/highlights?'+new URLSearchParams({business_id:businessId,scope:'available'}),{cache:'no-store'});
   if(!r.ok)throw Error('Freigegebene Medien konnten nicht geladen werden.');
   const d=await r.json();setItems(Array.isArray(d.items)?d.items:[]);
  }catch(e){onNotice(e instanceof Error?e.message:'Highlights momentan nicht verfügbar');}
  finally{setLoading(false);}
 },[approved,businessId,onNotice]);
 useEffect(()=>{void reload()},[reload]);
 async function request(item:MediaGrant){
  if(working)return;
  setWorking(item.grant_id);
  try{
   const r=await fetch('/api/highlights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_id:item.grant_id})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Anfrage fehlgeschlagen');
   onNotice('Highlight an die Redaktion gesendet. Vor Freigabe nicht öffentlich sichtbar.');
   await reload();
  }catch(e){onNotice(e instanceof Error?e.message:'Highlight konnte nicht eingereicht werden.');}
  finally{setWorking(null);}
 }
 if(!approved)return null;
 return <section className="ffm-merchant-highlights" aria-label="Highlights für dein Unternehmen">
  <header><h2>Deine Highlights</h2><p>Zeige nur Bilder und Videos, deren Eigentümer deinem Unternehmen die Nutzung ausdrücklich erlaubt haben.</p></header>
  {loading?<p role="status">Freigaben laden …</p>:items.length===0?
   <p>Noch keine gültigen Medienfreigaben. Nutzer können dir einzelne Bilder im Profil ausdrücklich und befristet freigeben.</p>:
   <div className="ffm-merchant-highlight-list">{items.map(item=><article key={item.grant_id}>
    {item.media_type.startsWith('image/')?<img src={item.media_url} alt="Zur Nutzung freigegebenes Bild" loading="lazy"/>:
      <video src={item.media_url} controls preload="none" playsInline aria-label="Zur Nutzung freigegebenes Video"/>}
    <div><strong>{item.highlight_status==='published'?'Veröffentlicht':item.highlight_status==='pending'?'Wartet auf Prüfung':'Für Highlight freigegeben'}</strong>
    <small>Erlaubnis bis {new Date(item.expires_at).toLocaleDateString('de-DE')}</small>
    {item.highlight_status!=='published'&&item.highlight_status!=='pending'&&<button type="button" disabled={working!==null} onClick={()=>void request(item)}>{working===item.grant_id?'Senden …':'Als Highlight anfragen'}</button>}</div>
   </article>)}</div>}
 </section>;
}