'use client';
import {useEffect,useState} from 'react';
type Item={id:string;media_type?:string;caption?:string;media_id?:string;business_name?:string;created_at:string;media_status?:string};
type Queues={media:Item[];stories:Item[];highlights:Item[]};
export default function MediaEditorial(){
 const [data,setData]=useState<Queues>({media:[],stories:[],highlights:[]}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{
  const [m,s]=await Promise.all([fetch('/api/media/review',{cache:'no-store'}),fetch('/api/media/moderation',{cache:'no-store'})]);
  if(!m.ok||!s.ok)throw Error('Die Medienfreigaben können nicht geladen werden.');
  const media=await m.json(),stories=await s.json();setData({media:media.items||[],stories:stories.stories||[],highlights:stories.highlights||[]});setError('');
 }catch(e){setError(e instanceof Error?e.message:'Fehler')}}
 useEffect(()=>{void load()},[]);
 async function decide(type:'media'|'story'|'highlight',id:string,approve:boolean){setBusy(true);try{
  const api=type==='media'?'/api/media/review':'/api/media/moderation';
  const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(type==='media'?{id,approve}:{id,approve,type})});
  const out=await r.json();if(!r.ok)throw Error(out.error||'Freigabe fehlgeschlagen');
  await load();
 }catch(e){setError(e instanceof Error?e.message:'Fehler')}finally{setBusy(false)}}
 return <section className="ffm-editorial-media"><h2>Medien, Stories und Highlights</h2><p>Zuerst Dateien freigeben, danach Stories und Highlights. Ohne gültige Nutzungsrechte ist keine Veröffentlichung möglich.</p>
  {error&&<p role="alert">{error}</p>}
  {(['media','stories','highlights'] as const).map(group=><details key={group} open={group==='media'}>
   <summary>{group==='media'?'Dateien':group==='stories'?'Stories':'Highlights'} · {data[group].length} offen</summary>
   {data[group].length===0?<p>Keine offenen Einträge.</p>:data[group].map(item=><article key={item.id}>
    <div><strong>{item.caption||item.business_name||item.media_type||'Medium'}</strong>
    <small>{item.media_status?' · Datei: '+item.media_status:''}</small>
    {group==='media'&&<a href={'/api/media/'+item.id} target="_blank" rel="noopener noreferrer">Datei prüfen</a>}
    </div><div><button disabled={busy} type="button" onClick={()=>void decide(group==='media'?'media':group==='stories'?'story':'highlight',item.id,true)}>Freigeben</button>
    <button disabled={busy} type="button" onClick={()=>void decide(group==='media'?'media':group==='stories'?'story':'highlight',item.id,false)}>Ablehnen</button></div>
   </article>)}
  </details>)}
 </section>;
}