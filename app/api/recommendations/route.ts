import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
import {reserveTextRequest,textJSON} from '@/lib/text-provider';
import {getProviderSecret} from '@/lib/provider-credentials';
import {parseDiscoveryContext,contextMatches,forecastFor,venueDistance} from '@/lib/discovery-context';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams;if(q.get('ai')==='1'&&!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});let ctx;try{ctx=parseDiscoveryContext(q)}catch{return NextResponse.json({error:'Datum, Anlass oder Budget ungültig'},{status:400})}
 const search=(q.get('q')||'').trim().slice(0,180),lang=q.get('lang')==='en'?'en':'de',u=await sessionUser(req);
 const category=q.get('category')||'';
 if(!['','Cafés','Bars','Restaurants','Freizeit'].includes(category))return NextResponse.json({error:'Ungültige Kategorie'},{status:400});
 const pref=u&&q.get('use_interests')==='1'?(await query('SELECT interests,districts FROM user_preferences WHERE user_id=$1',[u.id])).rows[0]:null;
 const weather=ctx.weather?await forecastFor(ctx.date):null;
 const [places,events]=await Promise.all([
  query(`SELECT p.id,p.name,p.category,p.district,p.description_de,p.description_en,p.verified_at,p.latitude,p.longitude,
   COALESCE((SELECT h.periods FROM place_opening_days h WHERE h.place_id=p.id AND h.day=$1::date AND h.state='open' AND h.checked_at BETWEEN now()-interval '30 days' AND now()),'[]'::jsonb) AS periods,
   COALESCE((SELECT jsonb_object_agg(a.field,a.value) FROM place_attributes a WHERE a.place_id=p.id AND a.checked_at BETWEEN now()-interval '30 days' AND now()),'{}'::jsonb) AS facts
   FROM places p WHERE p.status='published' AND p.verification_status='verified' AND p.activity_status='operating' AND p.verified_at BETWEEN now()-interval '30 days' AND now() AND latitude IS NOT NULL AND longitude IS NOT NULL AND ($2::text='' OR p.category=$2 OR EXISTS(SELECT 1 FROM place_categories pc WHERE pc.place_id=p.id AND pc.category_slug=$2)) ORDER BY editorial_rank DESC,name LIMIT 500`,[ctx.date,category]),
  query(`SELECT id,title,venue,starts_at,ends_at,price_cents,price_source_url,source_url,ticket_url FROM events
   WHERE status='published' AND starts_at>now() AND (starts_at AT TIME ZONE 'Europe/Berlin')::date=$1::date
    AND ($2::int IS NULL OR (price_cents<=$2 AND price_source_url ~ '^https://')) AND EXTRACT(hour FROM starts_at AT TIME ZONE 'Europe/Berlin')>=$3::int AND EXTRACT(hour FROM starts_at AT TIME ZONE 'Europe/Berlin')<$4::int ORDER BY starts_at LIMIT 12`,[ctx.date,ctx.eventBudget,...ctx.timeRange])
 ]);
 const words=(search+' '+(pref?.interests||[]).join(' ')).toLocaleLowerCase().split(/[^a-zäöüß0-9]+/i).filter(w=>w.length>=3);
 const scored=places.rows.filter(p=>contextMatches(p.facts,ctx,Boolean(weather?.prefer_indoor),p)).map(p=>({p,score:words.reduce((v,w)=>v+([p.name,p.category,p.district,p.description_de,p.description_en].join(' ').toLocaleLowerCase().includes(w)?1:0),0)+(pref?.districts?.includes(p.district)?2:0)})).sort((a,b)=>b.score-a.score);
 let mode='editorial';
 let items:{id:string;name:string;reasons:string[];[key:string]:unknown}[]=scored.slice(0,4).map(x=>({...x.p,id:String(x.p.id),name:String(x.p.name),distance_km:ctx.lat!==null?venueDistance(ctx.lat,ctx.lon!,Number(x.p.latitude),Number(x.p.longitude)):null,reasons:[...(ctx.budget?['price_level']:[]),...(ctx.occasion?[ctx.occasion]:[]),...(weather?.prefer_indoor?['indoor']:[])]}));
 if(q.get('ai')==='1'&&u&&search.length>=3&&items.length&&await getProviderSecret('OPENAI_API_KEY')&&await reserveTextRequest(u.id,'ranking')){
  try{const r=await textJSON('Return JSON {"ids":[]} containing up to four supplied venue IDs ordered by relevance. Never invent venues, prices, availability or opening hours.',{question:search,context:{...ctx,lat:undefined,lon:undefined},interests:pref?.interests||[],candidates:scored.slice(0,12).map(x=>x.p)});if(Array.isArray(r.ids)){const ids=r.ids.filter((x):x is string=>typeof x==='string');const ranked=ids.map(id=>items.find(p=>p.id===id)).filter((x):x is typeof items[number]=>Boolean(x));if(ranked.length){items=[...new Map(ranked.map(p=>[p.id,p])).values()];mode='ai'}}}catch{/* Deterministic verified fallback. */}
 }
 return NextResponse.json({items,events:events.rows,mode,context:ctx,weather,notice:lang==='de'?[
  items.length?'Nur aktuell unabhängig geprüfte Orte mit passenden belegten Merkmalen.':'Keine passenden unabhängig geprüften Orte mit diesen belegten Merkmalen.',
  'Datum und Tageszeit filtern Veranstaltungen und belegte Tagespläne. Verfügbarkeit beim Anbieter prüfen.',
  ctx.lat!==null?'Umkreis, Anlass, Begleitung und Stimmung gelten für Orte. Veranstaltungsorte separat prüfen.':'',
  ctx.budget?'Preisniveau ist relativ und kein Eurobudget.':'',ctx.eventBudget!==null?'Das Veranstaltungsbudget gilt nur für den belegten Eintrittspreis.':'',
  ctx.weather&&!weather?'Wetterdaten nicht verfügbar. Kein Wetterfilter angewendet.':'',weather?.prefer_indoor?'Wegen der Vorhersage werden nur belegte Innenangebote vorgeschlagen.':''
 ].filter(Boolean).join(' '):'Verified venues and sourced attributes only. Dates filter events; venue hours and availability require confirmation. Venue price levels are relative. Weather is applied only when a current forecast is available.'},{headers:{'Cache-Control':'private,no-store'}});
}
