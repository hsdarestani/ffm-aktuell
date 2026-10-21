import Stripe from 'stripe';
import {createHash} from 'node:crypto';
import {query} from '@/lib/db';
import type {BillingSnapshot} from '@/lib/billing-policy';
export function stripeClient(){return new Stripe(process.env.STRIPE_SECRET_KEY||'',{timeout:12000,maxNetworkRetries:1})}
export async function ensureStripePrice(snapshot:BillingSnapshot){
 const key=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const found=await query('SELECT id,product_id FROM billing_prices WHERE snapshot_hash=$1',[key]);if(found.rows[0])return found.rows[0] as {id:string;product_id:string};
 const stripe=stripeClient();
 const price=await stripe.prices.create({currency:'eur',unit_amount:snapshot.amount,tax_behavior:'inclusive',recurring:{interval:snapshot.interval},product_data:{name:snapshot.title_de,metadata:{ffm_plan:snapshot.code}},metadata:{ffm_snapshot:key}},{idempotencyKey:'ffm-price-'+key});
 const product=typeof price.product==='string'?price.product:price.product.id;
 await query('INSERT INTO billing_prices(id,product_id,snapshot_hash,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[price.id,product,key,JSON.stringify(snapshot)]);
 return {id:price.id,product_id:product};
}
