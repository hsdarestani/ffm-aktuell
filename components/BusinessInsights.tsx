'use client';
import {useUiText} from '@/lib/ui-locale';
import {useEffect,useState} from 'react';
type Data={impressions?:number|null;clicks?:number|null;business:{name:string};active_places:number;current_deals:number;coupons_claimed:number;coupons_redeemed:number;published_posts:number;followers:number|null;campaign_pending:number;campaign_reviewed_not_paid:number;disclaimer:string};
export default function BusinessInsights({businessId}:{businessId:string}){
 const ui=useUiText();
 const [insight,setInsight]=useState<Data|null>(null),[failed,setFailed]=useState('');
 useEffect(()=>{let active=true;
  fetch('/api/business/insights?'+new URLSearchParams({business_id:businessId}),{cache:'no-store'})
   .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||ui("Kennzahlen derzeit nicht erreichbar."));return d}).then(d=>{if(active)setInsight(d)}).catch(e=>{if(active)setFailed(e.message)});
  return()=>{active=false}
 },[businessId]);
 if(failed)return <p className="ffm-insights-warning">{failed}</p>;
 if(!insight)return <p className="ffm-insights-warning" role="status">{ui("Kennzahlen laden …")}</p>;
 const metrics=[...(insight.impressions!=null?[['Sichtbare Anzeigen (30 Tage)',insight.impressions],['Klicks auf Anzeigen (30 Tage)',insight.clicks||0]]:[]),['Aktive Standorte',insight.active_places],['Angebote aktuell',insight.current_deals],['Gutscheine beansprucht (30 Tage)',insight.coupons_claimed],['Gutscheine eingelöst (30 Tage)',insight.coupons_redeemed],['Öffentliche Beiträge (30 Tage)',insight.published_posts],['Follower',insight.followers===null?'Unter 5':insight.followers]];
 return <section className="ffm-insights" aria-label={ui("Geschäftsstatistik")}><div className="ffm-insights-head"><h2>{ui("Dein Überblick")}</h2><span>{ui("Keine Nutzerdaten offengelegt")}</span></div>
  <div className="ffm-insights-grid">{metrics.map(([label,value])=><div key={ui(String(label))}><small>{ui(String(label))}</small><strong>{value}</strong></div>)}</div>
  <p>{insight.disclaimer}</p>
  {insight.campaign_pending>0&&<p>{insight.campaign_pending} {ui(" Werbeanträge warten auf Prüfung. Freigaben sind noch keine bezahlten Anzeigen.")}</p>}
 </section>;
}

