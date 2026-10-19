import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool} from '@/lib/db';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte zuerst mit dem richtigen Konto anmelden'},{status:401});
 const data=await req.json().catch(()=>null);if(typeof data?.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))return NextResponse.json({error:'Bestätigungscode ungültig'},{status:400});
 const hash=createHash('sha256').update(data.token).digest('hex'),tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const t=await tx.query("SELECT token_hash FROM email_verification_tokens WHERE token_hash=$1 AND user_id=$2 AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE",[hash,u.id]);
  if(!t.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Code abgelaufen, fremd oder bereits verwendet'},{status:409})}
  await tx.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1',[u.id]);
  await tx.query('UPDATE email_verification_tokens SET redeemed_at=now() WHERE token_hash=$1',[hash]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'email:verified','user',$1)",[u.id]);
  await tx.query('COMMIT');return NextResponse.json({verified:true});
 }catch(e){await tx.query('ROLLBACK');console.error('Verify email',e);return NextResponse.json({error:'Bestätigung fehlgeschlagen'},{status:500})}
 finally{tx.release()}
}
