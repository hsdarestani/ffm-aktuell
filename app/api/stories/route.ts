import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const r=await query("SELECT s.id,s.caption,s.expires_at,m.media_type,'/api/media/'||m.id::text AS media_url FROM stories s JOIN user_media m ON m.id=s.media_id WHERE s.status='published' AND s.expires_at>now() AND m.status='approved' ORDER BY s.created_at DESC LIMIT 35");
 return NextResponse.json({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const b=await req.json().catch(()=>null);
 if(!b||!['create','remove'].includes(b.action))return NextResponse.json({error:'Ungültige Aktion'},{status:400});
 if(b.action==='remove'){
  if(!uuid.test(b.id||''))return NextResponse.json({error:'ID fehlt'},{status:400});
  const r=await query("UPDATE stories SET status='removed' WHERE id=$1 AND owner_id=$2 AND status IN ('pending','published') RETURNING id",[b.id,u.id]);
  return NextResponse.json({removed:Boolean(r.rowCount)});
 }
 if(!uuid.test(b.media_id||'')||typeof b.caption!=='string'||b.caption.length>280)return NextResponse.json({error:'Ungültiges Medium'},{status:400});
 const count=await query("SELECT count(*)::int AS n FROM stories WHERE owner_id=$1 AND created_at>now()-interval '1 day'",[u.id]);
 if(count.rows[0].n>=8)return NextResponse.json({error:'Tageslimit erreicht'},{status:429});
 const r=await query("INSERT INTO stories(owner_id,media_id,caption) SELECT $1,id,$3 FROM user_media WHERE id=$2 AND owner_id=$1 AND license_confirmed=true AND status IN ('pending','approved') RETURNING id,status,expires_at",[u.id,b.media_id,b.caption]);
 if(!r.rowCount)return NextResponse.json({error:'Medium nicht verfügbar'},{status:403});
 return NextResponse.json({story:r.rows[0],notice:'Story wartet auf redaktionelle Freigabe.'},{status:201});
}
