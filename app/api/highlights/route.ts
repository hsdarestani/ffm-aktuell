import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const business=req.nextUrl.searchParams.get('business_id')||'';
 if(!uuid.test(business))return NextResponse.json({items:[]});
 const r=await query("SELECT h.id,g.expires_at,m.media_type,'/api/media/'||m.id::text AS media_url FROM business_highlights h JOIN media_right_grants g ON g.id=h.grant_id JOIN user_media m ON m.id=g.media_id JOIN businesses b ON b.id=h.business_id WHERE h.business_id=$1 AND h.status='published' AND g.revoked_at IS NULL AND g.expires_at>now() AND m.status='approved' AND b.status='approved' ORDER BY h.created_at DESC LIMIT 30",[business]);
 return NextResponse.json({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const data=await req.json().catch(()=>null);
 if(!uuid.test(data?.grant_id||''))return NextResponse.json({error:'Ungültige Freigabe'},{status:400});
 const r=await query("INSERT INTO business_highlights(business_id,grant_id) SELECT b.id,g.id FROM businesses b JOIN media_right_grants g ON g.business_id=b.id AND g.id=$2 AND g.revoked_at IS NULL AND g.expires_at>now() JOIN user_media m ON m.id=g.media_id AND m.status='approved' WHERE b.owner_id=$1 AND b.status='approved' ON CONFLICT(business_id,grant_id) DO UPDATE SET status='pending' RETURNING id,status",[u.id,data.grant_id]);
 if(!r.rowCount)return NextResponse.json({error:'Nicht berechtigt oder Freigabe abgelaufen'},{status:403});
 return NextResponse.json({highlight:r.rows[0]},{status:201});
}
