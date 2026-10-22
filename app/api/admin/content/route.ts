import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin,type AdminCapability} from '@/lib/admin-permissions';
import {pool,query} from '@/lib/db';
import {z} from 'zod';
export const dynamic='force-dynamic';
const kinds={post:['posts','body','moderation'],review:['venue_reviews','body','moderation'],comment:['post_comments','body','moderation'],deal:['deals','title','marketing'],place:['places','name','editorial']} as const;
const input=z.object({type:z.enum(['post','review','comment','deal','place']),id:z.uuid(),action:z.enum(['remove','restore']),reason:z.string().trim().min(10).max(500)});
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const actor=await sessionUser(req);if(!canAdmin(actor))return reply({error:'Keine Berechtigung'},403);
 const types=Object.entries(kinds).filter(([,v])=>canAdmin(actor,v[2] as AdminCapability)).map(([k])=>k);
 const type=req.nextUrl.searchParams.get('type')||types[0],state=req.nextUrl.searchParams.get('status')||'rejected';
 if(!types.includes(type)||!['pending','published','rejected'].includes(state))return reply({error:'Bereich oder Status nicht erlaubt'},403);
 const [table,label]=kinds[type as keyof typeof kinds],time=type==='place'?'updated_at':'created_at';
 // Identifiers come only from the static allowlist, never request text.
 const rows=await query(`SELECT id,${label} AS label,status,${time} AS created_at FROM ${table} WHERE status=$1 ORDER BY created_at DESC,id LIMIT 50`,[state]);
 return reply({types,items:rows.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const actor=await sessionUser(req);const parsed=input.safeParse(await req.json().catch(()=>null));
 if(!actor)return reply({error:'Keine Berechtigung'},403);
 if(!parsed.success)return reply({error:'Inhalt, Aktion und Begründung prüfen'},400);
 const data=parsed.data,[table,,permission]=kinds[data.type];
 if(!canAdmin(actor,permission))return reply({error:'Keine Berechtigung'},403);
 const tx=await pool.connect();try{
  await tx.query('BEGIN');const found=await tx.query(`SELECT id,status FROM ${table} WHERE id=$1 FOR UPDATE`,[data.id]);
  const item=found.rows[0];if(!item){await tx.query('ROLLBACK');return reply({error:'Inhalt nicht gefunden'},404)}
  const target=data.action==='restore'?'pending':'rejected';
  if((data.action==='restore'&&item.status!=='rejected')||item.status===target){await tx.query('ROLLBACK');return reply({error:'Status hat sich geändert'},409)}
  await tx.query(`UPDATE ${table} SET status=$2 WHERE id=$1`,[data.id,target]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)",[actor.id,`content:${data.action}:${item.status}>${target}:${data.reason}`,data.type,data.id]);
  await tx.query('COMMIT');return reply({status:target,notice:target==='pending'?'Zur erneuten Prüfung wiederhergestellt. Noch nicht öffentlich.':'Inhalt ausgeblendet.'});
 }catch{await tx.query('ROLLBACK');return reply({error:'Inhalt konnte nicht geändert werden'},500)}finally{tx.release()}
}
