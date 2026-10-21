import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import webpush from 'web-push';
import {pool} from '@/lib/db';
import {pushConfigured,safePushEndpoint} from '@/lib/push-policy';
import {enqueuePushJobs,pushPayloadQuery} from '@/lib/push-jobs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 const expected=process.env.PUSH_WORKER_TOKEN||'',given=req.headers.get('authorization')||'';
 const a=Buffer.from('Bearer '+expected),b=Buffer.from(given);
 if(expected.length<32||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!pushConfigured())return NextResponse.json({enabled:false});
 const tx=await pool.connect();let locked=false,sent=0;
 try{
  locked=Boolean((await tx.query('SELECT pg_try_advisory_lock(66770121) AS locked')).rows[0].locked);
  if(!locked)return NextResponse.json({busy:true});
  // Claims abandoned by a terminated worker can retry. Notification tags coalesce retries.
  await tx.query("UPDATE push_deliveries SET state='pending' WHERE state='sending' AND claimed_at<now()-interval '5 minutes'");
  await tx.query(enqueuePushJobs);
  const jobs=await tx.query(`UPDATE push_deliveries SET state='sending',claimed_at=now(),attempts=attempts+1
   WHERE id IN (SELECT id FROM push_deliveries WHERE state='pending' AND available_at<=now() ORDER BY available_at LIMIT 20)
   RETURNING *`);
  for(const job of jobs.rows){
   const result=await tx.query(pushPayloadQuery,[job.subscription_id,job.source_id,job.kind,job.source_version]);
   const sub=(await tx.query('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE id=$1',[job.subscription_id])).rows[0];
   if(!result.rows.length||!sub||!safePushEndpoint(sub.endpoint)){
    await tx.query("UPDATE push_deliveries SET state='cancelled' WHERE id=$1",[job.id]);continue;
   }
   const p=result.rows[0];
   try{
    await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:(job.kind==='event'?(p.language==='en'?'In the next hour: ':'In der nächsten Stunde: '):'')+p.title.slice(0,150),body:p.body.slice(0,220),url:p.url,tag:'ffm-'+job.id}),{
     TTL:job.kind==='event'?300:900,timeout:5000,urgency:'normal',vapidDetails:{subject:process.env.WEB_PUSH_SUBJECT!,publicKey:process.env.WEB_PUSH_PUBLIC_KEY!,privateKey:process.env.WEB_PUSH_PRIVATE_KEY!}
    });
    await tx.query("UPDATE push_deliveries SET state='sent',sent_at=now() WHERE id=$1",[job.id]);sent++;
   }catch(e){
    const status=(e as {statusCode?:number}).statusCode;
    if(status===404||status===410)await tx.query('DELETE FROM push_subscriptions WHERE id=$1',[job.subscription_id]);
    else await tx.query("UPDATE push_deliveries SET state=$2,available_at=now()+interval '2 minutes' WHERE id=$1",[job.id,job.attempts>=5||status===400||status===401||status===403?'failed':'pending']);
   }
  }
  await tx.query("DELETE FROM push_deliveries WHERE COALESCE(sent_at,claimed_at,available_at)<now()-interval '30 days' AND state IN ('sent','failed','cancelled')");
  return NextResponse.json({sent,processed:jobs.rowCount});
 }catch{console.error('Push worker tick failed');return NextResponse.json({error:'Worker failed'},{status:500})}
 finally{if(locked)await tx.query('SELECT pg_advisory_unlock(66770121)').catch(()=>{});tx.release()}
}
