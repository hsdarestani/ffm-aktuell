import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query} from '@/lib/db';
import {processMedia,save,remove,MAX,TYPES} from '@/lib/media-storage';
export const runtime='nodejs';export const dynamic='force-dynamic';
const fail=(error:string,status:number)=>NextResponse.json({error},{status});
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
 const user=await sessionUser(req);if(!user)return fail('Anmeldung erforderlich',401);
 if(Number(req.headers.get('content-length')||0)>MAX+500000)return fail('Datei zu groß',413);
 const limit=await query("SELECT count(*)::int AS n FROM user_media WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",[user.id]);
 if(limit.rows[0].n>=8)return fail('Upload Limit erreicht',429);
 const data=await req.formData().catch(()=>null);
 const file=data?.get('file');
 if(!(file instanceof File)||!TYPES.includes(file.type))return fail('Nur JPG, PNG, WebP, MP4 oder WebM',415);
 if(file.size<16||file.size>MAX)return fail('Datei zu groß',413);
 if(data?.get('license_confirmed')!=='true')return fail('Bitte Medienrechte bestätigen',400);
 let key='';
 try{
  const safe=await processMedia(Buffer.from(await file.arrayBuffer()),file.type);
  key=await save(safe.bytes);
  const r=await query('INSERT INTO user_media(owner_id,media_type,size_bytes,storage_key,sha256,license_confirmed) VALUES($1,$2,$3,$4,$5,true) RETURNING id',[user.id,safe.mime,safe.bytes.length,key,safe.hash]);
  return NextResponse.json({id:r.rows[0].id,status:'pending',message:'Datei geprüft; redaktionelle Freigabe steht aus.'},{status:201});
 }catch(err){if(key)await remove(key);return fail(err instanceof Error?err.message:'Upload fehlgeschlagen',process.env.CLAMD_HOST?400:503)}
}
