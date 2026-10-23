'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
async function api(method='GET',body?:unknown){
 const r=await fetch('/api/me/push',{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const d=await r.json();if(!r.ok)throw Error(d.error||'Push konnte nicht eingerichtet werden.');return d;
}
export default function PushSettings(){
 const ui=useUiText();
 const [config,setConfig]=useState<{available:boolean;public_key:string;devices:number}|null>(null);
 const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const supported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 useEffect(()=>{let live=true;api().then(d=>{if(live)setConfig(d)}).catch(()=>{if(live)setMessage(ui("Push Status konnte nicht geladen werden."))});
 if(supported)navigator.serviceWorker.getRegistration('/').then(async r=>{const s=await r?.pushManager.getSubscription();if(live)setActive(Boolean(s))});
 return()=>{live=false}},[supported]);
 const enable=async()=>{setBusy(true);setMessage('');let created:PushSubscription|null=null;
  try{
   // Permission is requested only from this explicit button interaction.
   if(await Notification.requestPermission()!=='granted')throw Error(ui("Benachrichtigungen wurden nicht erlaubt. Du kannst die Freigabe in den Browsereinstellungen ändern."));
   await navigator.serviceWorker.register('/sw.js');const registration=await navigator.serviceWorker.ready;
   const bytes=Uint8Array.from(atob(config!.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
   const old=await registration.pushManager.getSubscription();
   const sub=old||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
   if(!old)created=sub;await api('POST',sub.toJSON());setActive(true);setConfig(c=>c?{...c,devices:Math.max(c.devices,1)}:c);setMessage(ui("Dieses Gerät ist aktiviert. Wähle und speichere unten die gewünschten Kategorien."));
  }catch(e){if(created)await created.unsubscribe().catch(()=>{});setMessage((e as Error).message)}finally{setBusy(false)}
 };
 const disable=async(all=false)=>{setBusy(true);try{
  const reg=await navigator.serviceWorker.getRegistration('/'),sub=await reg?.pushManager.getSubscription();
  await api('DELETE',all?{all:true}:{endpoint:sub?.endpoint});await sub?.unsubscribe();setActive(false);setMessage(all?ui("Alle Geräte wurden entfernt."):ui("Push auf diesem Gerät deaktiviert."));
  setConfig(await api());
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}};
 return <section className="ffm-profile-panel"><h2>{ui("Push auf diesem Gerät")}</h2>
 <p className="ffm-profile-tip">{ui("Erinnerungen an gespeicherte Veranstaltungen, neue Nachrichten, Angebote, Beiträge bei gefolgten Unternehmen und passende Stadttipps. Nur mit Gerätefreigabe und gespeicherter Kategorieauswahl.")}</p>
 {!supported?<p>{ui("Dieser Browser unterstützt Web Push hier nicht. Auf iPhone oder iPad die Website zuerst zum Home Bildschirm hinzufügen.")}</p>:!config?<p>{message||ui("Status wird geladen …")}</p>:<>
 {!config.available&&<p>{ui("Der Push Dienst ist noch nicht eingerichtet.")}</p>}
 <button type="button" className="ffm-profile-outline" disabled={busy||(!active&&!config.available)} onClick={()=>void(active?disable():enable())}>{busy?ui("Bitte warten …"):active?ui("Dieses Gerät deaktivieren"):ui("Dieses Gerät aktivieren")}</button>
 {config.devices>0&&<button type="button" className="ffm-profile-outline" disabled={busy} onClick={()=>void disable(true)}>{ui("Alle Geräte entfernen (")}{config.devices})</button>}
 <p role="status">{ui(message)}</p></>}
 </section>;
}
