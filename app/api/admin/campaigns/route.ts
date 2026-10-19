import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[0-9a-f-]{36}$/;
const error=(e:string,status=400)=>NextResponse.json({error:e},{status});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return error('Admin erforderlich',403);
 const r=await query("SELECT c.id,c.title,c.copy_de,c.placement,c.start_date,c.end_date,c.status,c.rejection_note,c.created_at,b.name AS business_name,p.name AS place_name FROM ad_campaigns c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id ORDER BY CASE WHEN c.status='pending_review' THEN 0 ELSE 1 END,c.created_at DESC LIMIT 120");
 return NextResponse.json({items:r.rows,payment_enabled:false,advertising_enabled:false},{headers:{'Cache-Control':'private,no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return error('Ungültige Anfrage',403);
 const u=await sessionUser(req);if(u?.role!=='admin')return error('Admin erforderlich',403);
 const data=await req.json().catch(()=>null);
 if(!uuid.test(data?.id||'')||typeof data.approve!=='boolean')return error('Prüfentscheidung ungültig');
 const note=typeof data.note==='string'?data.note.trim():'';
 if(note.length>1200||(!data.approve&&note.length<10))return error('Ablehnungsgrund erforderlich (mindestens 10 Zeichen)');
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const r=await tx.query("UPDATE ad_campaigns SET status=$2,rejection_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE id=$1 AND status='pending_review' RETURNING id,status",[data.id,data.approve?'awaiting_commercial_setup':'rejected',data.approve?null:note,u.id]);
  if(!r.rowCount){await tx.query('ROLLBACK');return error('Kampagne nicht mehr offen',409)}
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'ad_campaign',$3)",[u.id,data.approve?'ad:editorially-approved-pending-pricing':'ad:rejected',data.id]);
  await tx.query('COMMIT');
  return NextResponse.json({item:r.rows[0],notice:data.approve?'Inhalt geprüft. Preis und Zahlung fehlen; Kampagne bleibt unsichtbar.':'Abgelehnt und protokolliert.'});
 }catch(e){await tx.query('ROLLBACK');console.error('Review campaigns',e);return error('Überprüfung fehlgeschlagen',500)}finally{tx.release()}
}
