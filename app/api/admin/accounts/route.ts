import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin,isRecentlyAuthenticated} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {pool,query} from '@/lib/db';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const actor=await sessionUser(req);if(!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
 const search=(req.nextUrl.searchParams.get('q')||'').trim().slice(0,254);
 if(search.length<3)return reply({items:[]});
 const r=await query("SELECT id,email,display_name,suspended_at,suspension_reason FROM users WHERE role!='admin' AND (lower(email)=lower($1) OR id::text=$1) LIMIT 1",[search]);
 return reply({items:r.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const actor=await sessionUser(req);if(!actor||!canAdmin(actor,'moderation'))return reply({error:'Keine Berechtigung'},403);
 if(!await isRecentlyAuthenticated(req,actor.id))return reply({error:'Bitte innerhalb von fünf Minuten erneut anmelden.'},403);
 const parsed=z.object({id:z.uuid(),action:z.enum(['suspend','restore']),reason:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Konto, Aktion und Begründung prüfen'},400);
 const data=parsed.data;if(data.id===actor.id)return reply({error:'Das eigene Konto wird hier nicht gesperrt'},409);
 const tx=await pool.connect();try{
  await tx.query('BEGIN');
  const target=await tx.query("SELECT u.id,u.role,u.suspended_at,EXISTS(SELECT 1 FROM admin_role_assignments a WHERE a.user_id=u.id) AS delegated FROM users u WHERE u.id=$1 FOR UPDATE OF u",[data.id]);
  const user=target.rows[0];
  if(!user){await tx.query('ROLLBACK');return reply({error:'Konto nicht gefunden'},404)}
  if(user.role==='admin'||(user.delegated&&actor.role!=='admin')){await tx.query('ROLLBACK');return reply({error:'Administratorkonto geschützt'},403)}
  if(Boolean(user.suspended_at)===(data.action==='suspend')){await tx.query('ROLLBACK');return reply({error:'Kontostatus bereits gesetzt'},409)}
  await tx.query("UPDATE users SET suspended_at=CASE WHEN $2 THEN now() ELSE NULL END,suspension_reason=CASE WHEN $2 THEN $3 ELSE NULL END WHERE id=$1",[data.id,data.action==='suspend',data.reason]);
  // Both transitions invalidate old sessions: restoring an account never revives a stolen cookie.
  await tx.query('DELETE FROM sessions WHERE user_id=$1',[data.id]);
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'user',$3)",[actor.id,'account:'+data.action+':'+data.reason,data.id]);
  await tx.query('COMMIT');return reply({success:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Kontostatus konnte nicht gespeichert werden'},500)}finally{tx.release()}
}
