import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {billingConfigured} from '@/lib/billing-policy';
import {stripeClient} from '@/lib/billing-provider';
import {adSnapshot} from '@/lib/advertising';
import {berlinDate} from '@/lib/discovery-context';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const d=await req.json().catch(()=>null);if(!z.uuid().safeParse(d?.campaign_id).success)return reply({error:'Kampagne ungültig'},400);
 const tx=await pool.connect();let sessionId:string|null=null;const stripe=billingConfigured()?stripeClient():null;
 try{await tx.query('BEGIN');await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
 const campaign=(await tx.query(`SELECT c.*,c.start_date::text AS start_date,c.end_date::text AS end_date FROM ad_campaigns c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.id=$1 AND b.owner_id=$2 AND b.status='approved' AND p.status='published' FOR UPDATE OF c`,[d.campaign_id,u.id])).rows[0];
 if(!campaign||campaign.status!=='awaiting_commercial_setup'){await tx.query('ROLLBACK');return reply({error:'Inhalt noch nicht freigegeben'},409)}
 if(d.action==='stop'){
  await tx.query("UPDATE ad_campaigns SET status='cancelled',updated_at=now() WHERE id=$1",[campaign.id]);
  const sessions=(await tx.query("SELECT provider_session_id FROM ad_orders WHERE campaign_id=$1 AND state='pending'",[campaign.id])).rows;
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'ad:owner-stopped','ad_campaign',$2)",[u.id,campaign.id]);await tx.query('COMMIT');for(const s of sessions)if(s.provider_session_id&&stripe)await stripe.checkout.sessions.expire(s.provider_session_id).catch(()=>{});
  return reply({success:true,notice:'Ausspielung gestoppt. Eine Erstattung erfolgt nach Vertragsbedingungen durch die Abrechnung.'});
 }
 if(!stripe){await tx.query('ROLLBACK');return reply({error:'Zahlungsdienst noch nicht eingerichtet'},503)}
 const rate=(await tx.query('SELECT * FROM ad_rates WHERE placement=$1 FOR SHARE',[campaign.placement])).rows[0];let snapshot;try{snapshot=adSnapshot(campaign,rate||{})}catch{await tx.query('ROLLBACK');return reply({error:'Werbetarif noch nicht freigegeben'},409)}
 if(d.accept_terms!==true||d.amount!==snapshot.amount){await tx.query('ROLLBACK');return reply({error:'Aktuellen Gesamtpreis und Bedingungen bestätigen'},409)}
 if(snapshot.start_date<=berlinDate()){await tx.query('ROLLBACK');return reply({error:'Buchungen müssen mindestens am Folgetag starten. Bitte neuen Entwurf anlegen.'},409)}
 if((await tx.query("SELECT id FROM ad_orders WHERE campaign_id=$1 AND state='paid'",[campaign.id])).rowCount){await tx.query('ROLLBACK');return reply({error:'Bereits bezahlt'},409)}
 await tx.query("UPDATE ad_orders SET state='expired' WHERE campaign_id=$1 AND state='pending' AND expires_at<=now()",[campaign.id]);
 const pending=(await tx.query("SELECT provider_url,snapshot,state FROM ad_orders WHERE campaign_id=$1 AND state IN ('pending','processing')",[campaign.id])).rows[0];
 if(pending){await tx.query('ROLLBACK');if(pending.state==='processing')return reply({error:'Bankzahlung wird noch verarbeitet. Keine zweite Buchung starten.'},409);return pending.provider_url&&Object.entries(snapshot).every(([key,value])=>pending.snapshot[key]===value)?reply({url:pending.provider_url}):reply({error:'Buchung noch offen. Bitte später erneut versuchen.'},409)}
 let customer=(await tx.query('SELECT stripe_id FROM billing_customers WHERE user_id=$1',[u.id])).rows[0]?.stripe_id;
 if(!customer){customer=(await stripe.customers.create({email:u.email,name:u.display_name,metadata:{ffm_user_id:u.id}},{idempotencyKey:'ffm-user-'+u.id})).id;await tx.query('INSERT INTO billing_customers(user_id,stripe_id) VALUES($1,$2)',[u.id,customer])}
 const order=(await tx.query('INSERT INTO ad_orders(campaign_id,user_id,customer_id,snapshot,amount) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at',[campaign.id,u.id,customer,JSON.stringify(snapshot),snapshot.amount])).rows[0];
 const site=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
 const session=await stripe.checkout.sessions.create({mode:'payment',customer,client_reference_id:order.id,allowed_payment_method_types:['card','sepa_debit'],billing_address_collection:'required',customer_update:{address:'auto',name:'auto'},automatic_tax:{enabled:true},invoice_creation:{enabled:true},line_items:[{quantity:1,price_data:{currency:'eur',unit_amount:snapshot.amount,tax_behavior:'inclusive',product_data:{name:'FFM Werbung: '+snapshot.title,description:snapshot.start_date+' bis '+snapshot.end_date+' · '+snapshot.placement}}}],metadata:{ffm_ad_order:order.id},payment_intent_data:{metadata:{ffm_ad_order:order.id}},consent_collection:{terms_of_service:'required'},custom_text:{terms_of_service_acceptance:{message:'Es gelten die [Werbebedingungen]('+snapshot.terms_url+').'}},expires_at:Math.floor(new Date(order.expires_at).getTime()/1000),success_url:site+'/?advertising=success',cancel_url:site+'/?advertising=cancelled'},{idempotencyKey:'ffm-ad-order-'+order.id});sessionId=session.id;
 await tx.query('UPDATE ad_orders SET provider_session_id=$2,provider_url=$3 WHERE id=$1',[order.id,session.id,session.url]);await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'ad:terms-and-checkout','ad_order',$2)",[u.id,order.id]);await tx.query('COMMIT');return reply({url:session.url});
 }catch{await tx.query('ROLLBACK');if(sessionId&&stripe)await stripe.checkout.sessions.expire(sessionId).catch(()=>{});return reply({error:'Werbung konnte nicht gebucht werden'},503)}finally{tx.release()}
}
