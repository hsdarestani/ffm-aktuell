'use client';
import {useEffect,useState} from 'react';
type Data={business:{name:string};active_places:number;current_deals:number;coupons_claimed:number;coupons_redeemed:number;published_posts:number;followers:number|null;campaign_pending:number;campaign_reviewed_not_paid:number;disclaimer:string};
export default function BusinessInsights({businessId}:{businessId:string}){
 const [insight,setInsight]=useState<Data|null>(null),[failed,setFailed]=useState('');
 useEffect(()=>{let active=true;
  fetch('/api/business/insights?'+new URLSearchParams({business_id:businessId}),{cache:'no-store'})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Kennzahlen derzeit nicht erreichbar.');return d}).then(d=>{if(active)setInsight(d)}).catch(e=>{if(active)setFailed(e.message)});
  return()=>{active=false}
 },[businessId]);
 if(failed)return <p className="ffm-insights-warning">{failed}</p>;
 if(!insight)return <p className="ffm-insights-warning" role="status">Kennzahlen laden …</p>;
 const metrics=[['Aktive Standorte',insight.active_places],['Angebote aktuell',insight.current_deals],['Gutscheine beansprucht (30 Tage)',insight.coupons_claimed],['Gutscheine eingelöst (30 Tage)',insight.coupons_redeemed],['Öffentliche Beiträge (30 Tage)',insight.published_posts],['Follower',insight.followers===null?'Unter 5':insight.followers]];
 return <section className="ffm-insights" aria-label="Geschäftsstatistik"><div className="ffm-insights-head"><h2>Dein Überblick</h2><span>Keine Nutzerdaten offengelegt</span></div>
  <div className="ffm-insights-grid">{metrics.map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
  <p>{insight.disclaimer}</p>
  {insight.campaign_pending>0&&<p>{insight.campaign_pending} Werbeanträge warten auf Prüfung. Freigaben sind noch keine bezahlten Anzeigen.</p>}
 </section>;
}

