import {createHash,createHmac} from 'node:crypto';
export const placements=['search','home','feed','stories','events','district','category','new_openings'] as const;
export const adHash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const adIpHash=(ip:string)=>createHmac('sha256',process.env.SESSION_SECRET||'unconfigured').update(new Date().toISOString().slice(0,10)+':'+ip).digest('hex');
/** Every delivery/receipt rechecks editorial, payment, business, branch and Berlin calendar gates. */
export const eligibleAd=`o.state='paid' AND c.status='awaiting_commercial_setup' AND b.status='approved' AND p.status='published'
 AND (now() AT TIME ZONE 'Europe/Berlin')::date BETWEEN (o.snapshot->>'start_date')::date AND (o.snapshot->>'end_date')::date`;
export function adSnapshot(c:Record<string,any>,rate:Record<string,any>){
 const start=String(c.start_date).slice(0,10),end=String(c.end_date).slice(0,10),days=(Date.parse(end)-Date.parse(start))/86400000+1;
 const amount=days*Number(rate.daily_cents);
 if(!rate.approved||typeof rate.terms_url!=='string'||!/^https:\/\//.test(rate.terms_url)||!Number.isSafeInteger(amount)||amount<=0||amount>10000000||days<1||days>91)throw Error('Werbetarif nicht freigegeben');
 return {title:String(c.title),copy_de:String(c.copy_de),placement:String(c.placement),place_id:String(c.place_id),start_date:start,end_date:end,daily_cents:Number(rate.daily_cents),days,amount,terms_url:rate.terms_url};
}
