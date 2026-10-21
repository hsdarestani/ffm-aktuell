import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {query} from '@/lib/db';
import {billingConfigured} from '@/lib/billing-policy';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
 const [subscriptions,invoices,credits,refunds]=await Promise.all([
  query('SELECT id,business_id,snapshot,status,current_period_end,cancel_at_period_end FROM billing_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC',[u.id]),
  query('SELECT id,status,amount_due,amount_paid,currency,hosted_invoice_url,invoice_pdf,created_at FROM billing_invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[u.id]),
  query('SELECT c.id,c.invoice_id,c.amount,c.currency,c.status,c.created_at FROM billing_credit_notes c JOIN billing_customers b ON b.stripe_id=c.customer_id WHERE b.user_id=$1 ORDER BY c.created_at DESC LIMIT 100',[u.id]),
  query('SELECT r.charge_id,r.amount_refunded,r.currency,r.updated_at FROM billing_refunds r JOIN billing_customers b ON b.stripe_id=r.customer_id WHERE b.user_id=$1 ORDER BY r.updated_at DESC LIMIT 100',[u.id])
 ]);
 return NextResponse.json({configured:billingConfigured(),subscriptions:subscriptions.rows,invoices:invoices.rows,credits:credits.rows,refunds:refunds.rows},{headers:{'Cache-Control':'private,no-store'}});
}
