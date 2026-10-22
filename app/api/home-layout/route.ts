import {NextRequest,NextResponse} from 'next/server';
import {query,pool} from '@/lib/db';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {defaultHomeLayout,validHomeLayout} from '@/lib/home-layout';
export const dynamic='force-dynamic';
export async function GET(){const row=(await query('SELECT modules FROM home_layout WHERE id=1')).rows[0];return NextResponse.json({modules:validHomeLayout(row?.modules)?row.modules:defaultHomeLayout},{headers:{'Cache-Control':'no-store'}})}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});const u=await sessionUser(req);if(!u||!canAdmin(u,'editorial'))return NextResponse.json({error:'Redaktionsberechtigung erforderlich'},{status:403});
 const d=await req.json().catch(()=>null);if(!validHomeLayout(d?.modules))return NextResponse.json({error:'Alle sechs Module mit eindeutiger Reihenfolge und Sichtbarkeit erforderlich'},{status:400});
 const tx=await pool.connect();try{await tx.query('BEGIN');const before=(await tx.query('SELECT modules FROM home_layout WHERE id=1 FOR UPDATE')).rows[0];await tx.query('UPDATE home_layout SET modules=$1,updated_at=now(),updated_by=$2 WHERE id=1',[JSON.stringify(d.modules),u.id]);await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'home_layout','1')",[u.id,'home:layout:'+JSON.stringify({before:before?.modules,after:d.modules})]);await tx.query('COMMIT');return NextResponse.json({success:true})}catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Startseite nicht gespeichert'},{status:500})}finally{tx.release()}
}
