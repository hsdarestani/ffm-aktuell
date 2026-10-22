import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {billingConfigured,planSnapshot} from '@/lib/billing-policy';
import {stripeClient,ensureStripePrice} from '@/lib/billing-provider';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 if(!billingConfigured())return reply({error:'Zahlungsdienst noch nicht eingerichtet'},503);
 const parsed=z.object({code:z.enum(['user_premium','business_premium_1','business_premium_2']),interval:z.enum(['month','year']),business_id:z.uuid().optional(),accept_terms:z.literal(true)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Tarif, Laufzeit und Zustimmung zu Bedingungen erforderlich'},400);
 const d=parsed.data,plan=(await query('SELECT * FROM subscription_plans WHERE code=$1',[d.code])).rows[0];
 let snapshot;try{snapshot=planSnapshot(plan||{},d.interval)}catch{return reply({error:'Tarif noch nicht zur Buchung freigegeben'},409)}
 let businessId:string|null=null;
 if(snapshot.audience==='business'){
  if(!d.business_id)return reply({error:'Unternehmen auswählen'},400);
  const b=await query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved'",[d.business_id,u.id]);if(!b.rowCount)return reply({error:'Kein freigegebenes eigenes Unternehmen'},403);businessId=b.rows[0].id;
 }else if(d.business_id)return reply({error:'Privattarif ohne Unternehmen buchen'},400);
 let price;try{price=await ensureStripePrice(snapshot)}catch{return reply({error:'Zahlungsdienst derzeit nicht erreichbar'},503)}
 let createdSession:string|null=null;
 const tx=await pool.connect(),scope=(businessId?'business:':'user:')+(businessId||u.id),stripe=stripeClient();
 try{await tx.query('BEGIN');await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
  const current=(await tx.query('SELECT * FROM subscription_plans WHERE code=$1 FOR SHARE',[d.code])).rows[0];
  try{if(JSON.stringify(planSnapshot(current||{},d.interval))!==JSON.stringify(snapshot))throw Error('changed')}catch{await tx.query('ROLLBACK');return reply({error:'Tarif wurde geändert. Bitte neu laden.'},409)}
  if(businessId&&!(await tx.query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved' FOR SHARE",[businessId,u.id])).rowCount){await tx.query('ROLLBACK');return reply({error:'Unternehmen nicht mehr freigegeben'},403)}
  const live=await tx.query("SELECT id FROM billing_subscriptions WHERE scope_key=$1 AND status NOT IN ('canceled','incomplete_expired') LIMIT 1",[scope]);
  if(live.rowCount){await tx.query('ROLLBACK');return reply({error:'Ein Abo besteht bereits. Bitte über Abo verwalten ändern oder kündigen.'},409)}
  const stale=(await tx.query("SELECT id,provider_session_id FROM billing_checkouts WHERE scope_key=$1 AND state='pending' AND expires_at<=now()",[scope])).rows;
  for(const old of stale){
   if(old.provider_session_id){const current=await stripe.checkout.sessions.retrieve(old.provider_session_id);
    if(current.status==='complete'){await tx.query('ROLLBACK');return reply({error:'Bestehende Zahlung wird abgeglichen. Bitte keine zweite Buchung starten.'},409)}
    if(current.status!=='expired')await stripe.checkout.sessions.expire(old.provider_session_id);
   }
   await tx.query("UPDATE billing_checkouts SET state='expired' WHERE id=$1",[old.id]);
  }
  const pending=await tx.query("SELECT provider_url,price_id FROM billing_checkouts WHERE scope_key=$1 AND state='pending'",[scope]);
  if(pending.rowCount){await tx.query('ROLLBACK');return pending.rows[0].provider_url&&pending.rows[0].price_id===price.id?reply({url:pending.rows[0].provider_url}):reply({error:'Eine Buchung ist noch offen. Bitte abschließen oder nach 35 Minuten erneut versuchen.'},409)}
  let customer=(await tx.query('SELECT stripe_id FROM billing_customers WHERE user_id=$1',[u.id])).rows[0]?.stripe_id;
  if(!customer){customer=(await stripe.customers.create({email:u.email,name:u.display_name,metadata:{ffm_user_id:u.id}},{idempotencyKey:'ffm-user-'+u.id})).id;await tx.query('INSERT INTO billing_customers(user_id,stripe_id) VALUES($1,$2)',[u.id,customer])}
  const attempt=(await tx.query('INSERT INTO billing_checkouts(user_id,business_id,scope_key,price_id,snapshot) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at',[u.id,businessId,scope,price.id,JSON.stringify(snapshot)])).rows[0];
  const hadTrial=await tx.query('SELECT id FROM billing_subscriptions WHERE user_id=$1 LIMIT 1',[u.id]);
  const site=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
  const session=await stripe.checkout.sessions.create({mode:'subscription',payment_method_collection:'always',customer,client_reference_id:attempt.id,line_items:[{price:price.id,quantity:1}],allowed_payment_method_types:['card','sepa_debit'],billing_address_collection:'required',automatic_tax:{enabled:true},customer_update:{address:'auto',name:'auto'},consent_collection:{terms_of_service:'required'},custom_text:{terms_of_service_acceptance:{message:'Es gelten die [Vertragsbedingungen]('+snapshot.legal_terms_url+').'}},subscription_data:{metadata:{ffm_checkout_id:attempt.id},...(!hadTrial.rowCount&&snapshot.trial_days?{trial_period_days:snapshot.trial_days}:{})},metadata:{ffm_checkout_id:attempt.id},expires_at:Math.floor(new Date(attempt.expires_at).getTime()/1000),success_url:site+'/?billing=success',cancel_url:site+'/?billing=cancelled'},{idempotencyKey:'ffm-checkout-'+attempt.id});
  createdSession=session.id;
  await tx.query('UPDATE billing_checkouts SET provider_session_id=$2,provider_url=$3 WHERE id=$1',[attempt.id,session.id,session.url]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'billing:terms-and-checkout','checkout',$2)",[u.id,attempt.id]);await tx.query('COMMIT');return reply({url:session.url});
 }catch{await tx.query('ROLLBACK');if(createdSession)await stripe.checkout.sessions.expire(createdSession).catch(()=>{});return reply({error:'Buchung konnte nicht gestartet werden. Es wurden keine Rechte freigeschaltet.'},503)}finally{tx.release()}
}
