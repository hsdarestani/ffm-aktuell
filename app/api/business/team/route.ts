import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomBytes} from 'node:crypto';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {deliveryConfigured,sendTransactionalMail} from '@/lib/email-delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[a-f0-9-]{36}$/,emailPattern=/^[^@\s]{1,64}@[^@\s]{1,180}\.[^@\s]{2,}$/;
const err=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return err('Anmeldung erforderlich',401);
 const owned=await query("SELECT id,name,status,team_seat_limit FROM businesses WHERE owner_id=$1 ORDER BY created_at LIMIT 1",[u.id]);
 const b=owned.rows[0];if(!b)return NextResponse.json({business:null,members:[],invites:[]});
 const [members,invites,places]=await Promise.all([
  query("SELECT tm.user_id,tm.role,tm.all_places,tm.place_ids,tm.joined_at,u.email,u.display_name FROM business_team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.business_id=$1 ORDER BY tm.joined_at",[b.id]),
  query("SELECT id,invite_email,role,all_places,place_ids,expires_at,created_at FROM business_team_invites WHERE business_id=$1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC",[b.id]),
  query("SELECT id,name FROM places WHERE business_id=$1 ORDER BY name",[b.id])
 ]);
 return NextResponse.json({business:b,members:members.rows,invites:invites.rows,places:places.rows,mail_enabled:deliveryConfigured()},{headers:{'Cache-Control':'private,no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return err('Ungültige Herkunft',403);
 const u=await sessionUser(req);if(!u)return err('Anmeldung erforderlich',401);
 const d=await req.json().catch(()=>null);
 if(!d||!['invite','revoke','remove','role','scope'].includes(d.action))return err('Unbekannte Teamaktion');
 const tx=await pool.connect();let mailed:{to:string,token:string,inviteId:string,businessName:string}|null=null;
 try{
  await tx.query('BEGIN');
  const owned=await tx.query("SELECT id,name,status,team_seat_limit FROM businesses WHERE owner_id=$1 ORDER BY created_at LIMIT 1 FOR UPDATE",[u.id]);
  const b=owned.rows[0];if(!b||b.status!=='approved'){await tx.query('ROLLBACK');return err('Unternehmen noch nicht freigegeben',403)}
  let allPlaces=true,placeIds:string[]=[];
  if(d.action==='invite'||d.action==='scope'){
   allPlaces=d.all_places!==false;
   placeIds=Array.isArray(d.place_ids)?[...new Set(d.place_ids)] as string[]:[];
   if(placeIds.length>100||placeIds.some(v=>typeof v!=='string'||!uuid.test(v))||!allPlaces&&!placeIds.length){await tx.query('ROLLBACK');return err('Mindestens einen gültigen Standort wählen')}
   const valid=await tx.query('SELECT id FROM places WHERE business_id=$1 AND id=ANY($2::uuid[])',[b.id,placeIds]);
   if(valid.rowCount!==placeIds.length){await tx.query('ROLLBACK');return err('Standort gehört nicht zu diesem Unternehmen',403)}
  }
  if(d.action==='invite'){
   if(!deliveryConfigured()){await tx.query('ROLLBACK');return err('Einladung per E-Mail ist noch nicht eingerichtet',503)}
   const to=typeof d.email==='string'?d.email.trim().toLowerCase():'';
   if(!emailPattern.test(to)||to===u.email.toLowerCase()||!['viewer','editor'].includes(d.role)){await tx.query('ROLLBACK');return err('E-Mail oder Rolle ungültig')}
   const members=await tx.query("SELECT count(*)::int AS n FROM business_team_members WHERE business_id=$1",[b.id]);
   const pending=await tx.query("SELECT count(*)::int AS n FROM business_team_invites WHERE business_id=$1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now()",[b.id]);
   if(members.rows[0].n+pending.rows[0].n>=b.team_seat_limit){await tx.query('ROLLBACK');return err('Keine freigegebenen Mitarbeiterplätze verfügbar',409)}
   const existing=await tx.query("SELECT id FROM business_team_invites WHERE business_id=$1 AND invite_email=$2 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at>now() LIMIT 1",[b.id,to]);
   if(existing.rowCount){await tx.query('ROLLBACK');return err('Einladung für diese E-Mail bereits offen',409)}
   const already=await tx.query("SELECT 1 FROM business_team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.business_id=$1 AND lower(u.email)=$2",[b.id,to]);
   if(already.rowCount){await tx.query('ROLLBACK');return err('Die Person ist bereits im Team',409)}
   const token=randomBytes(32).toString('hex');
   const hash=createHash('sha256').update(token).digest('hex');
   const inv=await tx.query("INSERT INTO business_team_invites(business_id,inviter_id,invite_email,role,token_hash,all_places,place_ids,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days') RETURNING id",[b.id,u.id,to,d.role,hash,allPlaces,allPlaces?[]:placeIds]);
   mailed={to,token,inviteId:inv.rows[0].id,businessName:b.name};
  }else if(d.action==='revoke'){
   if(!uuid.test(d.id||'')){await tx.query('ROLLBACK');return err('Einladung ungültig')}
   const r=await tx.query("UPDATE business_team_invites SET revoked_at=now() WHERE id=$1 AND business_id=$2 AND redeemed_at IS NULL AND revoked_at IS NULL RETURNING id",[d.id,b.id]);
   if(!r.rowCount){await tx.query('ROLLBACK');return err('Einladung nicht offen',404)}
  }else{
   if(!uuid.test(d.user_id||'')){await tx.query('ROLLBACK');return err('Person ungültig')}
   if(d.action==='scope'){
    const r=await tx.query('UPDATE business_team_members SET all_places=$3,place_ids=$4 WHERE business_id=$1 AND user_id=$2 RETURNING user_id',[b.id,d.user_id,allPlaces,allPlaces?[]:placeIds]);
    if(!r.rowCount){await tx.query('ROLLBACK');return err('Person nicht gefunden',404)}
   }else if(d.action==='remove'){
    const r=await tx.query("DELETE FROM business_team_members WHERE business_id=$1 AND user_id=$2 RETURNING user_id",[b.id,d.user_id]);
    if(!r.rowCount){await tx.query('ROLLBACK');return err('Person nicht gefunden',404)}
   }else{
    if(!['viewer','editor'].includes(d.role)){await tx.query('ROLLBACK');return err('Rolle ungültig')}
    const r=await tx.query("UPDATE business_team_members SET role=$3 WHERE business_id=$1 AND user_id=$2 RETURNING user_id",[b.id,d.user_id,d.role]);
    if(!r.rowCount){await tx.query('ROLLBACK');return err('Person nicht gefunden',404)}
   }
  }
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'business',$3)",[u.id,'team:'+d.action,b.id]);
  await tx.query('COMMIT');
 }catch(e){await tx.query('ROLLBACK');console.error('Business team management',e);return err('Teamaktion konnte nicht gespeichert werden',500)}
 finally{tx.release()}
 if(mailed){
  const m=mailed;const link=(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000')+'/?team_invite='+encodeURIComponent(m.token);
  try{await sendTransactionalMail(m.to,'Einladung ins FFM Aktuell Unternehmensteam',
   'Du wurdest eingeladen, bei '+m.businessName+' in FFM Aktuell mitzuarbeiten.\n\n'+link+'\n\nMelde dich mit genau dieser E-Mail-Adresse an und bestätige die Adresse, bevor du die Einladung annimmst. Der Link gilt sieben Tage.');}
  catch(e){await query("UPDATE business_team_invites SET revoked_at=now() WHERE id=$1",[m.inviteId]);return err(e instanceof Error?e.message:'Einladung konnte nicht versendet werden',503)}
 }
 return NextResponse.json({success:true,notice:mailed?'Einladung per E-Mail versendet.':'Team aktualisiert.'});
}

