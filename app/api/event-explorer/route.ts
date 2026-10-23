import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const dynamic='force-dynamic';
/** Published events remain visible even if no verified location may be placed on the map. */
export async function GET(req:NextRequest){
 const from=req.nextUrl.searchParams.get('from')||'',to=req.nextUrl.searchParams.get('to')||'';
 const valid=(s:string)=>/^20\d{2}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 if(!valid(from)||!valid(to)||to<from||Date.parse(to)-Date.parse(from)>1000*86400000)return NextResponse.json({error:'Ungültiger Zeitraum'},{status:400});
 const r=await query(`SELECT e.id,e.title,e.description_de,e.description_en,e.venue,e.starts_at,e.ends_at,
  e.category,e.organizer,e.price_cents,e.price_source_url,e.source_url,e.ticket_url,e.place_id,
  p.latitude,p.longitude,p.address AS place_address,p.name AS place_name
 FROM events e
 LEFT JOIN places p ON p.id=e.place_id AND p.status='published'
  AND p.verification_status='verified' AND p.activity_status='operating'
  AND p.verified_at BETWEEN now()-interval '30 days' AND now()
 WHERE e.status='published' AND e.starts_at >= (LEAST($1::date,CURRENT_DATE)-interval '1 day')
  AND e.starts_at < ($2::date+interval '2 days')
 ORDER BY e.starts_at,e.id LIMIT 1000`,[from,to]);
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'public, max-age=60, stale-while-revalidate=120'}});
}
