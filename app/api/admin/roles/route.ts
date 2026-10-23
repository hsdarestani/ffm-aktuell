import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin,isRecentlyAuthenticated} from '@/lib/auth';
import {pool,query} from '@/lib/db';
import {ADMIN_CAPABILITIES} from '@/lib/admin-permissions';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return reply({error:'Hauptadministrator erforderlich'},403);
 const [roles,assignments]=await Promise.all([query('SELECT * FROM admin_roles ORDER BY code'),query('SELECT a.user_id,a.role_code,u.email,u.display_name FROM admin_role_assignments a JOIN users u ON u.id=a.user_id ORDER BY u.email,a.role_code')]);
 return reply({roles:roles.rows,assignments:assignments.rows,capabilities:ADMIN_CAPABILITIES});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const u=await sessionUser(req);if(u?.role!=='admin')return reply({error:'Hauptadministrator erforderlich'},403);
 if(!await isRecentlyAuthenticated(req,u.id))return reply({error:'Für Berechtigungen bitte innerhalb von fünf Minuten erneut anmelden.'},403);
 const parsed=z.object({action:z.enum(['role','assign','revoke']),code:z.string().regex(/^[a-z_]{2,40}$/),email:z.email().max(254).optional(),label:z.string().trim().min(2).max(80).optional(),permissions:z.array(z.enum(ADMIN_CAPABILITIES)).max(6).optional(),reason:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Rolle, Aktion und Begründung prüfen'},400);
 const d=parsed.data,tx=await pool.connect();
 try{await tx.query('BEGIN');
  if(d.action==='role'){
   if(!d.label||!d.permissions?.length){await tx.query('ROLLBACK');return reply({error:'Name und mindestens ein Bereich erforderlich'},400)}
   await tx.query('INSERT INTO admin_roles(code,label,permissions) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET label=excluded.label,permissions=excluded.permissions',[d.code,d.label,[...new Set(d.permissions)]]);
  }else{
   const target=await tx.query('SELECT id,role FROM users WHERE lower(email)=lower($1)',[d.email||'']);
   if(!target.rowCount){await tx.query('ROLLBACK');return reply({error:'Registriertes Konto nicht gefunden'},404)}
   if(target.rows[0].role==='admin'){await tx.query('ROLLBACK');return reply({error:'Hauptadministratoren werden über diesen Bereich nicht geändert'},409)}
   const role=await tx.query('SELECT code FROM admin_roles WHERE code=$1',[d.code]);if(!role.rowCount){await tx.query('ROLLBACK');return reply({error:'Rolle nicht gefunden'},404)}
   if(d.action==='assign')await tx.query('INSERT INTO admin_role_assignments(user_id,role_code,granted_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[target.rows[0].id,d.code,u.id]);
   else await tx.query('DELETE FROM admin_role_assignments WHERE user_id=$1 AND role_code=$2',[target.rows[0].id,d.code]);
  }
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'admin_role',$3)",[u.id,'role:'+d.action+':'+d.reason,d.code+(d.email?':'+d.email.toLowerCase():'')]);
  await tx.query('COMMIT');return reply({ok:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Berechtigungen konnten nicht gespeichert werden'},500)}finally{tx.release()}
}
