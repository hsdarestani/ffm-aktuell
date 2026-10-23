import {NextRequest,NextResponse} from 'next/server';
import {query,pool} from '@/lib/db';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
export const dynamic='force-dynamic';
const independentSource=(s:string)=>{
 try{const u=new URL(s);const host=u.hostname.replace(/^www\./,'').toLowerCase();
 return u.protocol==='https:'&&s.length<1000&&!!host&&!['openstreetmap.org','osm.org','google.com','instagram.com','facebook.com'].some(d=>host===d||host.endsWith('.'+d));}
 catch{return false}
};
export async function GET(){
 const r=await query(`SELECT id,name,category,district,address,image_url,opened_at,opening_source_url
 FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating'
 AND verified_at BETWEEN now()-interval '30 days' AND now()
 AND opened_at BETWEEN (CURRENT_DATE-interval '90 days') AND CURRENT_DATE
 AND opening_source_url IS NOT NULL ORDER BY opened_at DESC,name LIMIT 16`);
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'public, max-age=90'}});
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Redaktion erforderlich'},{status:403});
 const b=await req.json().catch(()=>null);
 if(!b||typeof b.place_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.place_id)||typeof b.opened_at!=='string'||typeof b.source_url!=='string'||
  !/^20\d{2}-\d{2}-\d{2}$/.test(b.opened_at)||!Number.isFinite(Date.parse(b.opened_at))||
  new Date(b.opened_at+'T12:00:00Z').toISOString().slice(0,10)!==b.opened_at||
  b.opened_at>new Date().toISOString().slice(0,10)||!independentSource(b.source_url)||
  typeof b.note!=='string'||b.note.trim().length<20||b.note.length>500)
  return NextResponse.json({error:'Datum, Quelle und Prüfnotiz erforderlich'},{status:400});
 const tx=await pool.connect();try{
  await tx.query('BEGIN');
  const place=await tx.query(`UPDATE places SET opened_at=$2::date,opening_source_url=$3,updated_at=now()
   WHERE id=$1 AND status='published' AND verification_status='verified' AND activity_status='operating'
   AND verified_at BETWEEN now()-interval '30 days' AND now() RETURNING id`,[b.place_id,b.opened_at,b.source_url]);
  if(!place.rowCount){await tx.query('ROLLBACK');return NextResponse.json({error:'Ort ist nicht aktuell unabhängig verifiziert'},{status:409})}
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place',$3)",[u.id,'new-opening:'+b.opened_at+':'+b.note.trim().slice(0,200),b.place_id]);
  await tx.query('COMMIT');return NextResponse.json({ok:true});
 }catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Speichern fehlgeschlagen'},{status:500})}finally{tx.release()}
}
