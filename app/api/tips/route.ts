import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {pool,query} from '@/lib/db';
import {z} from 'zod';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const user=await sessionUser(req),admin=req.nextUrl.searchParams.get('scope')==='admin'&&canAdmin(user,'editorial');
 const items=await query(`SELECT t.id,t.place_id,t.title,t.body,t.publish_at,t.expires_at,t.published,p.name AS place_name,p.category,p.district FROM discovery_tips t JOIN places p ON p.id=t.place_id
 WHERE $1::boolean OR (t.published AND t.publish_at<=now() AND t.expires_at>now() AND p.status='published' AND p.verification_status='verified'
 AND p.activity_status='operating' AND p.verified_at BETWEEN now()-interval '30 days' AND now()) ORDER BY t.publish_at DESC LIMIT 60`,[admin]);
 const places=admin?(await query("SELECT id,name FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() ORDER BY name LIMIT 500")).rows:undefined;
 return NextResponse.json({items:items.rows,places},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(!canAdmin(u,'editorial')||!u)return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403});
 const d=await req.json().catch(()=>null);
 if(d?.action==='archive'&&z.uuid().safeParse(d.id).success){
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('UPDATE discovery_tips SET published=false WHERE id=$1',[d.id]);await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'tip:archived','tip',$2)",[u.id,d.id]);await tx.query('COMMIT');return NextResponse.json({ok:true})}catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Änderung fehlgeschlagen'},{status:500})}finally{tx.release()}
 }
 const p=z.object({place_id:z.uuid(),title:z.string().trim().min(4).max(150),body:z.string().trim().min(10).max(500),publish_at:z.iso.datetime(),expires_at:z.iso.datetime()}).safeParse(d);
 if(!p.success)return NextResponse.json({error:'Ort, Text und Zeitraum prüfen'},{status:400});
 const v=p.data,start=Date.parse(v.publish_at),end=Date.parse(v.expires_at);
 if(start<Date.now()-60000||start>Date.now()+30*86400000||end<=start||end-start>7*86400000)return NextResponse.json({error:'Bis 30 Tage voraus, höchstens sieben Tage Laufzeit'}, {status:400});
 const tx=await pool.connect();try{await tx.query('BEGIN');
  const place=await tx.query("SELECT id FROM places WHERE id=$1 AND status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() FOR SHARE",[v.place_id]);
  if(!place.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Nur aktuell unabhängig geprüfte Orte verwenden'}, {status:409})}
  const r=await tx.query('INSERT INTO discovery_tips(place_id,title,body,publish_at,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[v.place_id,v.title,v.body,v.publish_at,v.expires_at,u.id]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'tip:published','tip',$2)",[u.id,r.rows[0].id]);await tx.query('COMMIT');return NextResponse.json({id:r.rows[0].id},{status:201});
 }catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Tipp konnte nicht gespeichert werden'}, {status:500})}finally{tx.release()}
}
