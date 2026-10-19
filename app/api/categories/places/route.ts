import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[0-9a-f-]{36}$/;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const q=(req.nextUrl.searchParams.get('q')||'').trim().slice(0,80);
 const r=await query("SELECT p.id,p.name,p.category,p.status,COALESCE((SELECT array_agg(pc.category_slug ORDER BY pc.category_slug) FROM place_categories pc WHERE pc.place_id=p.id),ARRAY[]::text[]) AS categories FROM places p WHERE $1='' OR p.name ILIKE '%'||$1||'%' OR p.address ILIKE '%'||$1||'%' ORDER BY p.name LIMIT 80",[q]);
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const data=await req.json().catch(()=>null);
 const ids=data?.categories;
 if(!uuid.test(data?.place_id||'')||!Array.isArray(ids)||ids.length<1||ids.length>8||ids.some((v:unknown)=>typeof v!=='string'||v.length>70)||new Set(ids).size!==ids.length)return NextResponse.json({error:'Ungültige Zuordnung'},{status:400});
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const p=await tx.query("SELECT id FROM places WHERE id=$1 FOR UPDATE",[data.place_id]);
  if(!p.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Ort nicht gefunden'},{status:404})}
  const valid=await tx.query('SELECT slug FROM catalog_categories WHERE slug=ANY($1::text[]) AND active',[ids]);
  if(valid.rowCount!==ids.length){await tx.query('ROLLBACK');return NextResponse.json({error:'Kategorie nicht aktiv'},{status:400})}
  await tx.query('DELETE FROM place_categories WHERE place_id=$1',[data.place_id]);
  await tx.query('INSERT INTO place_categories(place_id,category_slug) SELECT $1,unnest($2::text[])',[data.place_id,ids]);
  await tx.query("UPDATE places SET category=$2,updated_at=now() WHERE id=$1",[data.place_id,ids[0]]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'place:categories','place',$2)",[u.id,data.place_id]);
  await tx.query('COMMIT');
  return NextResponse.json({success:true,categories:ids});
 }catch(e){await tx.query('ROLLBACK');console.error('Category assignment failed',e);return NextResponse.json({error:'Zuordnung konnte nicht gespeichert werden'},{status:500})}
 finally{tx.release()}
}
