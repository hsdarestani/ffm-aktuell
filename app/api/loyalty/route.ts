import {NextRequest,NextResponse} from 'next/server';
import {randomBytes,createHash} from 'node:crypto';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {resolveBusinessEditor} from '@/lib/business-team';
import {pool,query} from '@/lib/db';
import {allocateLoyaltyVisits} from '@/lib/loyalty-ledger';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const scope=req.nextUrl.searchParams.get('scope');
 if(scope==='admin'){
  if(!canAdmin(u,'marketing'))return reply({error:'Marketingberechtigung erforderlich'},403);
  const r=await query('SELECT p.*,b.name AS business_name FROM loyalty_programs p JOIN businesses b ON b.id=p.business_id ORDER BY p.updated_at DESC LIMIT 100');return reply({programs:r.rows});
 }
 if(scope==='business'){
  const id=req.nextUrl.searchParams.get('business_id');if(!z.uuid().safeParse(id).success)return reply({error:'Unternehmen auswählen'},400);
  const b=await query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved'",[id,u.id]);if(!b.rowCount)return reply({error:'Kein Zugriff'},403);
  const program=(await query('SELECT * FROM loyalty_programs WHERE business_id=$1',[id])).rows[0]||null;
  return reply({program});
 }
 const [cards,visits]=await Promise.all([
  query(`SELECT c.id,c.goal,c.reward,c.terms_url,c.created_at,c.redeemed_at,p.business_id,p.status,b.name AS business_name,
   (SELECT count(*)::int FROM loyalty_card_visits cv WHERE cv.card_id=c.id) AS visits,
   (SELECT coalesce(json_agg(json_build_object('id',v.id,'name',v.name)),'[]'::json) FROM places v WHERE v.business_id=b.id AND v.status='published') AS places
   FROM loyalty_cards c JOIN loyalty_programs p ON p.id=c.program_id JOIN businesses b ON b.id=p.business_id
   WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100`,[u.id]),
  query('SELECT v.id,v.place_id,p.name AS place_name,v.confirmed_at FROM confirmed_visits v JOIN places p ON p.id=v.place_id WHERE v.user_id=$1 ORDER BY v.confirmed_at DESC LIMIT 100',[u.id])
 ]);return reply({cards:cards.rows,visits:visits.rows});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const d=await req.json().catch(()=>null);if(!d)return reply({error:'Aktion fehlt'},400);
 if(d.action==='save_program'){
  const v=z.object({business_id:z.uuid(),goal:z.number().int().min(2).max(50),minimum_hours:z.number().int().min(1).max(168),reward:z.string().trim().min(10).max(500),terms_url:z.url().max(1500).refine(s=>new URL(s).protocol==='https:')}).safeParse(d);
  if(!v.success)return reply({error:'Besuche, Abstand, Vorteil und HTTPS Bedingungen prüfen'},400);
  const p=v.data,tx=await pool.connect();try{await tx.query('BEGIN');
   const b=await tx.query("SELECT id FROM businesses WHERE id=$1 AND owner_id=$2 AND status='approved' FOR UPDATE",[p.business_id,u.id]);if(!b.rowCount){await tx.query('ROLLBACK');return reply({error:'Kein freigegebenes eigenes Unternehmen'},403)}
   const r=await tx.query("INSERT INTO loyalty_programs(business_id,goal,minimum_hours,reward,terms_url) VALUES($1,$2,$3,$4,$5) ON CONFLICT(business_id) DO UPDATE SET goal=excluded.goal,minimum_hours=excluded.minimum_hours,reward=excluded.reward,terms_url=excluded.terms_url,status='pending',review_note=NULL,updated_at=now() RETURNING id",[p.business_id,p.goal,p.minimum_hours,p.reward,p.terms_url]);
   await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'loyalty:submitted','loyalty_program',$2)",[u.id,r.rows[0].id]);await tx.query('COMMIT');return reply({ok:true});
  }catch{await tx.query('ROLLBACK');return reply({error:'Treuekarte konnte nicht gespeichert werden'},500)}finally{tx.release()}
 }
 if(d.action==='review_program'){
  if(!canAdmin(u,'marketing'))return reply({error:'Marketingberechtigung erforderlich'},403);
  if(!z.uuid().safeParse(d.id).success||typeof d.approve!=='boolean'||typeof d.reason!=='string'||d.reason.trim().length<10||d.reason.length>500)return reply({error:'Programm und Prüfgrund erforderlich'},400);
  const tx=await pool.connect();try{await tx.query('BEGIN');
   const r=await tx.query("UPDATE loyalty_programs SET status=$2,first_active_at=CASE WHEN $2='published' THEN coalesce(first_active_at,now()) ELSE first_active_at END,review_note=$3,updated_at=now() WHERE id=$1 RETURNING id",[d.id,d.approve?'published':'rejected',d.reason]);if(!r.rowCount){await tx.query('ROLLBACK');return reply({error:'Programm nicht gefunden'},404)}
   await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'loyalty_program',$3)",[u.id,d.approve?'loyalty:approved':'loyalty:rejected',d.id]);await tx.query('COMMIT');return reply({ok:true});
  }catch{await tx.query('ROLLBACK');return reply({error:'Prüfung fehlgeschlagen'},500)}finally{tx.release()}
 }
 if(d.action==='request_visit'||d.action==='request_reward'){
  if(!z.uuid().safeParse(d.place_id).success||d.action==='request_reward'&&!z.uuid().safeParse(d.card_id).success)return reply({error:'Ort oder Treuekarte ungültig'},400);
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
   const place=(await tx.query("SELECT p.business_id,b.owner_id FROM places p JOIN businesses b ON b.id=p.business_id WHERE p.id=$1 AND p.status='published' AND b.status='approved'",[d.place_id])).rows[0];
   if(!place){await tx.query('ROLLBACK');return reply({error:'Kein freigegebener Standort'},404)}
   const staff=await tx.query('SELECT 1 FROM business_team_members WHERE business_id=$1 AND user_id=$2',[place.business_id,u.id]);
   if(place.owner_id===u.id||staff.rowCount){await tx.query('ROLLBACK');return reply({error:'Keine eigenen Besuche für den Betrieb bestätigen lassen'},403)}
   const count=(await tx.query("SELECT count(*)::int AS n FROM visit_confirmation_requests WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[u.id])).rows[0].n;if(count>=5){await tx.query('ROLLBACK');return reply({error:'Bitte später erneut versuchen'},429)}
   if(d.action==='request_reward'){
    const card=await tx.query('SELECT c.id FROM loyalty_cards c JOIN loyalty_programs p ON p.id=c.program_id WHERE c.id=$1 AND c.user_id=$2 AND c.redeemed_at IS NULL AND p.business_id=$3 AND (SELECT count(*) FROM loyalty_card_visits cv WHERE cv.card_id=c.id)>=c.goal FOR SHARE',[d.card_id,u.id,place.business_id]);
    if(!card.rowCount){await tx.query('ROLLBACK');return reply({error:'Vorteil noch nicht einlösbar'},409)}
   }
   if(d.action==='request_visit'){
    const recent=await tx.query("SELECT id FROM confirmed_visits WHERE user_id=$1 AND business_id=$2 AND confirmed_at>now()-(coalesce((SELECT c.minimum_hours FROM loyalty_cards c JOIN loyalty_programs lp ON lp.id=c.program_id WHERE c.user_id=$1 AND lp.business_id=$2 AND c.redeemed_at IS NULL LIMIT 1),(SELECT minimum_hours FROM loyalty_programs WHERE business_id=$2 AND status='published'),24)::int*interval '1 hour') LIMIT 1",[u.id,place.business_id]);
    if(recent.rowCount){await tx.query('ROLLBACK');return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)}
   }
   const code=randomBytes(12).toString('hex').toUpperCase(),hash=createHash('sha256').update(code).digest('hex');
   const r=await tx.query('INSERT INTO visit_confirmation_requests(token_hash,user_id,place_id,business_id,kind,card_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING expires_at',[hash,u.id,d.place_id,place.business_id,d.action==='request_reward'?'reward':'visit',d.action==='request_reward'?d.card_id:null]);
   await tx.query('COMMIT');return reply({code,expires_at:r.rows[0].expires_at,notice:'Nur dem Betrieb vor Ort zeigen. Zehn Minuten gültig.'},201);
  }catch{await tx.query('ROLLBACK');return reply({error:'Code konnte nicht erstellt werden'},500)}finally{tx.release()}
 }
 if(d.action==='confirm'){
  const code=typeof d.code==='string'?d.code.replace(/[\s-]/g,'').toUpperCase():'';if(!/^[A-F0-9]{24}$/.test(code))return reply({error:'Code prüfen'},400);
  const tx=await pool.connect();try{await tx.query('BEGIN');
   const request=(await tx.query('SELECT * FROM visit_confirmation_requests WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[createHash('sha256').update(code).digest('hex')])).rows[0];
   if(!request){await tx.query('ROLLBACK');return reply({error:'Code ungültig, abgelaufen oder bereits verwendet'},409)}
   const company=await resolveBusinessEditor(u,request.place_id);
   if(!company||company.id!==request.business_id||company.status!=='approved'||request.user_id===u.id){await tx.query('ROLLBACK');return reply({error:'Kein Bestätigungsrecht an diesem Standort'},403)}
   await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[request.user_id]);
   if(request.kind==='reward'){
    const card=(await tx.query('SELECT c.* FROM loyalty_cards c JOIN loyalty_programs p ON p.id=c.program_id WHERE c.id=$1 AND c.user_id=$2 AND p.business_id=$3 AND c.redeemed_at IS NULL FOR UPDATE OF c',[request.card_id,request.user_id,request.business_id])).rows[0];
    const visits=card?Number((await tx.query('SELECT count(*)::int AS n FROM loyalty_card_visits WHERE card_id=$1',[card.id])).rows[0].n):0;
    if(!card||visits<card.goal){await tx.query('ROLLBACK');return reply({error:'Vorteil bereits eingelöst oder noch nicht erreicht'},409)}
    await tx.query('UPDATE loyalty_cards SET redeemed_at=now(),redeemed_by=$2 WHERE id=$1',[card.id,u.id]);
   }else{
    const recent=await tx.query("SELECT id FROM confirmed_visits WHERE user_id=$1 AND business_id=$2 AND confirmed_at>now()-(coalesce((SELECT c.minimum_hours FROM loyalty_cards c JOIN loyalty_programs lp ON lp.id=c.program_id WHERE c.user_id=$1 AND lp.business_id=$2 AND c.redeemed_at IS NULL LIMIT 1),(SELECT minimum_hours FROM loyalty_programs WHERE business_id=$2 AND status='published'),24)::int*interval '1 hour') LIMIT 1",[request.user_id,request.business_id]);
    if(recent.rowCount){await tx.query('ROLLBACK');return reply({error:'Mindestabstand zum letzten bestätigten Besuch noch nicht erreicht'},409)}
    await tx.query('INSERT INTO confirmed_visits(user_id,place_id,business_id,confirmed_by) VALUES($1,$2,$3,$4)',[request.user_id,request.place_id,request.business_id,u.id]);
   }
   await tx.query('UPDATE visit_confirmation_requests SET used_at=now() WHERE id=$1',[request.id]);
   await allocateLoyaltyVisits(tx,request.user_id,request.business_id);
   await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'visit_confirmation',$3)",[u.id,request.kind==='reward'?'loyalty:redeemed':'visit:business-confirmed',request.id]);
   await tx.query('COMMIT');return reply({ok:true,kind:request.kind,notice:request.kind==='reward'?'Vorteil einmalig eingelöst.':'Besuch vom Betrieb bestätigt.'});
  }catch{await tx.query('ROLLBACK');return reply({error:'Bestätigung konnte nicht gespeichert werden'},500)}finally{tx.release()}
 }
 return reply({error:'Aktion ungültig'},400);
}
