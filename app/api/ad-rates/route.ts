import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {pool,query} from '@/lib/db';
import {placements} from '@/lib/advertising';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);return reply({items:(await query('SELECT * FROM ad_rates ORDER BY placement')).rows})}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'finance'))return reply({error:'Finanzberechtigung erforderlich'},403);
 const d=await req.json().catch(()=>null);if(!d||!placements.includes(d.placement)||!Number.isSafeInteger(d.daily_cents)||d.daily_cents<1||d.daily_cents>1000000||typeof d.approved!=='boolean'||typeof d.reason!=='string'||d.reason.trim().length<20||d.reason.length>1000||typeof d.terms_url!=='string'||d.terms_url.length>1000||!/^https:\/\//.test(d.terms_url))return reply({error:'Tarif, HTTPS Bedingungen und Entscheidungsgrund erforderlich'},400);
 const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('UPDATE ad_rates SET daily_cents=$2,terms_url=$3,approved=$4,updated_at=now() WHERE placement=$1',[d.placement,d.daily_cents,d.terms_url,d.approved]);await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'ad_rate',$3)",[u.id,'ad-rate:'+JSON.stringify({daily_cents:d.daily_cents,approved:d.approved,terms_url:d.terms_url,reason:d.reason}),d.placement]);await tx.query('COMMIT');return reply({success:true})}catch{await tx.query('ROLLBACK');return reply({error:'Tarif nicht gespeichert'},500)}finally{tx.release()}
}
