'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {LockKeyhole,ShieldCheck} from 'lucide-react';

export default function AdminAktivieren(){
 const [code,setCode]=useState('');
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const [passwordLength,setPasswordLength]=useState(0);
 useEffect(()=>{
  setCode(new URLSearchParams(window.location.search).get('code')||'');
  document.title='Redaktion freischalten · FFM Aktuell';
 },[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!code||pending)return;
  const f=new FormData(event.currentTarget);
  const password=String(f.get('password')||'');
  if(password.length<16){
   setError('Das Passwort ist zu kurz: '+password.length+' von mindestens 16 Zeichen.');
   return;
  }
  if(password.length>128){
   setError('Das Passwort darf höchstens 128 Zeichen haben.');
   return;
  }
  if(password!==f.get('password_repeat')){setError('Passwörter stimmen nicht überein.');return}
  setPending(true);setError('');
  try{
   const r=await fetch('/api/admin/activate',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({token:code,email:String(f.get('email')||''),display_name:String(f.get('display_name')||''),password:String(f.get('password')||'')})
   });
   const result=await r.json();
   if(!r.ok)throw Error(result.error||'Aktivierung fehlgeschlagen');
   window.location.replace('/');
  }catch(e){setError(e instanceof Error?e.message:'Aktivierung fehlgeschlagen');setPending(false)}
 }
 return <main style={{minHeight:'100vh',background:'#f5f1e9',color:'#202b28',display:'grid',placeItems:'center',padding:'28px 16px'}}>
  <article style={{maxWidth:540,width:'100%',background:'#fff',padding:'clamp(22px,5vw,44px)',borderRadius:18,boxShadow:'0 18px 65px #151c1a19'}}>
   <a href="/" style={{color:'#4d665b',fontSize:14}}>FFM Aktuell · Startseite</a>
   <div style={{display:'flex',alignItems:'center',gap:12,marginTop:30}}><ShieldCheck size={30}/><h1 style={{fontSize:27,margin:0}}>Redaktion freischalten</h1></div>
   <p style={{lineHeight:1.6,fontSize:15}}>Richte dein persönliches Administrator Konto ein. Der Einladungslink ist nur einmal verwendbar. Dein Passwort wird verschlüsselt gespeichert.</p>
   {!code?<p role="alert">Einladungslink fehlt. Bitte den vollständigen persönlichen Link verwenden.</p>:<form onSubmit={submit} style={{display:'grid',gap:17,marginTop:25}}>
    <label style={{display:'grid',gap:7}}>Name<input name="display_name" defaultValue="FFM Redaktion" minLength={2} required autoComplete="name" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    <label style={{display:'grid',gap:7}}>E-Mail-Adresse<input type="email" name="email" required autoComplete="email" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    <label style={{display:'grid',gap:7}}>Persönliches Passwort (mindestens 16 Zeichen)<input type="password" name="password" maxLength={128} required autoComplete="new-password" aria-describedby="passwort-hinweis" onChange={e=>{setPasswordLength(e.currentTarget.value.length);setError('')}} style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/><small id="passwort-hinweis" aria-live="polite" style={{color:passwordLength>0&&passwordLength<16?'#97362c':'#4d665b'}}>{passwordLength===0?'Mindestens 16 Zeichen eingeben':passwordLength<16?'Noch '+(16-passwordLength)+' Zeichen erforderlich':'Passwortlänge erfüllt'}</small></label>
    <label style={{display:'grid',gap:7}}>Passwort wiederholen<input type="password" name="password_repeat" required autoComplete="new-password" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    {error&&<p role="alert" style={{color:'#9d2424'}}>{error}</p>}
    <button disabled={pending} type="submit" style={{display:'flex',justifyContent:'center',gap:10,alignItems:'center',padding:15,background:'#243d35',color:'#fff',border:0,borderRadius:7,cursor:'pointer'}}><LockKeyhole size={18}/>{pending?'Wird eingerichtet …':'Administrator Konto aktivieren'}</button>
   </form>}
   <p style={{fontSize:12,opacity:.7,marginTop:24}}>Nur für eine berechtigte Person. Link und Passwort nicht weitergeben.</p>
  </article>
 </main>;
}
