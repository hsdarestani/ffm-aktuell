import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {pushConfigured,safePushEndpoint,validPushKeys} from '@/lib/push-policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store, private'}});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const r=await query('SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id=$1',[u.id]);
 return reply({available:pushConfigured(),public_key:pushConfigured()?process.env.WEB_PUSH_PUBLIC_KEY:null,devices:r.rows[0].count});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Unerlaubte Herkunft'},403);
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 if(!pushConfigured())return reply({error:'Push ist noch nicht eingerichtet'},503);
 let raw='';const reader=req.body?.getReader();let size=0;
 if(!reader)return reply({error:'Ungültige Anfrage'},400);
 const decoder=new TextDecoder();
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
  if(size>4096){await reader.cancel();return reply({error:'Anfrage zu groß'},413)}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
 catch{return reply({error:'Ungültige Anfrage'},400)}
 let d;try{d=JSON.parse(raw)}catch{return reply({error:'Ungültige Anfrage'},400)}
 if(typeof d?.endpoint!=='string'||!safePushEndpoint(d.endpoint)||typeof d.keys?.p256dh!=='string'||typeof d.keys?.auth!=='string'||!validPushKeys(d.keys))return reply({error:'Ungültiges Push Abonnement'},400);
 const tx=await pool.connect();
 try{await tx.query('BEGIN');await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
  const count=await tx.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1',[u.id]);
  const existing=await tx.query('SELECT user_id FROM push_subscriptions WHERE endpoint=$1 FOR UPDATE',[d.endpoint]);
  if(existing.rows.length&&existing.rows[0].user_id!==u.id){await tx.query('ROLLBACK');return reply({error:'Dieses Gerät ist mit einem anderen Konto verbunden. Dort zuerst deaktivieren.'},409)}
  if(count.rows[0].n>=10&&!existing.rows.length){await tx.query('ROLLBACK');return reply({error:'Maximal 10 Geräte. Zuerst ein Gerät entfernen.'},409)}
  await tx.query('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()',[u.id,d.endpoint,d.keys.p256dh,d.keys.auth]);
  await tx.query('COMMIT');return reply({ok:true});
 }catch{return reply({error:'Gerät konnte nicht gespeichert werden'},500)}finally{await tx.query('ROLLBACK').catch(()=>{});tx.release()}
}
export async function DELETE(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Unerlaubte Herkunft'},403);
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const d=await req.json().catch(()=>null);
 if(d?.all===true)await query('DELETE FROM push_subscriptions WHERE user_id=$1',[u.id]);
 else if(typeof d?.endpoint==='string')await query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2',[u.id,d.endpoint]);
 else return reply({error:'Gerät fehlt'},400);
 return reply({ok:true});
}
