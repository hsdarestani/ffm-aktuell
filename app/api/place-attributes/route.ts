import {canAdmin} from '@/lib/admin-permissions';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {z} from 'zod';
export const dynamic='force-dynamic';
const field=z.enum(['price_level','indoor','outdoor','family_friendly','wheelchair_accessible','date_friendly','group_friendly','quiet']);
const input=z.object({place_id:z.uuid(),field,value:z.enum(['yes','no','1','2','3','4']).nullable(),source_url:z.url().max(1500).refine(v=>new URL(v).protocol==='https:'),checked_at:z.iso.datetime(),note:z.string().trim().min(10).max(500)}).refine(v=>v.value===null||(v.field==='price_level'?['1','2','3','4'].includes(v.value):['yes','no'].includes(v.value)));
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('place_id')||'';if(!z.uuid().safeParse(id).success)return reply({error:'Ungültiger Ort'},400);
 const u=await sessionUser(req);const admin=canAdmin(u,'editorial')&&req.nextUrl.searchParams.get('scope')==='admin';
 const r=await query(`SELECT a.field,a.value,a.source_url,a.checked_at,a.note FROM place_attributes a JOIN places p ON p.id=a.place_id
 WHERE a.place_id=$1 AND ($2::boolean OR (p.status='published' AND a.checked_at BETWEEN now()-interval '30 days' AND now())) ORDER BY a.field`,[id,admin]);
 return reply({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return reply({error:'Admin erforderlich'},403);
 const parsed=input.safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:'Beleg, HTTPS Quelle und gültige Angabe erforderlich'},400);
 const d=parsed.data,stamp=Date.parse(d.checked_at);if(stamp>Date.now()||stamp<Date.now()-30*86400000)return reply({error:'Prüfdatum muss in den letzten 30 Tagen liegen'},400);
 const tx=await pool.connect();
 try{await tx.query('BEGIN');
  const exists=await tx.query('SELECT id FROM places WHERE id=$1 FOR UPDATE',[d.place_id]);if(!exists.rowCount){await tx.query('ROLLBACK');return reply({error:'Ort nicht gefunden'},404)}
  const old=await tx.query('SELECT * FROM place_attributes WHERE place_id=$1 AND field=$2',[d.place_id,d.field]);
  if(d.value===null)await tx.query('DELETE FROM place_attributes WHERE place_id=$1 AND field=$2',[d.place_id,d.field]);
  else await tx.query(`INSERT INTO place_attributes(place_id,field,value,source_url,checked_at,note,checked_by) VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(place_id,field) DO UPDATE SET value=excluded.value,source_url=excluded.source_url,checked_at=excluded.checked_at,note=excluded.note,checked_by=excluded.checked_by`,[d.place_id,d.field,d.value,d.source_url,d.checked_at,d.note,u.id]);
  await tx.query('INSERT INTO place_attribute_history(place_id,actor_id,field,before_value,after_value) VALUES($1,$2,$3,$4,$5)',[d.place_id,u.id,d.field,JSON.stringify(old.rows[0]||null),JSON.stringify(d)]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place',$3)",[u.id,'place:attribute:'+d.field,d.place_id]);
  await tx.query('COMMIT');return reply({ok:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Merkmal konnte nicht gespeichert werden'},500)}finally{tx.release()}
}
