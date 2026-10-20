import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const fail=(error:string)=>NextResponse.json({error},{status:400,headers:{'Cache-Control':'no-store'}});
/**
 * The public search must never present OSM candidates as operating/verified.
 * Multi-category matching is OR, while text/district/radius/verification are AND.
 * District exists only on curated records; OSM address text is not a verified district.
 */
export async function GET(req:NextRequest){
 const qs=req.nextUrl.searchParams;
 const rawCats=qs.getAll('category').map(v=>v.trim()).filter(v=>v&&v!=='Alle');
 const categories=[...new Set(rawCats)];
 if(categories.length>6||categories.some(v=>v.length>70))return fail('Maximal sechs Kategorien wählen');
 const search=(qs.get('q')||'').trim(),district=(qs.get('district')||'').trim();
 if(search.length>90||district.length>60)return fail('Filter zu lang');
 const verified=qs.get('verified')==='1';
 if(qs.has('verified')&&!['0','1'].includes(qs.get('verified')||''))return fail('Ungültiger Bestätigungsfilter');
 const radius=Number(qs.get('radius')||3),nearby=qs.has('lat')||qs.has('lon');
 const lat=Number(qs.get('lat')),lon=Number(qs.get('lon'));
 if(![1,3,5,10].includes(radius)||nearby&&(
  !qs.has('lat')||!qs.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||
  lat<49.7||lat>50.4||lon<8.2||lon>9.1))return fail('Ungültiger Standort oder Radius');
 const offset=Number(qs.get('offset')||0),placeOffset=Number(qs.get('place_offset')||0);
 if([offset,placeOffset].some(n=>!Number.isSafeInteger(n)||n<0||n>10000))return fail('Ungültige Seite');
 const params=[categories,search,district,verified,nearby?lat:null,nearby?lon:null,radius];
 const dist=`6371*ACOS(LEAST(1,GREATEST(-1,
 COS(RADIANS(latitude))*COS(RADIANS($5::float8))*COS(RADIANS(longitude-$6::float8))
 +SIN(RADIANS(latitude))*SIN(RADIANS($5::float8)))))`;
 const distance=`CASE WHEN $5::float8 IS NULL OR latitude IS NULL OR longitude IS NULL THEN NULL ELSE ROUND((${dist})::numeric,2)::float8 END AS distance_km`;
 const where=`status='published' AND activity_status!='permanently_closed'
  AND (cardinality($1::text[])=0 OR category=ANY($1::text[]) OR EXISTS(
    SELECT 1 FROM place_categories pc WHERE pc.place_id=places.id AND pc.category_slug=ANY($1::text[])))
  AND ($2::text='' OR (name||' '||coalesce(description_de,'')||' '||coalesce(description_en,'')||' '||district||' '||address) ILIKE '%'||$2||'%')
  AND ($3::text='' OR district=$3)
  AND (NOT $4::boolean OR (verification_status='verified' AND activity_status='operating'
    AND verified_at BETWEEN now()-interval '30 days' AND now()))
  AND ($5::float8 IS NULL OR (${dist})<=$7::float8)`;
 // Editorial results are bounded; raw OSM candidates have a separate
 // complete count + stable pagination. Sample/demo records never enter SQL.
 const editorSQL=`SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,
 website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,
 editorial_rank,opening_hours_text,phone,
 COALESCE((SELECT array_agg(pc.category_slug ORDER BY pc.category_slug) FROM place_categories pc
 WHERE pc.place_id=places.id),ARRAY[category]) AS categories,
 CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id,
 ${distance}
 FROM places WHERE ${where}
 ORDER BY distance_km ASC NULLS LAST,CASE WHEN verification_status='verified' AND activity_status='operating'
   AND verified_at>now()-interval '30 days' THEN 0 ELSE 1 END,editorial_rank DESC,name,id LIMIT 18 OFFSET $8`;
 // OSM entries contain no authoritative district column; no guess from address.
 // An explicit district filter therefore omits them rather than lying to users.
 const candidatesAllowed=!verified&&!district;
 const candidateWhere=`reviewed_status='unverified' AND activity_status!='permanently_closed'
  AND ($3::text='' AND NOT $4::boolean)
  AND (cardinality($1::text[])=0 OR category=ANY($1::text[]))
  AND ($2::text='' OR (name||' '||address) ILIKE '%'||$2||'%')
  AND ($5::float8 IS NULL OR (${dist})<=$7::float8)`;
 try{
  const [editor,editorCount,osm,osmCount]=await Promise.all([
   query(editorSQL,[...params,placeOffset]),
   query(`SELECT count(*)::int AS n FROM places WHERE ${where}`,params),
   candidatesAllowed?query(`SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,
 opening_hours AS opening_hours_text,last_osm_check,osm_url AS source_url,
 activity_status,'unverified' AS verification_status,true AS candidate,false AS demo,
 ${distance} FROM discovery_candidates WHERE ${candidateWhere}
 ORDER BY distance_km ASC NULLS LAST,name,osm_id LIMIT 18 OFFSET $8`,[...params,offset]):Promise.resolve({rows:[]}),
   candidatesAllowed?query(`SELECT count(*)::int AS n FROM discovery_candidates WHERE ${candidateWhere}`,params):Promise.resolve({rows:[{n:0}]})
  ]);
  return NextResponse.json({
   places:editor.rows,places_total:editorCount.rows[0]?.n||0,
   candidates:osm.rows,candidates_total:osmCount.rows[0]?.n||0,
   limit:18,offset,places_limit:18,places_offset:placeOffset,candidate_district_unsupported:Boolean(district),
   openingNowAvailable:false,pricesAvailable:false,
   source:'© OpenStreetMap-Mitwirkende · ODbL'
  },{headers:{'Cache-Control':'public, max-age=0, s-maxage=15'}});
 }catch(e){console.error('Public filtered discovery failed',e);
  return NextResponse.json({error:'Orte derzeit nicht erreichbar'},{status:503,headers:{'Cache-Control':'no-store'}});}
}

