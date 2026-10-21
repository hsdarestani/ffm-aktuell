import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const valid=/^[a-f0-9]{64}$/;
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return fail('Bitte anmelden',401);
 const token=req.nextUrl.searchParams.get('token')||'';
 if(!valid.test(token))return fail('Einladung ungültig');
 const hash=createHash('sha256').update(token).digest('hex');
 const r=await query("SELECT i.id,i.role,b.name AS business_name FROM business_team_invites i JOIN businesses b ON b.id=i.business_id JOIN users u ON lower(u.email)=lower(i.invite_email) WHERE i.token_hash=$1 AND u.id=$2 AND u.email_verified_at IS NOT NULL AND b.status='approved' AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()",[hash,u.id]);
 return r.rowCount?NextResponse.json({invite:r.rows[0]},{headers:{'Cache-Control':'private,no-store'}}):fail('Einladung ungültig, abgelaufen oder E-Mail noch nicht bestätigt',403);
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
 const u=await sessionUser(req);if(!u)return fail('Bitte anmelden',401);
 const d=await req.json().catch(()=>null);if(!valid.test(d?.token||''))return fail('Einladung ungültig');
 const hash=createHash('sha256').update(d.token).digest('hex'),tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const i=await tx.query("SELECT i.id,i.business_id,i.role,i.all_places,i.place_ids,i.invite_email,b.owner_id,b.status,b.team_seat_limit FROM business_team_invites i JOIN businesses b ON b.id=i.business_id WHERE i.token_hash=$1 AND i.redeemed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() FOR UPDATE OF b,i",[hash]);
  const inv=i.rows[0];
  if(!inv||inv.status!=='approved'||inv.owner_id===u.id){await tx.query('ROLLBACK');return fail('Einladung nicht gültig',403)}
  const person=await tx.query('SELECT email,email_verified_at FROM users WHERE id=$1',[u.id]);
  if(!person.rowCount||!person.rows[0].email_verified_at||person.rows[0].email.toLowerCase()!==inv.invite_email){
   await tx.query('ROLLBACK');return fail('Nur die Person mit bestätigter E-Mail darf annehmen',403);
  }
  const current=await tx.query('SELECT count(*)::int AS n FROM business_team_members WHERE business_id=$1',[inv.business_id]);
  if(current.rows[0].n>=inv.team_seat_limit){await tx.query('ROLLBACK');return fail('Alle Mitarbeiterplätze vergeben',409)}
  await tx.query("INSERT INTO business_team_members(business_id,user_id,role,all_places,place_ids) VALUES($1,$2,$3,$4,$5) ON CONFLICT(business_id,user_id) DO NOTHING",[inv.business_id,u.id,inv.role,inv.all_places,inv.place_ids]);
  await tx.query("UPDATE business_team_invites SET redeemed_at=now() WHERE id=$1",[inv.id]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'team:accepted','business',$2)",[u.id,inv.business_id]);
  await tx.query('COMMIT');return NextResponse.json({joined:true,role:inv.role});
 }catch(e){await tx.query('ROLLBACK');console.error('Team accept',e);return fail('Einladung konnte nicht angenommen werden',500)}
 finally{tx.release()}
}

