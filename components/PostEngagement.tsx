'use client';

import {useState,useEffect,type FormEvent} from 'react';
import {Heart,MessageCircle,Send} from 'lucide-react';

type Comment={id:string;body:string;created_at:string;display_name:string};
type Props={
 postId:string;likes:number;comments:number;liked:boolean;
 loggedIn:boolean;onLogin:()=>void;onNotice:(message:string)=>void;
};
async function request(path:string,body?:unknown){
 const r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',cache:'no-store',
  credentials:'same-origin',headers:body===undefined?undefined:{'Content-Type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok)throw Error(data.error||'Anfrage fehlgeschlagen');
 return data;
}
export default function PostEngagement({postId,likes,comments,liked,loggedIn,onLogin,onNotice}:Props){
 const [likedNow,setLikedNow]=useState(liked),[likesNow,setLikesNow]=useState(likes);
 const [expanded,setExpanded]=useState(false),[responses,setResponses]=useState<Comment[]>([]);
 const [commentsNow,setCommentsNow]=useState(comments),[text,setText]=useState('');
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  setLikedNow(liked);setLikesNow(likes);setCommentsNow(comments);
 },[liked,likes,comments,postId]);
 const like=async()=>{
  if(!loggedIn){onLogin();return;}
  if(busy)return;
  setBusy(true);
  try{
   const d=await request('post-likes',{post_id:postId,active:!likedNow});
   setLikedNow(d.liked);setLikesNow(d.count);
  }catch{onNotice('Gefällt mir konnte nicht gespeichert werden.')}
  finally{setBusy(false)}
 };
 const open=async()=>{
  if(expanded){setExpanded(false);return;}
  setExpanded(true);setLoading(true);
  try{
   const d=await request('comments?post_id='+encodeURIComponent(postId));
   setResponses(d.items||[]);
  }catch{onNotice('Kommentare konnten nicht geladen werden.')}
  finally{setLoading(false)}
 };
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();
  if(!loggedIn){onLogin();return;}
  if(busy||text.trim().length<3)return;
  setBusy(true);
  try{
   await request('comments',{post_id:postId,body:text.trim()});
   setText('');onNotice('Dein Kommentar wartet auf die Freigabe der Redaktion.');
  }catch{onNotice('Kommentar konnte nicht gespeichert werden.')}
  finally{setBusy(false)}
 };
 return <div className="ffm-post-engagement">
  <div className="ffm-post-interactions">
   <button type="button" onClick={()=>void like()} aria-pressed={likedNow} aria-label="Beitrag gefällt mir" disabled={busy}>
    <Heart size={18} fill={likedNow?'currentColor':'none'}/><span>{likesNow}</span>
   </button>
   <button type="button" aria-expanded={expanded} onClick={()=>void open()}>
    <MessageCircle size={18}/><span>{commentsNow} Kommentare</span>
   </button>
  </div>
  {expanded&&<div className="ffm-post-comments">
   {loading?<p role="status">Kommentare werden geladen …</p>:
   responses.length?responses.map(c=><div className="ffm-post-comment" key={c.id}>
    <strong>{c.display_name||'Nutzer'}</strong><p>{c.body}</p>
   </div>):<p>Noch keine freigegebenen Kommentare.</p>}
   <form onSubmit={submit}>
    <label htmlFor={'ffm-comment-'+postId}>Kommentieren</label>
    <textarea id={'ffm-comment-'+postId} value={text} onChange={e=>setText(e.target.value)} maxLength={800} minLength={3} rows={2} placeholder="Schreibe einen freundlichen Kommentar …" required/>
    <button type="submit" disabled={busy}><Send size={15}/> {loggedIn?'Zur Prüfung senden':'Anmelden'}</button>
   </form>
  </div>}
 </div>;
}
