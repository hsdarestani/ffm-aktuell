import {randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {trustedOrigin} from '@/lib/auth';
import {pool} from '@/lib/db';
import {placements,eligibleAd,adHash,adIpHash} from '@/lib/advertising';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,placement=q.get('placement')||'',category=(q.get('category')||'').slice(0,80),district=(q.get('district')||'').slice(0,80);
 if(!placements.includes(placement as typeof placements[number]))return reply({error:'Anzeigenplatz ungültig'},400);
 if((placement==='category'&&!category)||(placement==='district'&&!district))return reply({items:[]});
 const ip=adIpHash(req.headers.get('x-real-ip')||'unknown'),tx=await pool.connect();
 try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['ad:'+ip]);
 const count=(await tx.query("SELECT count(*)::int AS n FROM ad_exposures WHERE ip_hash=$1 AND created_at>now()-interval '1 hour'",[ip])).rows[0].n;
 if(count>=60){await tx.query('ROLLBACK');return reply({items:[]})}
 await tx.query("DELETE FROM ad_exposures WHERE created_at<now()-interval '2 days'");
 const ad=(await tx.query(`SELECT o.id,o.snapshot,p.name AS place_name,b.name AS business_name FROM ad_orders o JOIN ad_campaigns c ON c.id=o.campaign_id JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id
 WHERE ${eligibleAd} AND o.snapshot->>'placement'=$1 AND ($1<>'district' OR p.district=$2) AND ($1<>'category' OR p.category=$3 OR EXISTS(SELECT 1 FROM place_categories pc WHERE pc.place_id=p.id AND pc.category_slug=$3))
 ORDER BY random() LIMIT 1`,[placement,district,category])).rows[0];
 if(!ad){await tx.query('COMMIT');return reply({items:[]})}
 const token=randomBytes(32).toString('hex');await tx.query('INSERT INTO ad_exposures(order_id,token_hash,ip_hash) VALUES($1,$2,$3)',[ad.id,adHash(token),ip]);await tx.query('COMMIT');
 return reply({items:[{token,title:ad.snapshot.title,body:ad.snapshot.copy_de,place_id:ad.snapshot.place_id,place_name:ad.place_name,business_name:ad.business_name}]});
 }catch{await tx.query('ROLLBACK');return reply({items:[]})}finally{tx.release()}
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const d=await req.json().catch(()=>null);
 if(!d||!/^([a-f0-9]{64})$/.test(d.token||'')||!['impression','click'].includes(d.kind))return reply({error:'Messung ungültig'},400);
 const tx=await pool.connect();try{await tx.query('BEGIN');
 const exposure=(await tx.query(`SELECT e.*,c.id AS campaign_id FROM ad_exposures e JOIN ad_orders o ON o.id=e.order_id JOIN ad_campaigns c ON c.id=o.campaign_id JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id
 WHERE e.token_hash=$1 AND e.expires_at>now() AND ${eligibleAd} FOR UPDATE OF e`,[adHash(d.token)])).rows[0];
 if(!exposure){await tx.query('ROLLBACK');return reply({error:'Messung abgelaufen'},409)}
 const impression=exposure.impression_at?0:1,click=d.kind==='click'&&!exposure.click_at?1:0;
 if(impression||click){await tx.query("UPDATE ad_exposures SET impression_at=COALESCE(impression_at,now()),click_at=CASE WHEN $2::boolean THEN COALESCE(click_at,now()) ELSE click_at END WHERE id=$1",[exposure.id,d.kind==='click']);await tx.query(`INSERT INTO ad_daily_stats(campaign_id,day,impressions,clicks) VALUES($1,(now() AT TIME ZONE 'Europe/Berlin')::date,$2,$3)
 ON CONFLICT(campaign_id,day) DO UPDATE SET impressions=ad_daily_stats.impressions+excluded.impressions,clicks=ad_daily_stats.clicks+excluded.clicks`,[exposure.campaign_id,impression,click]);}
 await tx.query('COMMIT');return reply({recorded:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Messung nicht gespeichert'},500)}finally{tx.release()}
}
