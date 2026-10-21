import {NextRequest,NextResponse} from 'next/server';
import {billingConfigured} from '@/lib/billing-policy';
import {stripeClient} from '@/lib/billing-provider';
import {syncBillingEvent} from '@/lib/billing-sync';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 if(!billingConfigured())return NextResponse.json({error:'Not configured'},{status:503});
 const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:'Missing body'},{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024*1024){await reader.cancel();return NextResponse.json({error:'Too large'},{status:413})}chunks.push(part.value)}
 let event;try{event=stripeClient().webhooks.constructEvent(Buffer.concat(chunks),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET!)}catch{return NextResponse.json({error:'Invalid signature'},{status:400})}
 try{await syncBillingEvent(event);return NextResponse.json({received:true})}catch{console.error('Billing webhook synchronization failed');return NextResponse.json({error:'Retry later'},{status:500})}
}
