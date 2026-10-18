'use client';

import {useEffect,useState,type FormEvent} from 'react';
import {Star,Flag,ChevronDown} from 'lucide-react';

type Review={id:string;rating:number;body:string;created_at:string;display_name:string};
type Response={summary:{count:number;average:number|null};items:Review[]};
type Props={
 placeId:string;demo?:boolean;loggedIn:boolean;
 onLogin:()=>void;onNotice:(message:string)=>void;
};
const empty:Response={summary:{count:0,average:null},items:[]};
async function request(path:string,body?:unknown){
 const r=await fetch('/api/'+path,{cache:'no-store',credentials:'same-origin',method:body===undefined?'GET':'POST',
  headers:body===undefined?undefined:{'Content-Type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();
 if(!r.ok)throw Error(data?.error||'Fehler');
 return data;
}
export default function VenueReviews({placeId,demo,loggedIn,onLogin,onNotice}:Props){
 const [data,setData]=useState<Response>(empty);
 const [rating,setRating]=useState(0),[body,setBody]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 const [reported,setReported]=useState<string[]>([]);
 useEffect(()=>{
  if(demo)return;
  let active=true;setError(false);setData(empty);
  void request('reviews?place_id='+encodeURIComponent(placeId))
   .then((value:Response)=>{if(active)setData(value)})
   .catch(()=>{if(active)setError(true)});
  return()=>{active=false};
 },[placeId,demo]);
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();if(busy)return;
  if(!loggedIn){onLogin();return;}
  if(rating<1||rating>5){onNotice('Bitte wähle zuerst eine Bewertung.');return;}
  if(body.trim().length<20){onNotice('Bitte beschreibe deine Erfahrung in mindestens 20 Zeichen.');return;}
  setBusy(true);
  try{
   await request('reviews',{place_id:placeId,rating,body:body.trim()});
   setBody('');setRating(0);
   onNotice('Danke! Deine Bewertung wird vor der Veröffentlichung geprüft.');
  }catch{onNotice('Bewertung konnte nicht gespeichert werden. Bitte versuche es erneut.')}
  finally{setBusy(false)}
 };
 const report=async(reviewId:string)=>{
  if(!loggedIn){onLogin();return;}
  if(reported.includes(reviewId))return;
  try{
   await request('review-reports',{review_id:reviewId,reason:'other',message:'Bitte redaktionell prüfen.'});
   setReported(prev=>[...prev,reviewId]);onNotice('Danke, die Redaktion prüft die Bewertung.');
  }catch{onNotice('Meldung konnte nicht gespeichert werden oder wurde bereits gemeldet.')}
 };
 if(demo)return null;
 return <section className="ffm-venue-reviews" aria-label="Bewertungen dieses Ortes">
  <div className="ffm-venue-reviews-heading">
   <div><h3>Bewertungen</h3><small>Erfahrungen von Nutzern · Besuch nicht verifiziert</small></div>
   <div className="ffm-review-summary"><Star size={17} fill={data.summary.average?'currentColor':'none'}/>
    <strong>{data.summary.average===null?'—':Number(data.summary.average).toLocaleString('de-DE',{maximumFractionDigits:1})}</strong>
    <span>({data.summary.count})</span></div>
  </div>
  {error?<p className="ffm-reviews-error">Bewertungen sind gerade nicht verfügbar.</p>:
   data.items.length?<div className="ffm-review-list">{data.items.map(r=><article className="ffm-review-record" key={r.id}>
    <div className="ffm-review-meta"><span>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span><small>{r.display_name||'Nutzer'} · {new Date(r.created_at).toLocaleDateString('de-DE')}</small></div>
    <p>{r.body}</p>
    <button type="button" disabled={reported.includes(r.id)} onClick={()=>void report(r.id)} aria-label="Bewertung melden">
     <Flag size={13}/> {reported.includes(r.id)?'Gemeldet':'Melden'}</button>
   </article>)}</div>:<p className="ffm-reviews-empty">Noch keine freigegebenen Bewertungen.</p>}
  <details className="ffm-review-write">
   <summary>Ort bewerten <ChevronDown size={17}/></summary>
   <form onSubmit={submit}>
    <fieldset><legend>Deine Bewertung</legend><div className="ffm-review-stars" role="group" aria-label="Sterne vergeben">
     {[1,2,3,4,5].map(v=><button type="button" aria-label={v+' von 5 Sternen'} aria-pressed={rating===v} onClick={()=>setRating(v)} key={v}><Star size={24} fill={v<=rating?'currentColor':'none'}/></button>)}
    </div></fieldset>
    <label>Deine Erfahrung<textarea rows={3} value={body} minLength={20} maxLength={1000} onChange={e=>setBody(e.target.value)} placeholder="Was hat dir gefallen? Was sollten andere wissen?" required/></label>
    <p>Deine Meinung wird moderiert. Bitte keine personenbezogenen Daten anderer Personen veröffentlichen.</p>
    <button className="ffm-review-submit" disabled={busy} type="submit">{loggedIn?'Bewertung einreichen':'Anmelden & bewerten'}</button>
   </form>
  </details>
 </section>;
}
