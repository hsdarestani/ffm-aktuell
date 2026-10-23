import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
import {stripeClient,ensureStripePrice} from '@/lib/billing-provider';
import {billingConfigured,planSnapshot} from '@/lib/billing-policy';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
 if(!billingConfigured())return NextResponse.json({error:'Zahlungsdienst noch nicht eingerichtet'},{status:503});
 const d=await req.json().catch(()=>null);if(typeof d?.subscription_id!=='string')return NextResponse.json({error:'Abo auswählen'},{status:400});
 const owned=(await query('SELECT customer_id,snapshot FROM billing_subscriptions WHERE id=$1 AND user_id=$2',[d.subscription_id,u.id])).rows[0];
 if(!owned)return NextResponse.json({error:'Abo nicht gefunden'},{status:404});
 try{
  const plans=await query("SELECT * FROM subscription_plans WHERE audience=$1 AND status='approved_for_display'",[owned.snapshot.audience]);
  const products:{product:string;prices:string[]}[]=[];
  for(const p of plans.rows)for(const interval of ['month','year'] as const){if(interval==='year'&&!p.annual_price_cents)continue;const price=await ensureStripePrice(planSnapshot(p,interval));products.push({product:price.product_id,prices:[price.id]})}
  const stripe=stripeClient(),site=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
  const configuration={business_profile:{headline:'FFM Aktuell Abonnement',terms_of_service_url:owned.snapshot.legal_terms_url},features:{customer_update:{enabled:true,allowed_updates:['address','name','tax_id']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end'},...(products.length?{subscription_update:{enabled:true,default_allowed_updates:['price'],proration_behavior:'always_invoice',products}}:{})}} as Parameters<typeof stripe.billingPortal.configurations.create>[0];
  const config=await stripe.billingPortal.configurations.create(configuration,{idempotencyKey:'ffm-portal-'+createHash('sha256').update(JSON.stringify(configuration)).digest('hex')});
  const session=await stripe.billingPortal.sessions.create({customer:owned.customer_id,configuration:config.id,return_url:site+'/?billing=manage',locale:'de'});
  return NextResponse.json({url:session.url},{headers:{'Cache-Control':'private,no-store'}});
 }catch{return NextResponse.json({error:'Aboverwaltung derzeit nicht erreichbar'},{status:503})}
}
