import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {resolveBusinessEditor} from '@/lib/business-team';
import {pool,query} from '@/lib/db';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const actor=await sessionUser(req);if(!actor)return reply({error:'Anmeldung erforderlich'},401);
 if(req.nextUrl.searchParams.get('scope')==='moderation'){
  if(!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
  const r=await query("SELECT a.id,a.body,r.body AS review_body,r.rating,b.name AS business_name FROM venue_review_replies a JOIN venue_reviews r ON r.id=a.review_id JOIN businesses b ON b.id=a.business_id WHERE a.status='pending' ORDER BY a.created_at LIMIT 60");return reply({items:r.rows});
 }
 const r=await query(`SELECT r.id,r.rating,r.body,p.name AS place_name,a.body AS reply_body,a.status AS reply_status
 FROM venue_reviews r JOIN places p ON p.id=r.place_id JOIN businesses b ON b.id=p.business_id
 LEFT JOIN venue_review_replies a ON a.review_id=r.id LEFT JOIN business_team_members tm ON tm.business_id=b.id AND tm.user_id=$1
 WHERE r.status='published' AND p.status='published' AND b.status='approved'
 AND (b.owner_id=$1 OR (tm.role='editor' AND business_staff_allowed(b.id,$1) AND (tm.all_places OR p.id=ANY(tm.place_ids))))
 ORDER BY r.created_at DESC LIMIT 60`,[actor.id]);return reply({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const actor=await sessionUser(req);if(!actor)return reply({error:'Anmeldung erforderlich'},401);
 const parsed=z.object({action:z.enum(['save','remove','moderate']),id:z.uuid(),body:z.string().trim().min(20).max(1000).optional(),approve:z.boolean().optional()}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Antwort prüfen'},400);const d=parsed.data;
 const tx=await pool.connect();try{await tx.query('BEGIN');
  if(d.action==='moderate'){
   if(!canAdmin(actor,'moderation')){await tx.query('ROLLBACK');return reply({error:'Keine Berechtigung'},403)}
   if(typeof d.approve!=='boolean'){await tx.query('ROLLBACK');return reply({error:'Entscheidung fehlt'},400)}
   const r=await tx.query("UPDATE venue_review_replies a SET status=$2,reviewed_by=$3,reviewed_at=now() FROM venue_reviews r JOIN places p ON p.id=r.place_id JOIN businesses b ON b.id=p.business_id WHERE a.id=$1 AND a.review_id=r.id AND a.business_id=b.id AND a.status='pending' AND (NOT $4 OR (r.status='published' AND p.status='published' AND b.status='approved' AND a.review_version=md5(r.rating::text||':'||r.body))) RETURNING a.id",[d.id,d.approve?'published':'rejected',actor.id,d.approve]);
   if(!r.rowCount){await tx.query('ROLLBACK');return reply({error:'Antwort nicht mehr freigabefähig'},409)}
  }else{
   const found=await tx.query("SELECT r.place_id,b.id AS business_id FROM venue_reviews r JOIN places p ON p.id=r.place_id JOIN businesses b ON b.id=p.business_id WHERE r.id=$1 AND r.status='published' AND p.status='published' AND b.status='approved' FOR UPDATE OF r",[d.id]);
   const review=found.rows[0],editor=review?await resolveBusinessEditor(actor,review.place_id):null;
   if(!review||editor?.id!==review.business_id){await tx.query('ROLLBACK');return reply({error:'Keine Berechtigung für diese Bewertung'},403)}
   if(d.action==='save'){
    if(!d.body){await tx.query('ROLLBACK');return reply({error:'Antwort fehlt'},400)}
    await tx.query("INSERT INTO venue_review_replies(review_id,business_id,body,created_by,review_version) SELECT id,$2,$3,$4,md5(rating::text||':'||body) FROM venue_reviews WHERE id=$1 ON CONFLICT(review_id) DO UPDATE SET review_version=excluded.review_version,business_id=excluded.business_id,body=excluded.body,created_by=excluded.created_by,status='pending',reviewed_at=NULL,reviewed_by=NULL",[d.id,review.business_id,d.body,actor.id]);
   }else await tx.query("DELETE FROM venue_review_replies WHERE review_id=$1 AND business_id=$2",[d.id,review.business_id]);
  }
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'review_reply',$3)",[actor.id,'reply:'+d.action+(d.action==='moderate'?':'+String(d.approve):''),d.id]);
  await tx.query('COMMIT');return reply({success:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Antwort konnte nicht gespeichert werden'},500)}finally{tx.release()}
}
