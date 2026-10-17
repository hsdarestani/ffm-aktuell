'use client';
import {useEffect,useState} from 'react';
import AdminStudio from '@/components/AdminStudio';
import {LockKeyhole} from 'lucide-react';

export default function Redaktion(){
 const [role,setRole]=useState<'loading'|'admin'|'denied'>('loading');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;
  fetch('/api/me',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json())
   .then(d=>{if(active)setRole(d.user?.role==='admin'?'admin':'denied')})
   .catch(()=>{if(active)setRole('denied')});
  return()=>{active=false};
 },[]);
 if(role==='admin')return <AdminStudio onChanged={()=>setRevision(v=>v+1)} key={revision}/>;
 return <main className="ffm-studio-access">
  <div className="ffm-studio-access-card">
   <span>FFM AKTUELL · STADTSTUDIO</span>
   <LockKeyhole size={35}/>
   <h1>{role==='loading'?'Dein Stadtstudio wird geöffnet.':'Nur für die Redaktion.'}</h1>
   <p>{role==='loading'?'Berechtigungen werden geprüft …':'Bitte mit deinem Administrator Konto anmelden und danach das Stadtstudio erneut öffnen.'}</p>
   {role==='denied'&&<a href="/">Zur Anmeldung auf die Startseite</a>}
  </div>
 </main>;
}