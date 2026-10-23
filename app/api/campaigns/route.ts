import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[0-9a-f-]{36}$/,ymd=/^20\d\d-\d\d-\d\d$/;
const placements=['search','home','feed','stories','events','district','category','new_openings'] as const;
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return fail('Anmeldung erforderlich',401);
 const rows=await query("SELECT c.id,c.title,c.copy_de,c.placement,c.start_date,c.end_date,c.status,c.place_id,c.rejection_note,c.created_at,(SELECT jsonb_agg(jsonb_build_object('id',o.id,'state',o.state,'amount',o.amount,'invoice_url',o.invoice_url,'snapshot',o.snapshot)) FROM ad_orders o WHERE o.campaign_id=c.id) AS orders,(SELECT COALESCE(sum(impressions),0)::int FROM ad_daily_stats WHERE campaign_id=c.id) AS impressions,(SELECT COALESCE(sum(clicks),0)::int FROM ad_daily_stats WHERE campaign_id=c.id) AS clicks,p.name AS place_name,b.name AS business_name FROM ad_campaigns c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE b.owner_id=$1 ORDER BY c.created_at DESC LIMIT 60",[u.id]);
 return NextResponse.json({items:rows.rows,checkout_available:false},{headers:{'Cache-Control':'private,no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return fail('Ungültige Anfrage',403);
 const u=await sessionUser(req);if(!u)return fail('Anmeldung erforderlich',401);
 const data=await req.json().catch(()=>null);
 if(!data||!['create','submit','cancel'].includes(data.action))return fail('Aktion ungültig');
 if(data.action==='create'){
  const title=typeof data.title==='string'?data.title.trim():'',copy=typeof data.copy_de==='string'?data.copy_de.trim():'';
  const start=typeof data.start_date==='string'?data.start_date:'',end=typeof data.end_date==='string'?data.end_date:'';
  if(title.length<4||title.length>150||copy.length<10||copy.length>1500||!placements.includes(data.placement)||
    !uuid.test(data.place_id||'')||!ymd.test(start)||!ymd.test(end)||
    !Number.isFinite(Date.parse(start+'T00:00:00Z'))||!Number.isFinite(Date.parse(end+'T00:00:00Z'))||
    start<new Date().toISOString().slice(0,10)||end<start||
    (Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))>90*86400000)return fail('Kampagnendaten ungültig');
  const owned=await query("SELECT b.id FROM businesses b JOIN places p ON p.business_id=b.id WHERE b.owner_id=$1 AND b.status='approved' AND p.id=$2 AND p.status='published'",[u.id,data.place_id]);
  if(!owned.rowCount)return fail('Standort nicht freigegeben oder nicht dein Unternehmen',403);
  const count=await query("SELECT count(*)::int AS n FROM ad_campaigns WHERE business_id=$1 AND created_at>now()-interval '30 days'",[owned.rows[0].id]);
  if(count.rows[0].n>=20)return fail('Monatslimit erreicht',429);
  const r=await query("INSERT INTO ad_campaigns(business_id,created_by,place_id,title,copy_de,placement,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status",[owned.rows[0].id,u.id,data.place_id,title,copy,data.placement,start,end]);
  await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'ad:draft-created','ad_campaign',$2)",[u.id,r.rows[0].id]);
  return NextResponse.json({item:r.rows[0],notice:'Entwurf gespeichert. Es wurde nichts gebucht oder veröffentlicht.'},{status:201});
 }
 if(!uuid.test(data.id||''))return fail('Kampagne ungültig');
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const r=await tx.query("SELECT c.id,c.status,c.start_date::text AS start_date,b.status AS business_status,p.status AS place_status FROM ad_campaigns c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.id=$1 AND b.owner_id=$2 FOR UPDATE OF c",[data.id,u.id]);
  if(!r.rowCount){await tx.query('ROLLBACK');return fail('Kampagne nicht gefunden',404)}
  const old=r.rows[0];
  if(old.status!=='draft'&&data.action==='submit'){await tx.query('ROLLBACK');return fail('Nur Entwürfe können eingereicht werden',409)}
  if(data.action==='cancel'&&!['draft','pending_review','awaiting_commercial_setup'].includes(old.status)){await tx.query('ROLLBACK');return fail('Kampagne nicht mehr änderbar',409)}
  if(data.action==='submit'&&(old.business_status!=='approved'||old.place_status!=='published'||String(old.start_date).slice(0,10)<new Date().toISOString().slice(0,10))){await tx.query('ROLLBACK');return fail('Unternehmen, Standort oder Zeitraum nicht freigegeben',409)}
  const status=data.action==='submit'?'pending_review':'cancelled';
  await tx.query("UPDATE ad_campaigns SET status=$2,updated_at=now() WHERE id=$1",[data.id,status]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'ad_campaign',$3)",[u.id,'ad:'+status,data.id]);
  await tx.query('COMMIT');
  return NextResponse.json({id:data.id,status,notice:status==='pending_review'?'Zur redaktionellen Prüfung gesendet. Keine Zahlung oder Ausspielung.':'Kampagne wurde storniert.'});
 }catch(e){await tx.query('ROLLBACK');console.error('Campaign transition failed',e);return fail('Kampagne konnte nicht geändert werden',500)}finally{tx.release()}
}

