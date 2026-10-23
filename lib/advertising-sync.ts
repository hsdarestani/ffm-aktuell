import type Stripe from 'stripe';
import {pool} from '@/lib/db';
import {stripeClient} from '@/lib/billing-provider';
import {idOf} from '@/lib/billing-policy';
/** Separate event ledger: subscription and advertising handlers may process the same signed event. */
export async function syncAdvertisingEvent(event:Stripe.Event,provider=stripeClient(),database=pool){
 if(!event.type.startsWith('checkout.session.')&&event.type!=='charge.refunded'&&!event.type.startsWith('invoice.'))return;
 const object=event.data.object as unknown as Record<string,any>,tx=await database.connect();
 try{await tx.query('BEGIN');await tx.query("SELECT pg_advisory_xact_lock(hashtext('ffm-ad-webhooks'))");
 if((await tx.query('SELECT id FROM ad_webhook_events WHERE id=$1',[event.id])).rowCount){await tx.query('COMMIT');return}
 if(event.type==='charge.refunded'){
  const charge=await provider.charges.retrieve(object.id),intent=idOf(charge.payment_intent);
  const known=await tx.query('SELECT id FROM ad_orders WHERE payment_intent_id=$1 AND customer_id=$2',[intent,idOf(charge.customer)]);
  if(known.rowCount){await tx.query('INSERT INTO ad_charge_refunds(charge_id,payment_intent_id,amount_refunded) VALUES($1,$2,$3) ON CONFLICT(charge_id) DO UPDATE SET amount_refunded=excluded.amount_refunded',[charge.id,intent,charge.amount_refunded]);
   // Any refund pauses delivery immediately; partial delivery/refund reconciliation is an operator decision.
   if(charge.amount_refunded>0)await tx.query("UPDATE ad_orders SET state='refunded' WHERE payment_intent_id=$1",[intent]);}
 }else if(event.type.startsWith('invoice.')){
  const invoice=await provider.invoices.retrieve(object.id,{expand:['payments.data.payment.payment_intent']}) as unknown as Record<string,any>;
  const intent=idOf(invoice.payments?.data?.[0]?.payment?.payment_intent)||idOf(invoice.payment_intent);
  if(intent)await tx.query('UPDATE ad_orders SET invoice_url=$2 WHERE payment_intent_id=$1 AND customer_id=$3',[intent,invoice.hosted_invoice_url||null,idOf(invoice.customer)]);
 }else{
  const session=await provider.checkout.sessions.retrieve(object.id,{expand:['invoice']});
  const order=(await tx.query('SELECT * FROM ad_orders WHERE provider_session_id=$1 FOR UPDATE',[session.id])).rows[0];
  if(order){
   if(idOf(session.customer)!==order.customer_id||session.mode!=='payment'||(session.status!=='expired'&&(session.currency!=='eur'||session.amount_total!==order.amount)))throw Error('Ad payment mismatch');
   const intent=idOf(session.payment_intent),refunded=intent&&(await tx.query('SELECT 1 FROM ad_charge_refunds WHERE payment_intent_id=$1 AND amount_refunded>0',[intent])).rowCount;
   if(session.status==='complete'&&session.payment_status==='paid'&&order.state!=='refunded'&&!refunded){
    // A signed checkout is insufficient if its latest charge was already refunded before the webhook arrived.
    const pi=intent?await provider.paymentIntents.retrieve(intent,{expand:['latest_charge']}):null;
    const charge=typeof pi?.latest_charge==='string'?await provider.charges.retrieve(pi.latest_charge):pi?.latest_charge;
    const hasRefund=charge&&typeof charge==='object'&&'amount_refunded' in charge&&Number(charge.amount_refunded)>0;
    if(!charge||!pi||pi.status!=='succeeded'||pi.amount_received!==order.amount||pi.currency!=='eur'||idOf(pi.customer)!==order.customer_id)throw Error('Ad intent mismatch');
    const invoice=session.invoice&&typeof session.invoice==='object'&&'hosted_invoice_url' in session.invoice?session.invoice.hosted_invoice_url:null;
    await tx.query("UPDATE ad_orders SET state=$2,payment_intent_id=$3,paid_at=COALESCE(paid_at,now()),invoice_url=$4 WHERE id=$1",[order.id,hasRefund?'refunded':'paid',intent,invoice]);
   }else if(['pending','processing'].includes(order.state)&&session.status==='complete'&&session.payment_status==='unpaid'){
    const pendingIntent=intent?await provider.paymentIntents.retrieve(intent):null;
    const failed=pendingIntent?.status==='canceled'||pendingIntent?.status==='requires_payment_method';
    await tx.query('UPDATE ad_orders SET state=$2,payment_intent_id=$3 WHERE id=$1',[order.id,failed?'failed':'processing',intent]);
   }else if(order.state==='pending'&&session.status==='expired')await tx.query("UPDATE ad_orders SET state='expired' WHERE id=$1",[order.id]);
  }
 }
 await tx.query('INSERT INTO ad_webhook_events(id) VALUES($1)',[event.id]);await tx.query('COMMIT');
 }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
