import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {query,reserveTextRequest,textJSON} from '@/lib/text-provider';
import {z} from 'zod';
export const dynamic='force-dynamic';
const reply=(d:unknown,status=200)=>NextResponse.json(d,{status,headers:{'Cache-Control':'private,no-store'}});
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return reply({error:'Ungültige Herkunft'},403);
 const u=await sessionUser(req);if(!u)return reply({error:'Bitte anmelden'},401);
 const parsed=z.object({post_id:z.uuid(),language:z.enum(['de','en']),consent:z.literal(true)}).safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:'Beitrag, Sprache und Zustimmung erforderlich'},400);
 const d=parsed.data,post=(await query("SELECT body FROM posts WHERE id=$1 AND status='published'",[d.post_id])).rows[0];if(!post)return reply({error:'Beitrag nicht verfügbar'},404);
 if(typeof post.body!=='string'||!post.body.trim()||post.body.length>4000)return reply({error:'Beitrag kann nicht übersetzt werden'},400);
 const hash=createHash('sha256').update(post.body).digest('hex');
 const cached=(await query('SELECT body FROM post_translations WHERE post_id=$1 AND language=$2 AND source_hash=$3',[d.post_id,d.language,hash])).rows[0];if(cached)return reply({text:cached.body,machine_translated:true});
 if(!process.env.OPENAI_API_KEY)return reply({error:'Übersetzungsdienst noch nicht eingerichtet'},503);
 if(!await reserveTextRequest(u.id,'translation'))return reply({error:'Übersetzungslimit erreicht. Bitte später erneut versuchen.'},429);
 try{const result=await textJSON('Translate only the supplied public post into '+(d.language==='de'?'German':'English')+'. Preserve meaning and uncertainty. Add no facts or advice. Return JSON {"text":"plain translated text"}. No HTML or markup.',{text:post.body});
 const translated=result.text;if(typeof translated!=='string'||!translated.trim()||translated.length>12000||/[<>]/.test(translated))throw Error('Invalid translation');
 // Recheck moderation and source version before retaining or displaying provider output.
 const current=(await query("SELECT body FROM posts WHERE id=$1 AND status='published'",[d.post_id])).rows[0];if(current?.body!==post.body)return reply({error:'Beitrag wurde geändert. Bitte neu laden.'},409);
 await query('INSERT INTO post_translations(post_id,language,source_hash,body) VALUES($1,$2,$3,$4) ON CONFLICT(post_id,language) DO UPDATE SET source_hash=excluded.source_hash,body=excluded.body,created_at=now()',[d.post_id,d.language,hash,translated.trim()]);return reply({text:translated.trim(),machine_translated:true});
 }catch{return reply({error:'Übersetzung derzeit nicht möglich. Der Originaltext bleibt verfügbar.'},503)}
}
