import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {query} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!canAdmin(u,'finance'))return NextResponse.json({error:'Finanzberechtigung erforderlich'},{status:403});
 const [subscriptions,invoices,credits,ads]=await Promise.all([
  query('SELECT id,user_id,business_id,snapshot,status,current_period_end,cancel_at_period_end,updated_at FROM billing_subscriptions ORDER BY updated_at DESC LIMIT 100'),
  query('SELECT id,user_id,status,amount_due,amount_paid,currency,created_at FROM billing_invoices ORDER BY created_at DESC LIMIT 100'),
  query('SELECT id,invoice_id,amount,currency,status,created_at FROM billing_credit_notes ORDER BY created_at DESC LIMIT 100'),
  query('SELECT id,campaign_id,snapshot,state,amount,invoice_url,created_at FROM ad_orders ORDER BY created_at DESC LIMIT 100')
 ]);
 return NextResponse.json({subscriptions:subscriptions.rows,invoices:invoices.rows,credits:credits.rows,ads:ads.rows},{headers:{'Cache-Control':'private,no-store'}});
}
