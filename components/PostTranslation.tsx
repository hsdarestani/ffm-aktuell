'use client';
import {useUiText} from '@/lib/ui-locale';
import {useState} from 'react';
export default function PostTranslation({postId,language,loggedIn,onLogin}:{postId:string;language:'de'|'en';loggedIn:boolean;onLogin:()=>void}){
 const ui=useUiText();
 const [text,setText]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function translate(){if(!loggedIn){onLogin();return}if(text){setShow(!show);return}setBusy(true);setError('');try{const r=await fetch('/api/translations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({post_id:postId,language,consent:true})}),d=await r.json();if(!r.ok)throw Error(d.error);setText(d.text);setShow(true)}catch(e){setError(e instanceof Error?e.message:ui("Übersetzung fehlgeschlagen"))}finally{setBusy(false)}}
 return <details><summary>{language==='de'?ui("Beitrag übersetzen"):ui("Translate post")}</summary><p>{language==='de'?ui("Der öffentliche Text wird zur Übersetzung an OpenAI übertragen."):ui("The public text is sent to OpenAI for translation.")}</p><button disabled={busy} onClick={()=>void translate()}>{busy?'…':show?(language==='de'?ui("Übersetzung ausblenden"):ui("Hide translation")):(language==='de'?ui("Übersetzen"):ui("Translate"))}</button>{show&&<div lang={language}><small>{language==='de'?ui("Maschinell übersetzt, Fehler möglich"):ui("Machine translation, errors possible")}</small><p>{text}</p></div>}{error&&<p role="status">{ui(error)}</p>}</details>;
}
