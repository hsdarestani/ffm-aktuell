import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {resolveBusinessEditor} from '@/lib/business-team';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const business=req.nextUrl?.searchParams.get('business_id');
 if(business){
  if(!uuid.test(business))return NextResponse.json({error:'Ungültiges Unternehmen'},{status:400});
  const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
  const owner=await query('SELECT id FROM businesses WHERE id=$1 AND owner_id=$2',[business,u.id]);
  if(!owner.rowCount)return NextResponse.json({error:'Keine Berechtigung'},{status:403});
  const own=await query("SELECT id,caption,status,expires_at FROM stories WHERE business_id=$1 AND status!='removed' ORDER BY created_at DESC LIMIT 50",[business]);
  return NextResponse.json({items:own.rows},{headers:{'Cache-Control':'private,no-store'}});
 }
 const r=await query("SELECT s.id,s.caption,s.expires_at,b.name AS business_name,p.name AS place_name,m.media_type,'/api/media/'||m.id::text AS media_url FROM stories s JOIN user_media m ON m.id=s.media_id LEFT JOIN businesses b ON b.id=s.business_id LEFT JOIN places p ON p.id=s.place_id WHERE s.status='published' AND s.expires_at>now() AND m.status='approved' AND (s.business_id IS NULL OR business_story_access(s.business_id,s.place_id)) ORDER BY s.created_at DESC LIMIT 35");
 return NextResponse.json({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const b=await req.json().catch(()=>null);
 if(!b||!['create','remove'].includes(b.action))return NextResponse.json({error:'Ungültige Aktion'},{status:400});
 if(b.action==='remove'){
  if(!uuid.test(b.id||''))return NextResponse.json({error:'ID fehlt'},{status:400});
  const r=await query("UPDATE stories SET status='removed' WHERE id=$1 AND (owner_id=$2 OR EXISTS(SELECT 1 FROM businesses b WHERE b.id=stories.business_id AND b.owner_id=$2)) AND status IN ('pending','published') RETURNING id",[b.id,u.id]);
  return NextResponse.json({removed:Boolean(r.rowCount)});
 }
 if(!uuid.test(b.media_id||'')||typeof b.caption!=='string'||b.caption.length>280)return NextResponse.json({error:'Ungültiges Medium'},{status:400});
 let businessId:string|null=null,placeId:string|null=null;
 if(b.business_id||b.place_id){
  if(!uuid.test(b.business_id||'')||!uuid.test(b.place_id||''))return NextResponse.json({error:'Unternehmen und Standort erforderlich'},{status:400});
  const editor=await resolveBusinessEditor(u,b.place_id);
  if(!editor||editor.id!==b.business_id||editor.status!=='approved')return NextResponse.json({error:'Standort nicht berechtigt'},{status:403});
  businessId=editor.id;placeId=b.place_id;
 }
 const count=await query("SELECT count(*)::int AS n FROM stories WHERE owner_id=$1 AND created_at>now()-interval '1 day'",[u.id]);
 if(count.rows[0].n>=8)return NextResponse.json({error:'Tageslimit erreicht'},{status:429});
 const r=await query("INSERT INTO stories(owner_id,media_id,caption,business_id,place_id) SELECT $1,id,$3,$4::uuid,$5::uuid FROM user_media WHERE id=$2 AND owner_id=$1 AND license_confirmed=true AND status IN ('pending','approved') AND ($4::uuid IS NULL OR business_story_access($4::uuid,$5::uuid)) RETURNING id,status,expires_at",[u.id,b.media_id,b.caption,businessId,placeId]);
 if(!r.rowCount)return NextResponse.json({error:'Medium nicht verfügbar'},{status:403});
 return NextResponse.json({story:r.rows[0],notice:'Story wartet auf redaktionelle Freigabe.'},{status:201});
}

