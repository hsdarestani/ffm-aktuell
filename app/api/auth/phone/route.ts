import {createHash,randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {pool,query} from '@/lib/db';
import {sessionUser,trustedOrigin,isRecentlyAuthenticated,beginSession} from '@/lib/auth';
import {phoneConfigured,phoneAllowed,normalizePhone,verifyPhone} from '@/lib/phone-provider';
export const dynamic='force-dynamic';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){const u=await sessionUser(req);const linked=u?(await query('SELECT phone FROM phone_identities WHERE user_id=$1',[u.id])).rows[0]?.phone:null;return reply({configured:phoneConfigured(),phone:linked?linked.slice(0,3)+' ••• '+linked.slice(-3):null})}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const d=await req.json().catch(()=>null),u=await sessionUser(req);
 if(!d||!['start','check','unlink'].includes(d.action))return reply({error:'Aktion ungültig'},400);
 if(d.action==='unlink'){
  if(!u||!await isRecentlyAuthenticated(req,u.id))return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403);
  await query('DELETE FROM phone_identities WHERE user_id=$1',[u.id]);await query("UPDATE phone_challenges SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",[u.id]);return reply({success:true});
 }
 if(!phoneConfigured())return reply({error:'Telefonanmeldung noch nicht eingerichtet'},503);
 const tx=await pool.connect();
 try{await tx.query('BEGIN');
  if(d.action==='start'){
   const phone=normalizePhone(d.phone),purpose=u?'link':'login';
   if(!phone||!phoneAllowed(phone)||d.consent!==true){await tx.query('ROLLBACK');return reply({error:'Erlaubte internationale Nummer und Zustimmung zur einmaligen SMS erforderlich.'},400)}
   if(u&&!await isRecentlyAuthenticated(req,u.id)){await tx.query('ROLLBACK');return reply({error:'Bitte zuerst erneut mit Passwort oder Google/Apple anmelden.'},403)}
   // A global lock serializes the cost ceiling as well as per-phone limits across processes.
   await tx.query("SELECT pg_advisory_xact_lock(hashtext('ffm-phone-send'))");
   const ip=hash(req.headers.get('x-real-ip')||'unknown');
   const limits=(await tx.query(`SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS daily,
    count(*) FILTER(WHERE created_at>now()-interval '1 hour' AND (phone=$1 OR ip_hash=$2))::int AS hourly,
    count(*) FILTER(WHERE created_at>now()-interval '60 seconds' AND phone=$1)::int AS recent FROM phone_challenges WHERE created_at>now()-interval '24 hours'`,[phone,ip])).rows[0];
   const ceiling=Math.max(1,Math.min(1000,Number(process.env.FFM_PHONE_DAILY_LIMIT)||100));
   if(limits.daily>=ceiling||limits.hourly>=5||limits.recent){await tx.query('ROLLBACK');return reply({error:'SMS Limit erreicht. Bitte später erneut versuchen.'},429)}
   await tx.query("DELETE FROM phone_challenges WHERE created_at<now()-interval '2 days'");
   const token=randomBytes(32).toString('hex');
   const row=(await tx.query("INSERT INTO phone_challenges(token_hash,phone,user_id,purpose,ip_hash) VALUES($1,$2,$3,$4,$5) RETURNING id",[hash(token),phone,u?.id||null,purpose,ip])).rows[0];
   // Persist the send reservation before contacting the provider; failures still consume abuse budget.
   await tx.query('COMMIT');
   let verification;try{verification=await verifyPhone(phone)}catch{return reply({error:'SMS konnte nicht gesendet werden. Bitte später erneut versuchen.'},503)}
   if(!verification.pending)return reply({error:'SMS konnte nicht gestartet werden.'},503);
   await query('UPDATE phone_challenges SET provider_sid=$2 WHERE id=$1',[row.id,verification.sid]);
   const res=reply({success:true,expires_in:600});res.cookies.set('ffm_phone',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:600});return res;
  }
  const token=req.cookies.get('ffm_phone')?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token)||!/^\d{4,10}$/.test(d.code||'')){await tx.query('ROLLBACK');return reply({error:'Code ungültig'},400)}
  const c=(await tx.query("SELECT * FROM phone_challenges WHERE token_hash=$1 FOR UPDATE",[hash(token)])).rows[0];
  if(!c||c.used_at||new Date(c.expires_at).getTime()<=Date.now()||c.attempts>=5||!c.provider_sid||(c.purpose==='link'&&(!u||u.id!==c.user_id))||(c.purpose==='login'&&u)){await tx.query('ROLLBACK');return reply({error:'Anfrage abgelaufen oder ungültig'},409)}
  await tx.query('UPDATE phone_challenges SET attempts=attempts+1 WHERE id=$1',[c.id]);
  let checked;try{checked=await verifyPhone(c.phone,String(d.code),c.provider_sid)}catch{await tx.query('COMMIT');return reply({error:'Code konnte nicht geprüft werden.'},503)}
  if(!checked.approved){await tx.query('COMMIT');return reply({error:'Code nicht bestätigt'},400)}
  await tx.query('UPDATE phone_challenges SET used_at=now() WHERE id=$1',[c.id]);
  if(c.purpose==='link'){
   if(!u||!await isRecentlyAuthenticated(req,u.id)){await tx.query('COMMIT');return reply({error:'Bitte erneut mit Passwort oder Google/Apple anmelden.'},403)}
   await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
   const existing=await tx.query('SELECT user_id FROM phone_identities WHERE phone=$1',[c.phone]);
   if(existing.rowCount&&existing.rows[0].user_id!==u.id){await tx.query('COMMIT');return reply({error:'Nummer kann nicht verknüpft werden.'},409)}
   await tx.query('DELETE FROM phone_identities WHERE user_id=$1',[u.id]);const added=await tx.query('INSERT INTO phone_identities(phone,user_id) VALUES($1,$2) ON CONFLICT(phone) DO NOTHING RETURNING user_id',[c.phone,u.id]);if(!added.rowCount){await tx.query('ROLLBACK');return reply({error:'Nummer kann nicht verknüpft werden.'},409)}
   await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'phone:linked','user',$2)",[u.id,u.id]);await tx.query('COMMIT');return reply({success:true});
  }
  const account=(await tx.query(`SELECT u.id FROM phone_identities p JOIN users u ON u.id=p.user_id WHERE p.phone=$1 AND u.role<>'admin'
   AND NOT EXISTS(SELECT 1 FROM admin_role_assignments WHERE user_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM businesses WHERE owner_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM business_team_members WHERE user_id=u.id)`,[c.phone])).rows[0];
  await tx.query('COMMIT');
  if(!account)return reply({error:'Bitte mit Passwort oder Google/Apple anmelden. Telefonzugang vorher im Profil verknüpfen.'},403);
  const res=reply({success:true});await beginSession(account.id,res);
  // SMS alone is insufficient for account deletion, billing/role changes or linking another identity.
  const sessionToken=res.cookies.get('ffm_session')?.value;if(sessionToken)await query("UPDATE sessions SET authenticated_at=now()-interval '1 day' WHERE token_hash=$1",[hash(sessionToken)]);
  res.cookies.set('ffm_phone','',{path:'/',maxAge:0});return res;
 }catch{await tx.query('ROLLBACK').catch(()=>{});return reply({error:'Telefonanmeldung derzeit nicht möglich'},503)}finally{tx.release()}
}
