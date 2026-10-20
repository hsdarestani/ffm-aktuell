import {NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Only district assignments confirmed by editorial publication are selectable.
// OSM address strings are not interpreted as district evidence.
export async function GET(){
 try{
  const r=await query("SELECT DISTINCT district FROM places WHERE status='published' AND activity_status!='permanently_closed' AND nullif(trim(district),'') IS NOT NULL ORDER BY district LIMIT 80");
  return NextResponse.json({items:r.rows.map(v=>v.district)},{headers:{'Cache-Control':'public, max-age=0, s-maxage=120'}});
 }catch(e){console.error('District discovery failed',e);return NextResponse.json({items:[]},{status:503});}
}
