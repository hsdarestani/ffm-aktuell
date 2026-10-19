'use client';
import {useEffect,useState} from 'react';
import {UserPlus,UserCheck} from 'lucide-react';

type Props={
 targetType:'user'|'business';
 targetId:string;
 initialFollowing?:boolean;
 own?:boolean;
 loggedIn:boolean;
 onLogin:()=>void;
 onNotice:(message:string)=>void;
 onChanged?:()=>void;
};
export default function FollowButton({targetType,targetId,initialFollowing=false,own=false,loggedIn,onLogin,onNotice,onChanged}:Props){
 const [following,setFollowing]=useState(initialFollowing);
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setFollowing(initialFollowing)},[initialFollowing,targetId]);
 if(own||!targetId)return null;
 const toggle=async()=>{
  if(!loggedIn){onLogin();return;}
  if(busy)return;
  setBusy(true);
  try{
   const response=await fetch('/api/follows',{method:'POST',credentials:'same-origin',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({target_type:targetType,target_id:targetId,active:!following})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Follow failed');
   setFollowing(Boolean(data.following));
   onChanged?.();
  }catch{onNotice('Folgen konnte nicht gespeichert werden. Bitte erneut versuchen.')}
  finally{setBusy(false)}
 };
 return <button type="button" className={'ffm-follow-btn'+(following?' is-following':'')}
    onClick={()=>void toggle()} disabled={busy} aria-pressed={following}
    aria-label={targetType==='business'?(following?'Unternehmen nicht mehr folgen':'Unternehmen folgen'):(following?'Person nicht mehr folgen':'Person folgen')}>
    {following?<UserCheck size={15}/>:<UserPlus size={15}/>}
    <span>{following?'Folge ich':'Folgen'}</span>
   </button>;
}
