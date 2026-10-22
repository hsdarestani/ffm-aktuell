'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
import {canAdmin} from '@/lib/admin-permissions';
import AdminStudio from '@/components/AdminStudio';
import {LockKeyhole} from 'lucide-react';

export default function Redaktion(){
 const ui=useUiText();
 const [permissions,setPermissions]=useState<string[]>([]);
 const [role,setRole]=useState<'loading'|'admin'|'denied'>('loading');
 useEffect(()=>{
  let active=true;
  fetch('/api/me',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json())
   .then(d=>{if(active){setRole(canAdmin(d.user)?'admin':'denied');setPermissions(d.user?.role==='admin'?['*']:d.user?.admin_permissions||[])}})
   .catch(()=>{if(active)setRole('denied')});
  return()=>{active=false};
 },[]);
 if(role==='admin')return <AdminStudio permissions={permissions} onChanged={()=>{}}/>;
 return <main className="ffm-studio-access">
  <div className="ffm-studio-access-card">
   <span>{ui("FFM AKTUELL · STADTSTUDIO")}</span>
   <LockKeyhole size={35}/>
   <h1>{role==='loading'?ui("Dein Stadtstudio wird geöffnet."):ui("Nur für die Redaktion.")}</h1>
   <p>{role==='loading'?ui("Berechtigungen werden geprüft …"):ui("Bitte mit deinem Administrator Konto anmelden und danach das Stadtstudio erneut öffnen.")}</p>
   {role==='denied'&&<a href="/">{ui("Zur Anmeldung auf die Startseite")}</a>}
  </div>
 </main>;
}
