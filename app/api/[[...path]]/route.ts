import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {query} from '@/lib/db';
import {beginSession,endSession,hashPassword,verifyPassword,sessionUser,trustedOrigin,User} from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{path?:string[]}>};
const ok=(data:unknown,status=200)=>NextResponse.json(data,{status});
const bad=(message:string,status=400)=>ok({error:message},status);
const email=z.email().max(254);
const id=z.uuid();
const url=z.url().max(1000);
const trim=(v:unknown)=>typeof v==='string'?v.trim():'';
const text=(n:number)=>z.string().trim().min(1).max(n);
const optionalText=(n:number)=>z.string().trim().max(n).optional().default('');
const allowedUrl=(v:unknown)=>{const s=trim(v);if(!s)return null;try{let u=new URL(s);return ['http:','https:'].includes(u.protocol)?u.toString():null;}catch{return null;}};
function parse<T>(schema:z.ZodSchema<T>,body:unknown):T{const r=schema.safeParse(body);if(!r.success)throw Error('Invalid fields: '+r.error.issues.map(x=>x.path.join('.')).join(', '));return r.data;}
async function payload(req:NextRequest){try{return await req.json();}catch{throw Error('Invalid JSON');}}
function need(user:User|null){if(!user)throw Object.assign(new Error('Login required'),{status:401});return user;}
function admin(user:User|null){const u=need(user);if(u.role!=='admin')throw Object.assign(new Error('Admin required'),{status:403});return u;}
function pageNumber(s:string|null){return Math.min(Math.max(Number(s)||1,1),50);}
const limits=new Map<string,{count:number,expires:number}>();
function rate(req:NextRequest,action:string){const key=action+':'+(req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown');const now=Date.now();let v=limits.get(key);if(!v||v.expires<now)v={count:0,expires:now+15*60*1000};v.count++;limits.set(key,v);if(v.count>30)throw Object.assign(new Error('Too many requests, try later'),{status:429});if(limits.size>10000)for(const [k,v]of limits){if(v.expires<now)limits.delete(k);}}
async function ownBusiness(u:User){const r=await query('SELECT * FROM businesses WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1',[u.id]);if(!r.rows[0])throw Object.assign(new Error('Register a business first'),{status:403});return r.rows[0];}
async function audit(u:User,action:string,type:string,target:string){await query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,action,type,target]);}
async function handler(req:NextRequest,ctx:Ctx,method:'GET'|'POST'|'PATCH'){
 try{
  const parts=(await ctx.params).path||[];
  const path=parts.join('/');
  const qs=req.nextUrl.searchParams;
  if(method!=='GET'&&!trustedOrigin(req))return bad('Invalid request origin',403);
  if(method==='GET'&&path==='health'){
    await query('SELECT 1');return ok({status:'ok',service:'ffm-aktuell'});
  }
  if(method==='POST'&&path==='auth/register'){
    rate(req,'register');
    const b=parse(z.object({email:email,password:z.string().min(12).max(128),display_name:text(80)}),await payload(req));
    const found=await query('SELECT id FROM users WHERE email=$1',[b.email.toLowerCase()]);if(found.rowCount)return bad('Email already registered',409);
    const r=await query('INSERT INTO users(email,password_hash,display_name) VALUES($1,$2,$3) RETURNING id',[b.email.toLowerCase(),hashPassword(b.password),b.display_name]);
    const res=ok({success:true},201);await beginSession(r.rows[0].id,res);return res;
  }
  if(method==='POST'&&path==='auth/login'){
    rate(req,'login');
    const b=parse(z.object({email:email,password:z.string()}),await payload(req));
    const r=await query('SELECT id,password_hash FROM users WHERE email=$1',[b.email.toLowerCase()]);
    if(!r.rows[0]||!verifyPassword(b.password,r.rows[0].password_hash))return bad('Invalid credentials',401);
    const res=ok({success:true});await beginSession(r.rows[0].id,res);return res;
  }
  if(method==='POST'&&path==='auth/logout'){
    const res=ok({success:true});await endSession(req,res);return res;
  }
  const user=await sessionUser(req);
  if(method==='GET'&&path==='me')return ok({user});
  if(method==='GET'&&path==='places'){
    const category=trim(qs.get('category'));const district=trim(qs.get('district'));const search=trim(qs.get('q'));
    const mode=trim(qs.get('mode'));
    if(mode&&mode!=='verified'&&mode!=='top')return bad('Unbekannter Ansichtsmodus');
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text FROM places WHERE status='published' AND activity_status!='permanently_closed' AND ($1='' OR category=$1) AND ($2='' OR district=$2) AND ($3='' OR (name||' '||description_de||' '||district) ILIKE '%'||$3||'%') AND ($4='' OR (verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() AND ($4!='top' OR editorial_rank>0))) ORDER BY CASE WHEN verification_status='verified' AND activity_status='operating' AND verified_at > now()-interval '30 days' THEN 0 ELSE 1 END, editorial_rank DESC, name LIMIT 80",[category,district,search.slice(0,100),mode]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='discovery'){
    const category=trim(qs.get('category')).slice(0,70);
    const search=trim(qs.get('q')).slice(0,90);
    const requested=Number(qs.get('limit')||48);
    const limit=Number.isFinite(requested)?Math.max(1,Math.min(100,Math.floor(requested))):48;
    const requestedOffset=Number(qs.get('offset')||0);
    const offset=Number.isFinite(requestedOffset)?Math.max(0,Math.min(10000,Math.floor(requestedOffset))):0;
    const bounds=trim(qs.get('bbox')).split(',').map(Number);
    const hasBBox=bounds.length===4&&bounds.every(Number.isFinite)&&
      bounds[0]>=8.2&&bounds[2]<=9.1&&bounds[1]>=49.7&&bounds[3]<=50.4&&
      bounds[0]<bounds[2]&&bounds[1]<bounds[3];
    if(qs.has('bbox')&&!hasBBox)return bad('Ungültiger Kartenausschnitt');
    const params=[category,search,hasBBox?bounds[0]:null,hasBBox?bounds[1]:null,hasBBox?bounds[2]:null,hasBBox?bounds[3]:null,limit,offset];
    const where="WHERE reviewed_status='unverified' AND ($1='' OR category=$1) AND ($2='' OR name ILIKE '%'||$2||'%' OR address ILIKE '%'||$2||'%') AND ($3::float8 IS NULL OR (longitude BETWEEN $3 AND $5 AND latitude BETWEEN $4 AND $6))";
    const [r,n]=await Promise.all([
      query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,last_osm_check,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates "+where+" ORDER BY category,name,osm_id LIMIT $7 OFFSET $8",params),
      query("SELECT count(*)::int AS count FROM discovery_candidates "+where,params.slice(0,6))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.count||0,limit,offset,source:'© OpenStreetMap-Mitwirkende · ODbL',verified:false,openingNowAvailable:false});
  }
  if(method==='GET'&&path==='discovery-map'){
    const raw=trim(qs.get('bbox')).split(',').map(Number);
    if(raw.length!==4||raw.some(v=>!Number.isFinite(v))||
      raw[0]<8.2||raw[2]>9.1||raw[1]<49.7||raw[3]>50.4||raw[0]>=raw[2]||raw[1]>=raw[3])
      return bad('Kartenausschnitt ungültig');
    const cat=trim(qs.get('category'));
    const validCategory=cat==='Apotheken Notdienst'?'Apotheken':cat;
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='posts'){const r=await query("SELECT p.id,p.body,p.media_url,p.created_at,u.display_name,pl.name AS place_name FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN places pl ON pl.id=p.place_id WHERE p.status='published' ORDER BY p.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='favorites'){const u=need(user);const r=await query('SELECT place_id FROM favorites WHERE user_id=$1',[u.id]);return ok({items:r.rows.map(x=>x.place_id)});}
  if(method==='POST'&&path==='favorites'){
    const u=need(user);const b=parse(z.object({place_id:id,active:z.boolean()}),await payload(req));
    if(b.active)await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING",[u.id,b.place_id]);
    else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    return ok({success:true});
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);const b=parse(z.object({body:text(1000),place_id:id.nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    const r=await query("INSERT INTO posts(user_id,place_id,body,media_url) VALUES($1,$2,$3,$4) RETURNING id",[u.id,b.place_id||null,b.body,media]);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='GET'&&path==='businesses'){const u=need(user);const r=await query('SELECT * FROM businesses WHERE owner_id=$1 ORDER BY created_at DESC',[u.id]);return ok({items:r.rows});}
  if(method==='POST'&&path==='businesses'){
    rate(req,'business');const u=need(user);const b=parse(z.object({name:text(150),registry_reference:optionalText(200)}),await payload(req));
    const r=await query("INSERT INTO businesses(owner_id,name,registry_reference) VALUES($1,$2,$3) RETURNING id,status",[u.id,b.name,b.registry_reference]);return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='claims'){
    const u=need(user),business=await ownBusiness(u);const b=parse(z.object({place_id:id,note:optionalText(500)}),await payload(req));
    const r=await query('INSERT INTO claims(business_id,place_id,note) VALUES($1,$2,$3) ON CONFLICT(business_id,place_id) DO UPDATE SET note=EXCLUDED.note,status=$4 RETURNING id,status',[business.id,b.place_id,b.note,'pending']);return ok(r.rows[0],201);
  }
  if(method==='GET'&&path==='business/overview'){
    const u=need(user),b=await ownBusiness(u);
    const [p,d,c]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows});
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published']} as const;
    const [table,yes]=map[b.type];const target=b.approve?yes:'rejected';
    if(b.type==='claim'&&b.approve){
      const claim=await query('SELECT business_id,place_id FROM claims WHERE id=$1',[b.id]);
      if(!claim.rowCount)return bad('Claim not found',404);
      const targetPlace=await query('SELECT business_id FROM places WHERE id=$1',[claim.rows[0].place_id]);
      if(targetPlace.rows[0]?.business_id && targetPlace.rows[0].business_id!==claim.rows[0].business_id)return bad('Already owned',409);
      const bstatus=await query("SELECT id FROM businesses WHERE id=$1 AND status='approved'",[claim.rows[0].business_id]);
      if(!bstatus.rowCount)return bad('Approve business first',409);
      await query('UPDATE places SET business_id=$1 WHERE id=$2',[claim.rows[0].business_id,claim.rows[0].place_id]);
    }
    const r=await query('UPDATE '+table+' SET status=$1 WHERE id=$2 RETURNING id',[target,b.id]);
    if(!r.rowCount)return bad('Not found',404);
    await audit(u,'review:'+target,b.type,b.id);return ok({success:true});
  }
  if(method==='POST'&&path==='admin/verify-place'){
    const u=admin(user);
    const b=parse(z.object({
      id,activity_status:z.enum(['unknown','operating','temporarily_closed','permanently_closed']),
      verification_source:z.url().max(1000),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=allowedUrl(b.verification_source);
    if(!source)return bad('Eine überprüfbare Quelle ist erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text]);
    if(!r.rowCount)return bad('Ort nicht gefunden',404);
    await audit(u,'verify:source-reviewed','place',b.id);
    return ok({success:true,verification_status:'verified'});
  }
  if(method==='POST'&&path==='admin/dispute-place'){
    const u=admin(user);
    const b=parse(z.object({id,reason:text(500)}),await payload(req));
    const r=await query("UPDATE places SET verification_status='disputed',editorial_rank=0,updated_at=now() WHERE id=$1 RETURNING id",[b.id]);
    if(!r.rowCount)return bad('Ort nicht gefunden',404);
    await audit(u,'dispute:'+b.reason,'place',b.id);return ok({success:true});
  }
  if(method==='POST'&&path==='admin/places'){
    const u=admin(user);
    const b=parse(z.object({name:text(150),category:text(80),district:optionalText(100),description_de:optionalText(2000),description_en:optionalText(2000),address:optionalText(200),latitude:z.number().min(-90).max(90).nullish(),longitude:z.number().min(-180).max(180).nullish(),website:z.string().max(1000).optional(),source_url:z.string().max(1000).optional()}),await payload(req));
    if((b.website&&!allowedUrl(b.website))||(b.source_url&&!allowedUrl(b.source_url)))return bad('Invalid URL');
    const r=await query("INSERT INTO places(name,category,district,description_de,description_en,address,latitude,longitude,website,source_url,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'published') RETURNING id",[b.name,b.category,b.district,b.description_de,b.description_en,b.address,b.latitude||null,b.longitude||null,b.website||null,b.source_url||null]);
    await audit(u,'create','place',r.rows[0].id);return ok({id:r.rows[0].id},201);
  }
  if(method==='POST'&&path==='admin/events'){
    const u=admin(user);const b=parse(z.object({title:text(150),description_de:optionalText(3000),description_en:optionalText(3000),venue:text(150),starts_at:z.iso.datetime({offset:true}),ticket_url:z.string().optional()}),await payload(req));
    if(b.ticket_url&&!allowedUrl(b.ticket_url))return bad('Invalid link');
    const r=await query("INSERT INTO events(title,description_de,description_en,venue,starts_at,ticket_url,status) VALUES($1,$2,$3,$4,$5,$6,'published') RETURNING id",[b.title,b.description_de,b.description_en,b.venue,b.starts_at,b.ticket_url||null]);
    await audit(u,'create','event',r.rows[0].id);return ok({id:r.rows[0].id},201);
  }
  if(method==='POST'&&path==='admin/news'){
    const u=admin(user);const b=parse(z.object({title:text(150),body_de:optionalText(10000),body_en:optionalText(10000),source_url:z.string().optional()}),await payload(req));
    if(b.source_url&&!allowedUrl(b.source_url))return bad('Invalid link');
    const r=await query("INSERT INTO news(title,body_de,body_en,source_url,status) VALUES($1,$2,$3,$4,'published') RETURNING id",[b.title,b.body_de,b.body_en,b.source_url||null]);
    await audit(u,'create','news',r.rows[0].id);return ok({id:r.rows[0].id},201);
  }
  return bad('Not found',404);
 }catch(e:unknown){const err=e as {message?:string,status?:number,code?:string};
  if(err?.code==='23505')return bad('Already exists',409);
  const status=err?.status||(/Invalid|fields|JSON/.test(err?.message||'')?400:500);
  if(status>=500)console.error('API internal error',e);
  return bad(status>=500?'Temporary server error':(err?.message||'Request failed'),status);
 }
}
export const GET=(req:NextRequest,ctx:Ctx)=>handler(req,ctx,'GET');
export const POST=(req:NextRequest,ctx:Ctx)=>handler(req,ctx,'POST');
export const PATCH=(req:NextRequest,ctx:Ctx)=>handler(req,ctx,'PATCH');
