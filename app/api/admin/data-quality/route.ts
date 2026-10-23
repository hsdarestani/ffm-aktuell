import {canAdmin} from '@/lib/admin-permissions';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const rejected=()=>NextResponse.json({error:'Admin erforderlich'},{status:403,headers:{'Cache-Control':'no-store'}});
const fail=(error:string)=>NextResponse.json({error},{status:400,headers:{'Cache-Control':'no-store'}});
const blank=(field:string)=>"nullif(btrim(coalesce("+field+",'')),'') IS NULL";
const nearbyDuplicate=`EXISTS (
 SELECT 1 FROM discovery_candidates d
 WHERE d.osm_id<>c.osm_id AND lower(btrim(d.name))=lower(btrim(c.name))
 AND abs(d.latitude-c.latitude)<0.00045 AND abs(d.longitude-c.longitude)<0.00065
 AND d.reviewed_status!='hidden'
 ) OR EXISTS (
 SELECT 1 FROM places p WHERE p.status='published' AND
 (p.osm_id=c.osm_id OR (lower(btrim(p.name))=lower(btrim(c.name))
 AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
 AND abs(p.latitude-c.latitude)<0.00045 AND abs(p.longitude-c.longitude)<0.00065))
 )`;
const flagged=`WITH flags AS (
 SELECT c.osm_id,c.name,c.category,c.address,c.website,c.phone,c.opening_hours,
 c.last_osm_check,c.osm_url,c.reviewed_status,c.latitude,c.longitude,
 (${nearbyDuplicate}) AS possible_duplicate,
 (${blank('c.address')} OR
   (${blank('c.website')} AND ${blank('c.phone')}) OR
   ${blank('c.opening_hours')}) AS missing_details,
 (${blank('c.address')}) AS missing_address,
 (${blank('c.website')} AND ${blank('c.phone')}) AS missing_contact,
 (${blank('c.opening_hours')}) AS missing_hours
 FROM discovery_candidates c WHERE c.reviewed_status IN ('unverified','needs_review')
)`;
const scopes=['all','duplicate','incomplete','review'] as const;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return rejected();
 const q=req.nextUrl.searchParams;
 const scope=q.get('scope')||'candidates';
 const kind=q.get('kind')||'all';
 const rawPage=Number(q.get('page')||0);
 if(!['candidates','editorial'].includes(scope)||!scopes.includes(kind as typeof scopes[number])||
  !Number.isInteger(rawPage)||rawPage<0||rawPage>200)return fail('Ungültiger Filter');
 const term=(q.get('q')||'').trim();
 if(term.length>90)return fail('Suche zu lang');
 const offset=rawPage*20;
 try{
  if(scope==='editorial'){
   const conditions=`status='published' AND (
     verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days'
     OR ${blank('verification_source')} OR ${blank('image_url')} OR
     ${blank('opening_hours_text')} OR ${blank('address')}
   ) AND ($1::text='' OR name ILIKE '%'||$1||'%' OR address ILIKE '%'||$1||'%')`;
   const [rows,count]=await Promise.all([
    query(`SELECT id,name,category,district,address,image_url,source_url,verification_status,verified_at,
     verification_source,opening_hours_text,website,
     (${blank('image_url')}) AS missing_photo,
     (${blank('opening_hours_text')}) AS missing_hours,
     (${blank('address')}) AS missing_address,
     (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days' OR ${blank('verification_source')}) AS requires_verification
     FROM places WHERE ${conditions}
     ORDER BY CASE WHEN verification_status='verified' AND verified_at>now()-interval '30 days' THEN 1 ELSE 0 END,
       name,id LIMIT 20 OFFSET $2`,[term,offset]),
    query(`SELECT count(*)::int AS total,
       count(*) FILTER (WHERE ${blank('image_url')})::int AS missing_photos,
       count(*) FILTER (WHERE ${blank('opening_hours_text')})::int AS missing_hours,
       count(*) FILTER (WHERE verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days' OR ${blank('verification_source')})::int AS needs_verification
       FROM places WHERE status='published'`)
   ]);
   return NextResponse.json({items:rows.rows,total:rows.rows.length>=0?Number((await query(`SELECT count(*)::int AS n FROM places WHERE ${conditions}`,[term])).rows[0]?.n||0):0,
    overview:count.rows[0],scope,kind,page:rawPage,notice:'Fotos ohne nachgewiesene Nutzungsrechte werden nicht automatisch übernommen.'},{headers:{'Cache-Control':'no-store'}});
  }
  const filters:Record<string,string>={all:'TRUE',duplicate:'possible_duplicate',incomplete:'missing_details',review:"reviewed_status='needs_review'"};
  const condition=`(${filters[kind]}) AND ($1::text='' OR name ILIKE '%'||$1||'%' OR address ILIKE '%'||$1||'%')`;
  const [rows,counts,total]=await Promise.all([
   query(`${flagged} SELECT * FROM flags WHERE ${condition}
      ORDER BY possible_duplicate DESC,missing_details DESC,reviewed_status DESC,name,osm_id
      LIMIT 20 OFFSET $2`,[term,offset]),
   query(`${flagged} SELECT count(*)::int AS total,
      count(*) FILTER (WHERE possible_duplicate)::int AS duplicates,
      count(*) FILTER (WHERE missing_details)::int AS incomplete,
      count(*) FILTER (WHERE reviewed_status='needs_review')::int AS review
      FROM flags`),
   query(`${flagged} SELECT count(*)::int AS n FROM flags WHERE ${condition}`,[term])
  ]);
  return NextResponse.json({items:rows.rows,total:total.rows[0]?.n||0,overview:counts.rows[0],scope,kind,page:rawPage,
   notice:'Mögliche Dubletten basieren nur auf gleichem Namen und nahen Koordinaten. Manuell prüfen, nie automatisch löschen oder freigeben.'},
   {headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Editorial data quality query failed',e);return NextResponse.json({error:'Datenprüfung nicht erreichbar'},{status:503});}
}

