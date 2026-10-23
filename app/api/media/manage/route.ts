import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
import {remove} from '@/lib/media-storage';
export const runtime='nodejs';
const uuid=/^[0-9a-f-]{36}$/;
export async function DELETE(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Anfrage'},{status:403});
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Anmeldung erforderlich'},{status:401});
 const data=await req.json().catch(()=>null);
 if(!uuid.test(data?.id||''))return NextResponse.json({error:'Ungültige Datei'},{status:400});
 // Cascading rights grants/highlights/stories make withdrawn media unavailable
 // immediately, including when a public link was saved earlier.
 const r=await query('DELETE FROM user_media WHERE id=$1 AND owner_id=$2 RETURNING storage_key',[data.id,u.id]);
 if(!r.rowCount)return NextResponse.json({error:'Datei nicht gefunden'},{status:404});
 await remove(r.rows[0].storage_key);
 await query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'media:user-deleted','media',$2)",[u.id,data.id]);
 return NextResponse.json({deleted:true},{headers:{'Cache-Control':'no-store'}});
}
