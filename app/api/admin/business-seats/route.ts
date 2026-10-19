import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[a-f0-9-]{36}$/;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const r=await query("SELECT b.id,b.name,b.status,b.team_seat_limit,(SELECT count(*)::int FROM business_team_members tm WHERE tm.business_id=b.id) AS used_seats FROM businesses b WHERE b.status='approved' ORDER BY b.created_at DESC LIMIT 100");
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'private,no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const d=await req.json().catch(()=>null);
 const note=typeof d?.reason==='string'?d.reason.trim():'';
 if(!uuid.test(d?.business_id||'')||!Number.isInteger(d.seats)||d.seats<0||d.seats>50||note.length<20||note.length>700||d.terms_approved!==true)
  return NextResponse.json({error:'Genehmigte Bedingungen, 20 Zeichen Begründung und 0 bis 50 Plätze erforderlich'},{status:400});
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const b=await tx.query("SELECT id FROM businesses WHERE id=$1 AND status='approved' FOR UPDATE",[d.business_id]);
  if(!b.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Unternehmen nicht freigegeben'},{status:404})}
  const reserved=await tx.query("SELECT (SELECT count(*)::int FROM business_team_members WHERE business_id=$1)+(SELECT count(*)::int FROM business_team_invites WHERE business_id=$1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now()) AS used",[d.business_id]);
  if(d.seats<reserved.rows[0].used){await tx.query('ROLLBACK');return NextResponse.json({error:'Zuerst bestehende Zugänge und Einladungen reduzieren'},{status:409})}
  await tx.query('UPDATE businesses SET team_seat_limit=$2 WHERE id=$1',[d.business_id,d.seats]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'business',$3)",[u.id,'team:seat-limit '+String(d.seats)+' '+note,d.business_id]);
  await tx.query('COMMIT');return NextResponse.json({updated:true,seats:d.seats});
 }catch(e){await tx.query('ROLLBACK');console.error('Admin seats',e);return NextResponse.json({error:'Mitarbeiterplätze konnten nicht geändert werden'},{status:500})}finally{tx.release()}
}
