import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const code=/^[\p{L}\p{N}][\p{L}\p{N} .&-]{1,69}$/u;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);
 const all=req.nextUrl.searchParams.get('include_inactive')==='1'&&u?.role==='admin';
 const r=await query("SELECT slug,label_de,label_en,parent_slug,active FROM catalog_categories WHERE active OR $1 ORDER BY COALESCE(parent_slug,slug),parent_slug NULLS FIRST,label_de",[all]);
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const data=await req.json().catch(()=>null);
 if(!data||!['save','status'].includes(data.action)||typeof data.slug!=='string'||!code.test(data.slug))return NextResponse.json({error:'Kategorie ungültig'},{status:400});
 if(data.action==='status'){
  if(typeof data.active!=='boolean')return NextResponse.json({error:'Status ungültig'},{status:400});
  const r=await query("UPDATE catalog_categories SET active=$2,updated_at=now() WHERE slug=$1 RETURNING slug,active",[data.slug,data.active]);
  if(!r.rowCount)return NextResponse.json({error:'Nicht gefunden'},{status:404});
  await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'category:status','category',$2)",[u.id,data.slug]);
  return NextResponse.json({item:r.rows[0]});
 }
 const de=typeof data.label_de==='string'?data.label_de.trim():'',en=typeof data.label_en==='string'?data.label_en.trim():'';
 const parentSlug=typeof data.parent_slug==='string'&&data.parent_slug.trim()?data.parent_slug.trim():null;
 if(de.length<2||de.length>100||en.length<2||en.length>100||parentSlug===data.slug)return NextResponse.json({error:'Name oder Überkategorie ungültig'},{status:400});
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  if(parentSlug){
   const p=await tx.query('SELECT slug,parent_slug FROM catalog_categories WHERE slug=$1 AND active=true FOR UPDATE',[parentSlug]);
   if(!p.rowCount||p.rows[0].parent_slug)return NextResponse.json({error:'Nur aktive Hauptkategorien als Eltern erlaubt'},{status:400});
   const children=await tx.query('SELECT 1 FROM catalog_categories WHERE parent_slug=$1 LIMIT 1',[data.slug]);
   if(children.rowCount)return NextResponse.json({error:'Eine Hauptkategorie mit Unterkategorien kann nicht verschachtelt werden'},{status:409});
  }
  const r=await tx.query("INSERT INTO catalog_categories(slug,label_de,label_en,parent_slug) VALUES($1,$2,$3,$4) ON CONFLICT(slug) DO UPDATE SET label_de=EXCLUDED.label_de,label_en=EXCLUDED.label_en,parent_slug=EXCLUDED.parent_slug,updated_at=now() RETURNING slug,label_de,label_en,parent_slug,active",[data.slug,de,en,parentSlug]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'category:save','category',$2)",[u.id,data.slug]);
  await tx.query('COMMIT');
  return NextResponse.json({item:r.rows[0]});
 }catch(e){await tx.query('ROLLBACK');console.error('Category save failed',e);return NextResponse.json({error:'Kategorie konnte nicht gespeichert werden'},{status:500})}
 finally{tx.release()}
}
