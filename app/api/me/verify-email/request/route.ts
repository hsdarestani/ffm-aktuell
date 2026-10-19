import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomBytes} from 'node:crypto';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
import {deliveryConfigured,sendTransactionalMail} from '@/lib/email-delivery';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
 if(!deliveryConfigured())return NextResponse.json({error:'E-Mail Bestätigung momentan nicht eingerichtet'},{status:503});
 const state=await query('SELECT email_verified_at FROM users WHERE id=$1',[u.id]);
 if(state.rows[0]?.email_verified_at)return NextResponse.json({verified:true});
 const count=await query("SELECT count(*)::int AS n FROM email_verification_tokens WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[u.id]);
 if(count.rows[0].n>=3)return NextResponse.json({error:'Bitte später erneut versuchen'},{status:429});
 const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');
 await query("INSERT INTO email_verification_tokens(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '20 minutes')",[hash,u.id]);
 const url=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000')+'/?verify_email='+encodeURIComponent(token);
 try{
  await sendTransactionalMail(u.email,'E-Mail-Adresse für FFM Aktuell bestätigen',
   'Du hast die Bestätigung deiner E-Mail-Adresse in FFM Aktuell angefordert.\n\n'+url+'\n\nDer Link ist 20 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Nachricht.');
 }catch(e){await query('DELETE FROM email_verification_tokens WHERE token_hash=$1',[hash]);return NextResponse.json({error:e instanceof Error?e.message:'E-Mail Zustellung fehlgeschlagen'},{status:503})}
 return NextResponse.json({sent:true,notice:'Bestätigungslink verschickt, falls deine E-Mail erreichbar ist.'});
}
