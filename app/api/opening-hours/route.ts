import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {pool,query} from '@/lib/db';
import {openNowSQL,validPeriods} from '@/lib/opening-hours';
import {berlinDate} from '@/lib/discovery-context';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('place_id');if(!z.uuid().safeParse(id).success)return reply({error:'Ort ungültig'},400);
 const row=(await query(`SELECT h.day,h.state,h.periods,h.source_url,h.checked_at,${openNowSQL('p')} AS open_now,
 p.verification_status,p.activity_status,p.verified_at FROM places p LEFT JOIN place_opening_days h ON h.place_id=p.id AND h.day=(now() AT TIME ZONE 'Europe/Berlin')::date AND h.checked_at BETWEEN now()-interval '30 days' AND now() WHERE p.id=$1 AND p.status='published'`,[id])).rows[0];
 if(!row)return reply({error:'Ort nicht gefunden'},404);
 const known=row.day&&row.verification_status==='verified'&&row.activity_status==='operating'&&row.verified_at&&Date.now()-new Date(row.verified_at).getTime()>=0&&Date.now()-new Date(row.verified_at).getTime()<=30*86400000;
 return reply({state:known?(row.open_now?'open':'closed'):'unknown',plan:known?{day:row.day,periods:row.periods,source_url:row.source_url,checked_at:row.checked_at}:null,timezone:'Europe/Berlin',checked_at:new Date().toISOString()});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return reply({error:'Redaktionsberechtigung erforderlich'},403);
 const parsed=z.object({place_id:z.uuid(),day:z.string().regex(/^20\d{2}-\d{2}-\d{2}$/),state:z.enum(['open','closed','withdraw']),periods:z.array(z.object({start:z.number().int(),end:z.number().int()})).max(6),source_url:z.url().max(1500).refine(x=>new URL(x).protocol==='https:'),checked_at:z.iso.datetime(),note:z.string().trim().min(10).max(500)}).safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return reply({error:'Datum, Zeitfenster und HTTPS Beleg erforderlich'},400);
 const d=parsed.data,day=Date.parse(d.day+'T12:00:00Z'),checked=Date.parse(d.checked_at);
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==d.day||d.day<berlinDate()||day>Date.now()+30*86400000||checked>Date.now()||checked<Date.now()-30*86400000||d.state!=='withdraw'&&!validPeriods(d.periods,d.state))return reply({error:'Gültigen Tagesplan ohne überlappende Zeiten mit aktueller Prüfung angeben'},400);
 const tx=await pool.connect();try{await tx.query('BEGIN');const p=await tx.query('SELECT id FROM places WHERE id=$1 FOR UPDATE',[d.place_id]);if(!p.rowCount){await tx.query('ROLLBACK');return reply({error:'Ort nicht gefunden'},404)}
 const before=(await tx.query('SELECT * FROM place_opening_days WHERE place_id=$1 AND day=$2',[d.place_id,d.day])).rows[0];
 if(d.state==='withdraw')await tx.query('DELETE FROM place_opening_days WHERE place_id=$1 AND day=$2',[d.place_id,d.day]);else await tx.query(`INSERT INTO place_opening_days(place_id,day,state,periods,source_url,checked_at,note,checked_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
 ON CONFLICT(place_id,day) DO UPDATE SET state=excluded.state,periods=excluded.periods,source_url=excluded.source_url,checked_at=excluded.checked_at,note=excluded.note,checked_by=excluded.checked_by`,[d.place_id,d.day,d.state,JSON.stringify(d.periods),d.source_url,d.checked_at,d.note,u.id]);
 await tx.query('INSERT INTO place_attribute_history(place_id,actor_id,field,before_value,after_value) VALUES($1,$2,$3,$4,$5)',[d.place_id,u.id,'opening_day:'+d.day,JSON.stringify(before||null),JSON.stringify(d)]);await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'place:daily-hours','place',$2)",[u.id,d.place_id]);await tx.query('COMMIT');return reply({success:true});
 }catch{await tx.query('ROLLBACK');return reply({error:'Tagesplan nicht gespeichert'},500)}finally{tx.release()}
}
