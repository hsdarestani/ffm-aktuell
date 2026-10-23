import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
 const b=await query("SELECT tm.business_id,tm.role,tm.all_places,b.name AS business_name,COUNT(p.id)::int AS places_count FROM business_team_members tm JOIN businesses b ON b.id=tm.business_id LEFT JOIN places p ON p.business_id=b.id AND p.status='published' AND (tm.all_places OR p.id=ANY(tm.place_ids)) WHERE tm.user_id=$1 AND business_staff_allowed(b.id,$1) AND b.status='approved' GROUP BY tm.business_id,tm.role,tm.all_places,b.name ORDER BY b.name",[u.id]);
 const places=await query("SELECT tm.business_id,tm.role,p.id,p.name,p.address,p.phone,p.website,p.opening_hours_text,p.verification_status,p.status FROM business_team_members tm JOIN businesses b ON b.id=tm.business_id JOIN places p ON p.business_id=b.id WHERE tm.user_id=$1 AND business_staff_allowed(b.id,$1) AND b.status='approved' AND p.status='published' AND (tm.all_places OR p.id=ANY(tm.place_ids)) ORDER BY p.name LIMIT 100",[u.id]);
 return NextResponse.json({teams:b.rows,places:places.rows},{headers:{'Cache-Control':'private,no-store'}});
}

