import {canAdmin} from '@/lib/admin-permissions';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {billingConfigured} from '@/lib/billing-policy';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await sessionUser(req);
 const showDrafts=req.nextUrl.searchParams.get('all')==='1'&&canAdmin(u,'finance');
 const r=await query("SELECT code,audience,title_de,title_en,features,monthly_price_cents,annual_price_cents,trial_days,status,legal_terms_url,staff_seats,branch_limit FROM subscription_plans WHERE status='approved_for_display' OR $1 ORDER BY CASE code WHEN 'user_premium' THEN 1 WHEN 'business_premium_1' THEN 2 ELSE 3 END",[showDrafts]);
 return NextResponse.json({items:r.rows,checkout_available:billingConfigured(),subscription_activation_available:billingConfigured(),reason:billingConfigured()?null:'Zahlungsdienst noch nicht eingerichtet'},{headers:{'Cache-Control':'no-store'}});
}

