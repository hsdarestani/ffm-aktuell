'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
import {LoyaltyConfirm} from '@/components/Loyalty';
import BusinessBranchEditor from '@/components/BusinessBranchEditor';
import BusinessInsights from '@/components/BusinessInsights';
type Place={id:string;business_id:string;name:string;address:string;phone:string|null;website:string|null;opening_hours_text:string|null;verification_status:string;status:string;role:string};
type Team={business_id:string;role:'viewer'|'editor';business_name:string;all_places:boolean;places_count:number};
export default function TeamMemberWorkspace({onNotice}:{onNotice:(message:string)=>void}){
 const ui=useUiText();
 const [teams,setTeams]=useState<Team[]>([]),[places,setPlaces]=useState<Place[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/business/team/access',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(active){setTeams(d.teams||[]);setPlaces(d.places||[])}}).catch(()=>{}).finally(()=>{if(active)setReady(true)});return()=>{active=false}},[]);
 if(!ready||!teams.length)return null;
 return <section className="ffm-team-workspace"><h2>{ui("Meine Unternehmensteams")}</h2>
  {teams.map(t=><article key={t.business_id}><h3>{t.business_name}</h3><p>{t.role==='editor'?ui("Du darfst Standortkorrekturen zur Redaktion senden."):ui("Du darfst die zugewiesenen Standortdaten nur ansehen.")}</p>{t.all_places&&<BusinessInsights businessId={t.business_id}/>}
    {t.role==='editor'&&<LoyaltyConfirm/>}
    {t.role==='editor'?<BusinessBranchEditor places={places.filter(p=>p.business_id===t.business_id)} changes={[]} businessStatus="approved" onNotice={onNotice} onChanged={()=>onNotice(ui("Änderung zur Redaktion gesendet."))}/>:
    <div>{places.filter(p=>p.business_id===t.business_id).map(p=><div key={p.id} className="ffm-team-viewer-venue"><strong>{p.name}</strong><span>{p.address||ui("Adresse noch nicht gepflegt")}</span></div>)}</div>}
   </article>)}
 </section>;
}

