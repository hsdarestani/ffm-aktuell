'use client';
import {useUiText,UiLanguageSwitch} from '@/lib/ui-locale';
import {useEffect,useState,type FormEvent} from 'react';
import {LockKeyhole,ShieldCheck} from 'lucide-react';

export default function AdminAktivieren(){
 const ui=useUiText();
 const [code,setCode]=useState('');
 const [pending,setPending]=useState(false);
 const [error,setError]=useState('');
 const [passwordLength,setPasswordLength]=useState(0);
 useEffect(()=>{
  setCode(new URLSearchParams(window.location.search).get('code')||'');
  document.title=ui('Redaktion freischalten · FFM Aktuell');
 },[ui]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!code||pending)return;
  const f=new FormData(event.currentTarget);
  const password=String(f.get('password')||'');
  if(password.length<16){
   setError(ui("Das Passwort ist zu kurz: ")+password.length+ui(" von mindestens 16 Zeichen."));
   return;
  }
  if(password.length>128){
   setError(ui("Das Passwort darf höchstens 128 Zeichen haben."));
   return;
  }
  if(password!==f.get('password_repeat')){setError(ui("Passwörter stimmen nicht überein."));return}
  setPending(true);setError('');
  try{
   const r=await fetch('/api/admin/activate',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
    body:JSON.stringify({token:code,email:String(f.get('email')||''),display_name:String(f.get('display_name')||''),password:String(f.get('password')||'')})
   });
   const result=await r.json();
   if(!r.ok)throw Error(result.error||ui("Aktivierung fehlgeschlagen"));
   window.location.replace('/');
  }catch(e){setError(e instanceof Error?e.message:ui("Aktivierung fehlgeschlagen"));setPending(false)}
 }
 return <main style={{minHeight:'100vh',background:'#f5f1e9',color:'#202b28',display:'grid',placeItems:'center',padding:'28px 16px'}}>
  <article style={{maxWidth:540,width:'100%',background:'#fff',padding:'clamp(22px,5vw,44px)',borderRadius:18,boxShadow:'0 18px 65px #151c1a19'}}>
   <UiLanguageSwitch/><a href="/" style={{color:'#4d665b',fontSize:14}}>{ui("FFM Aktuell · Startseite")}</a>
   <div style={{display:'flex',alignItems:'center',gap:12,marginTop:30}}><ShieldCheck size={30}/><h1 style={{fontSize:27,margin:0}}>{ui("Redaktion freischalten")}</h1></div>
   <p style={{lineHeight:1.6,fontSize:15}}>{ui("Richte dein persönliches Administrator Konto ein. Der Einladungslink ist nur einmal verwendbar. Dein Passwort wird als sicherer Hash gespeichert.")}</p>
   {!code?<p role="alert">{ui("Einladungslink fehlt. Bitte den vollständigen persönlichen Link verwenden.")}</p>:<form onSubmit={submit} style={{display:'grid',gap:17,marginTop:25}}>
    <label style={{display:'grid',gap:7}}>{ui("Name")}<input name="display_name" defaultValue="FFM Redaktion" minLength={2} required autoComplete="name" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    <label style={{display:'grid',gap:7}}>{ui("E-Mail-Adresse")}<input type="email" name="email" required autoComplete="email" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    <label style={{display:'grid',gap:7}}>{ui("Persönliches Passwort (mindestens 16 Zeichen)")}<input type="password" name="password" maxLength={128} required autoComplete="new-password" aria-describedby="passwort-hinweis" onChange={e=>{setPasswordLength(e.currentTarget.value.length);setError('')}} style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/><small id="passwort-hinweis" aria-live="polite" style={{color:passwordLength>0&&passwordLength<16?'#97362c':'#4d665b'}}>{passwordLength===0?ui("Mindestens 16 Zeichen eingeben"):passwordLength<16?ui("Noch ")+(16-passwordLength)+ui(" Zeichen erforderlich"):ui("Passwortlänge erfüllt")}</small></label>
    <label style={{display:'grid',gap:7}}>{ui("Passwort wiederholen")}<input type="password" name="password_repeat" required autoComplete="new-password" style={{padding:12,border:'1px solid #aaa',borderRadius:7}}/></label>
    {error&&<p role="alert" style={{color:'#9d2424'}}>{ui(error)}</p>}
    <button disabled={pending} type="submit" style={{display:'flex',justifyContent:'center',gap:10,alignItems:'center',padding:15,background:'#243d35',color:'#fff',border:0,borderRadius:7,cursor:'pointer'}}><LockKeyhole size={18}/>{pending?ui("Wird eingerichtet …"):ui("Administrator Konto aktivieren")}</button>
   </form>}
   <p style={{fontSize:12,opacity:.7,marginTop:24}}>{ui("Nur für eine berechtigte Person. Link und Passwort nicht weitergeben.")}</p>
  </article>
 </main>;
}

