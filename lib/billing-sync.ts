import type Stripe from 'stripe';
import {pool} from '@/lib/db';
import {stripeClient} from '@/lib/billing-provider';
import {idOf} from '@/lib/billing-policy';
/** Serialize by customer and retrieve current provider state: old events cannot roll back a newer cancellation. */
export async function syncBillingEvent(event:Stripe.Event,provider=stripeClient(),database=pool){
 const object=event.data.object as unknown as Record<string,any>;
 const customerId=idOf(object.customer);if(!customerId)return;
 const tx=await database.connect();
 try{await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[customerId]);
  if((await tx.query('SELECT id FROM billing_webhook_events WHERE id=$1',[event.id])).rowCount){await tx.query('COMMIT');return}
  const customer=(await tx.query('SELECT user_id FROM billing_customers WHERE stripe_id=$1',[customerId])).rows[0];
  if(!customer){await tx.query('COMMIT');return}
  if(event.type==='charge.refunded'){
   const charge=await provider.charges.retrieve(object.id);
   if(idOf(charge.customer)!==customerId)throw Error('Refund customer mismatch');
   const intent=idOf(charge.payment_intent);
   await tx.query(`INSERT INTO billing_refunds(charge_id,customer_id,payment_intent_id,amount,amount_refunded,currency)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(charge_id) DO UPDATE SET amount_refunded=excluded.amount_refunded,updated_at=now()`,[charge.id,customerId,intent,charge.amount,charge.amount_refunded,charge.currency]);
   await tx.query(`UPDATE billing_subscriptions s SET status='refunded',updated_at=now() WHERE s.customer_id=$1
    AND s.latest_invoice_id IN (SELECT i.id FROM billing_invoices i WHERE i.payment_intent_id=$2 AND i.amount_paid>0 AND $3::int>=i.amount_paid)`,[customerId,intent,charge.amount_refunded]);
  }
  if(event.type.startsWith('credit_note.')){
   const credit=await provider.creditNotes.retrieve(object.id);
   if(idOf(credit.customer)!==customerId)throw Error('Credit customer mismatch');
   await tx.query(`INSERT INTO billing_credit_notes(id,invoice_id,customer_id,amount,currency,status) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET status=excluded.status`,[credit.id,idOf(credit.invoice),customerId,credit.amount,credit.currency,credit.status]);
  }
  let subscriptionId:string|null=null;
  if(event.type.startsWith('customer.subscription.'))subscriptionId=object.id;
  if(event.type.startsWith('checkout.session.')){
   const session=await provider.checkout.sessions.retrieve(object.id);
   if(session.status==='expired')await tx.query("UPDATE billing_checkouts SET state='expired' WHERE provider_session_id=$1 AND state='pending'",[session.id]);
   subscriptionId=idOf(session.subscription);
  }
  if(event.type.startsWith('invoice.')){
   const invoice=await provider.invoices.retrieve(object.id,{expand:['payments.data.payment.payment_intent']}) as unknown as Record<string,any>;
   subscriptionId=idOf(invoice.parent?.subscription_details?.subscription)||idOf(invoice.subscription);
   if(idOf(invoice.customer)===customerId){
    await tx.query(`INSERT INTO billing_invoices(id,customer_id,subscription_id,user_id,status,amount_due,amount_paid,currency,hosted_invoice_url,invoice_pdf,created_at,payment_intent_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11),$12) ON CONFLICT(id) DO UPDATE SET status=excluded.status,amount_due=excluded.amount_due,amount_paid=excluded.amount_paid,hosted_invoice_url=excluded.hosted_invoice_url,invoice_pdf=excluded.invoice_pdf,payment_intent_id=excluded.payment_intent_id,updated_at=now()`,
     [invoice.id,customerId,subscriptionId,customer.user_id,invoice.status||'draft',invoice.amount_due,invoice.amount_paid,invoice.currency,invoice.hosted_invoice_url,invoice.invoice_pdf,invoice.created,idOf(invoice.payments?.data?.[0]?.payment?.payment_intent)||idOf(invoice.payment_intent)]);
   }
  }
  if(subscriptionId){
   const sub=await provider.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']}) as unknown as Record<string,any>;
   if(idOf(sub.customer)!==customerId)throw Error('Subscription customer mismatch');
   const old=(await tx.query('SELECT * FROM billing_subscriptions WHERE id=$1',[sub.id])).rows[0];
   const checkoutId=sub.metadata?.ffm_checkout_id;
   const checkout=typeof checkoutId==='string'&&/^[0-9a-f-]{36}$/.test(checkoutId)?(await tx.query('SELECT * FROM billing_checkouts WHERE id=$1 AND user_id=$2',[checkoutId,customer.user_id])).rows[0]:null;
   if(old||checkout){
    const items=sub.items?.data||[],priceId=items.length===1?idOf(items[0].price):null;
    const price=priceId?(await tx.query('SELECT snapshot FROM billing_prices WHERE id=$1',[priceId])).rows[0]:null;
    if(!price)throw Error('Unknown subscription price');
    const identity=old||checkout;
    if(price.snapshot.audience!==identity.snapshot.audience)throw Error('Subscription audience mismatch');
    const end=Number(items[0].current_period_end||sub.current_period_end||sub.trial_end)||null;
    let status=String(sub.status);
    const invoice=sub.latest_invoice;
    const refunded=await tx.query('SELECT 1 FROM billing_invoices i JOIN billing_refunds r ON r.payment_intent_id=i.payment_intent_id WHERE i.id=$1 AND i.amount_paid>0 AND r.amount_refunded>=i.amount_paid LIMIT 1',[idOf(invoice)]);
    if(status==='active'&&refunded.rowCount)status='refunded';
    if(status==='active'&&invoice&&typeof invoice==='object'&&invoice.amount_due>0&&invoice.status!=='paid')status='past_due';
    await tx.query(`INSERT INTO billing_subscriptions(id,user_id,business_id,customer_id,scope_key,price_id,snapshot,status,current_period_end,cancel_at_period_end,latest_invoice_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9),$10,$11) ON CONFLICT(id) DO UPDATE SET price_id=excluded.price_id,snapshot=excluded.snapshot,status=excluded.status,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,latest_invoice_id=excluded.latest_invoice_id,updated_at=now()`,
     [sub.id,identity.user_id,identity.business_id,customerId,identity.scope_key,priceId,JSON.stringify(price.snapshot),status,end,Boolean(sub.cancel_at_period_end),idOf(sub.latest_invoice)]);
    if(checkout)await tx.query("UPDATE billing_checkouts SET state='completed' WHERE id=$1",[checkout.id]);
   }
  }
  await tx.query('INSERT INTO billing_webhook_events(id,type) VALUES($1,$2)',[event.id,event.type]);await tx.query('COMMIT');
 }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
}
