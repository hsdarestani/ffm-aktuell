import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Forbidden'},{status:403});
 const [stories,highlights]=await Promise.all([
  query("SELECT s.id,s.caption,s.created_at,m.media_type,m.id AS media_id,m.status AS media_status FROM stories s JOIN user_media m ON m.id=s.media_id WHERE s.status='pending' ORDER BY s.created_at LIMIT 60"),
  query("SELECT h.id,h.created_at,g.expires_at,g.revoked_at,m.status AS media_status,g.media_id,b.name AS business_name FROM business_highlights h JOIN media_right_grants g ON g.id=h.grant_id JOIN businesses b ON b.id=h.business_id JOIN user_media m ON m.id=g.media_id WHERE h.status='pending' ORDER BY h.created_at LIMIT 60")
 ]);
 return NextResponse.json({stories:stories.rows,highlights:highlights.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Forbidden'},{status:403});
 const b=await req.json().catch(()=>null);
 if(!uuid.test(b?.id||'')||!['story','highlight'].includes(b?.type)||typeof b.approve!=='boolean')return NextResponse.json({error:'Invalid input'},{status:400});
 const status=b.approve?'published':'rejected';
 const sql=b.type==='story'
  ?"UPDATE stories s SET status=$2,reviewed_by=$3,reviewed_at=now() FROM user_media m WHERE s.id=$1 AND s.status='pending' AND s.media_id=m.id AND s.expires_at>now() AND m.status='approved' RETURNING s.id"
  :"UPDATE business_highlights h SET status=$2,reviewed_by=$3,reviewed_at=now() FROM media_right_grants g JOIN user_media m ON m.id=g.media_id JOIN businesses b ON b.id=g.business_id WHERE h.id=$1 AND h.status='pending' AND h.grant_id=g.id AND h.business_id=b.id AND g.revoked_at IS NULL AND g.expires_at>now() AND m.status='approved' AND b.status='approved' RETURNING h.id";
 const r=await query(sql,[b.id,status,u.id]);
 if(!r.rowCount)return NextResponse.json({error:'Item not active or media approval required'},{status:409});
 await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",[u.id,b.type+':'+status,b.type,b.id]);
 return NextResponse.json({status});
}
