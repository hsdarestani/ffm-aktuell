import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {load} from '@/lib/media-storage';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return new NextResponse(null,{status:404});
 const u=await sessionUser(req);
 const r=await query('SELECT * FROM user_media WHERE id=$1',[id]);const m=r.rows[0];
 if(!m)return new NextResponse(null,{status:404});
 if(u?.id!==m.owner_id&&u?.role!=='admin'){
  if(m.status!=='approved')return new NextResponse(null,{status:404});
  // The owner of a business with explicit current permission may preview
  // the medium prior to editorial Highlight approval, but the general public cannot.
  const visible=await query("SELECT (EXISTS(SELECT 1 FROM posts WHERE media_id=$1 AND status='published') OR EXISTS(SELECT 1 FROM stories WHERE media_id=$1 AND status='published' AND expires_at>now()) OR EXISTS(SELECT 1 FROM business_highlights h JOIN media_right_grants g ON g.id=h.grant_id WHERE g.media_id=$1 AND h.status='published' AND g.revoked_at IS NULL AND g.expires_at>now()) OR EXISTS(SELECT 1 FROM media_right_grants g JOIN businesses b ON b.id=g.business_id WHERE g.media_id=$1 AND b.owner_id=$2 AND b.status='approved' AND g.revoked_at IS NULL AND g.expires_at>now())) AS allowed",[id,u?.id||null]);
  if(!visible.rows[0].allowed)return new NextResponse(null,{status:404});
 }
 try{
  const bytes=await load(m.storage_key);
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':m.media_type,'Content-Length':String(bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new NextResponse(null,{status:404})}
}
