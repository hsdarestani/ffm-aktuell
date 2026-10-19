import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const [media,businesses,grants]=await Promise.all([
  query("SELECT id,media_type,status,created_at FROM user_media WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",[u.id]),
  query("SELECT b.id,b.name FROM businesses b WHERE b.status='approved' AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published') ORDER BY b.name LIMIT 100"),
  query("SELECT g.id,g.media_id,g.business_id,b.name AS business_name,g.expires_at,g.revoked_at FROM media_right_grants g JOIN businesses b ON b.id=g.business_id WHERE g.owner_id=$1 ORDER BY g.created_at DESC LIMIT 100",[u.id])
 ]);
 return NextResponse.json({media:media.rows,businesses:businesses.rows,grants:grants.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const b=await req.json().catch(()=>null);
 if(b?.action==='revoke'){
  if(!uuid.test(b.id||''))return NextResponse.json({error:'ID fehlt'},{status:400});
  const r=await query("UPDATE media_right_grants SET revoked_at=now() WHERE id=$1 AND owner_id=$2 AND revoked_at IS NULL RETURNING id",[b.id,u.id]);
  return NextResponse.json({revoked:Boolean(r.rowCount)});
 }
 if(b?.action!=='grant'||!uuid.test(b.business_id||'')||!uuid.test(b.media_id||''))return NextResponse.json({error:'Ungültige Auswahl'},{status:400});
 const until=new Date(b.expires_at||'');
 if(!Number.isFinite(until.valueOf())||until.getTime()<Date.now()+86400000||until.getTime()>Date.now()+365*86400000)return NextResponse.json({error:'Freigabe muss zwischen 1 und 365 Tagen gültig sein'},{status:400});
 const r=await query("INSERT INTO media_right_grants(owner_id,business_id,media_id,expires_at) SELECT $1,b.id,m.id,$4::timestamptz FROM businesses b JOIN user_media m ON m.id=$3 AND m.owner_id=$1 AND m.status='approved' AND m.license_confirmed=true WHERE b.id=$2 AND b.status='approved' AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published') ON CONFLICT(owner_id,business_id,media_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,revoked_at=NULL RETURNING id",[u.id,b.business_id,b.media_id,until.toISOString()]);
 if(!r.rowCount)return NextResponse.json({error:'Rechte oder Geschäft nicht bestätigt'},{status:403});
 await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'media:granted','media_grant',$2)",[u.id,r.rows[0].id]);
 return NextResponse.json({id:r.rows[0].id,status:'granted'},{status:201});
}
