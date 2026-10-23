import {canAdmin} from '@/lib/admin-permissions';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';const denied=()=>NextResponse.json({error:'Forbidden'},{status:403});
export async function GET(req:NextRequest){const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return denied();const r=await query("SELECT m.id,m.media_type,m.size_bytes,m.created_at,LEFT(u.display_name,1) AS uploader FROM user_media m JOIN users u ON u.id=m.owner_id WHERE m.status='pending' ORDER BY m.created_at LIMIT 50");return NextResponse.json({items:r.rows});}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return denied();
 const u=await sessionUser(req);if(!u||!canAdmin(u,'moderation'))return denied();
 const data=await req.json().catch(()=>null);
 if(!data||!/^[0-9a-f-]{36}$/.test(data.id||'')||typeof data.approve!=='boolean')return NextResponse.json({error:'Invalid data'},{status:400});
 const status=data.approve?'approved':'rejected';
 const r=await query("UPDATE user_media SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' AND license_confirmed=true RETURNING id",[data.id,status,u.id]);
 if(!r.rowCount)return NextResponse.json({error:'Not pending'},{status:404});
 await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'media',$3)",[u.id,'media:'+status,data.id]);
 return NextResponse.json({status});
}

