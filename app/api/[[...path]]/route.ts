import {NextRequest,NextResponse} from 'next/server';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {pool,query} from '@/lib/db';
import {beginSession,endSession,hashPassword,verifyPassword,sessionUser,trustedOrigin,User} from '@/lib/auth';
import {validLocationId,osmId} from '@/lib/location-actions';
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
// A source link is not proof on its own: the editor must also attest an actual check.
function independentProof(raw:unknown){
 const clean=allowedUrl(raw);
 if(!clean)return null;
 const u=new URL(clean);
 if(u.protocol!=='https:')return null;
 const host=u.hostname.toLowerCase().replace(/^www\./,'');
 if(['openstreetmap.org','osm.org','overpass-api.de','geofabrik.de','google.com','maps.google.com','yelp.com','tripadvisor.com','facebook.com','instagram.com'].some(d=>host===d||host.endsWith('.'+d)))return null;
 return clean;
}
function conflict(message:string){return Object.assign(new Error(message),{status:409});}
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
  if(method==='POST'&&path==='admin/activate'){
    rate(req,'admin-activate');
    const input=await payload(req) as Record<string,unknown>|null;
    const pw=input?.password;
    // User-friendly German error for mobile autofill / direct API requests.
    if(typeof pw!=='string'||pw.length<16)return bad('Das Passwort muss mindestens 16 Zeichen lang sein.');
    if(pw.length>128)return bad('Das Passwort darf höchstens 128 Zeichen lang sein.');
    const b=parse(z.object({
      token:z.string().min(36).max(100),
      email:email,
      display_name:z.string().trim().min(2).max(80).default('FFM Redaktion'),
      password:z.string().min(16).max(128)
    }),input);
    const digest=createHash('sha256').update(b.token).digest('hex');
    const client=await pool.connect();
    let accountId:string;
    // The invitation, user, audit and first session must succeed or fail together.
    // Creating a session after COMMIT can otherwise consume the one-use invite
    // while returning HTTP 500 and leaving the new administrator locked out.
    const sessionToken=randomBytes(32).toString('hex');
    const sessionHash=createHash('sha256').update(sessionToken).digest('hex');
    try{
      await client.query('BEGIN');
      const invite=await client.query('SELECT token_hash FROM admin_invites WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',[digest]);
      if(!invite.rowCount){await client.query('ROLLBACK');return bad('Einladungslink ist ungültig, abgelaufen oder verbraucht.',403)}
      const created=await client.query(
        "INSERT INTO users(email,password_hash,display_name,role) VALUES($1,$2,$3,'admin') ON CONFLICT(email) DO NOTHING RETURNING id",
        [b.email.trim().toLowerCase(),hashPassword(b.password),b.display_name]);
      if(!created.rowCount){await client.query('ROLLBACK');return bad('E-Mail-Adresse ist bereits vergeben.',409)}
      accountId=created.rows[0].id;
      // Avoid binding one PostgreSQL parameter in both UUID and TEXT columns;
      // that raises SQLSTATE 42P08 (inconsistent parameter types).
      await client.query(
        "INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'admin:one-time-activation','user',$2)",
        [accountId,accountId]);
      await client.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
        [sessionHash,accountId]);
      await client.query('UPDATE admin_invites SET used_at=now() WHERE token_hash=$1',[digest]);
      await client.query('COMMIT');
    }catch(e){
      await client.query('ROLLBACK');
      throw e;
    }finally{client.release()}
    const response=ok({success:true,role:'admin'},201);
    response.cookies.set('ffm_session',sessionToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',
      sameSite:'lax',path:'/',maxAge:60*60*24*30});
    return response;
  }
  if(method==='POST'&&path==='auth/logout'){
    const res=ok({success:true});await endSession(req,res);return res;
  }
  const user=await sessionUser(req);
  if(method==='GET'&&path==='me')return ok({user});
  if(method==='GET'&&path==='me/preferences'){
    const u=need(user);
    const r=await query("SELECT interests,districts,share_activity,notify_events,notify_news,notify_offers FROM user_preferences WHERE user_id=$1",[u.id]);
    return ok({preferences:r.rows[0]||{interests:[],districts:[],share_activity:false,notify_events:false,notify_news:false,notify_offers:false}});
  }
  if(method==='POST'&&path==='me/preferences'){
    rate(req,'user-preferences');const u=need(user);
    const b=parse(z.object({
      interests:z.array(z.string().trim().min(2).max(60)).max(12),
      districts:z.array(z.string().trim().min(2).max(60)).max(12),
      share_activity:z.boolean().default(false),
      notify_events:z.boolean().default(false),
      notify_news:z.boolean().default(false),
      notify_offers:z.boolean().default(false)
    }),await payload(req));
    const clean=(v:string[])=>[...new Set(v)].slice(0,12);
    const r=await query("INSERT INTO user_preferences(user_id,interests,districts,share_activity,notify_events,notify_news,notify_offers) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id) DO UPDATE SET interests=excluded.interests,districts=excluded.districts,share_activity=excluded.share_activity,notify_events=excluded.notify_events,notify_news=excluded.notify_news,notify_offers=excluded.notify_offers,updated_at=now() RETURNING interests,districts,share_activity,notify_events,notify_news,notify_offers",
      [u.id,clean(b.interests),clean(b.districts),b.share_activity,b.notify_events,b.notify_news,b.notify_offers]);
    return ok({preferences:r.rows[0],notice:'Preferences saved. Push notifications are not enabled until a provider is configured.'});
  }
  if(method==='GET'&&path==='me/export'){
    rate(req,'account-export');const u=need(user);
    const [prefs,bookmarks,candidateBookmarks,eventMarks,posts,comments,reviews,tours,follows,businesses]=await Promise.all([
      query('SELECT interests,districts,share_activity,notify_events,notify_news,notify_offers,updated_at FROM user_preferences WHERE user_id=$1',[u.id]),
      query('SELECT place_id,created_at FROM favorites WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT osm_id,created_at FROM candidate_favorites WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT event_id,created_at FROM event_favorites WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT id,place_id,candidate_osm_id,body,media_url,status,created_at FROM posts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT id,post_id,body,status,created_at FROM post_comments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT id,place_id,osm_id,rating,body,status,created_at FROM venue_reviews WHERE user_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT id,title,share_token,created_at FROM user_tours WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 2000',[u.id]),
      query('SELECT followed_id,created_at FROM user_follows WHERE follower_id=$1',[u.id]),
      query('SELECT id,name,status,created_at FROM businesses WHERE owner_id=$1',[u.id])
    ]);
    const response=ok({exported_at:new Date().toISOString(),account:{id:u.id,email:u.email,display_name:u.display_name,language:u.language},
      preferences:prefs.rows[0]||null,favorites:bookmarks.rows,candidate_favorites:candidateBookmarks.rows,
      event_favorites:eventMarks.rows,posts:posts.rows,comments:comments.rows,reviews:reviews.rows,
      tours:tours.rows,followed_people:follows.rows,businesses:businesses.rows});
    response.headers.set('Cache-Control','no-store, private');
    return response;
  }
  if(method==='POST'&&path==='me/delete'){
    rate(req,'account-delete');const u=need(user);
    if(u.role==='admin')return bad('Administrators need an editorial handover before deleting their account',403);
    const owned=await query("SELECT id FROM businesses WHERE owner_id=$1 AND status IN ('approved','suspended') LIMIT 1",[u.id]);
    if(owned.rowCount)return bad('Transfer or close your verified business with support before deleting your account',409);
    const b=parse(z.object({password:z.string().min(1),confirmation:z.literal('KONTO LÖSCHEN')}),await payload(req));
    const saved=await query('SELECT password_hash FROM users WHERE id=$1',[u.id]);
    if(!saved.rowCount||!verifyPassword(b.password,saved.rows[0].password_hash))return bad('Invalid credentials',403);
    // Foreign-key cascades remove private subscriptions, bookmarks, posts, tours,
    // comments, follows, sessions and owned business records. Existing editorial
    // audit entries retain anonymous action history with actor_id NULL.
    await query('DELETE FROM users WHERE id=$1',[u.id]);
    const response=ok({success:true});
    response.cookies.set('ffm_session','',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
    return response;
  }
  if(method==='GET'&&path==='places'){
    const category=trim(qs.get('category'));const district=trim(qs.get('district'));const search=trim(qs.get('q'));
    const mode=trim(qs.get('mode'));
    if(mode&&mode!=='verified'&&mode!=='top')return bad('Unbekannter Ansichtsmodus');
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$5 AND bf.business_id=places.business_id) AS following_business FROM places WHERE status='published' AND activity_status!='permanently_closed' AND ($1='' OR category=$1) AND ($2='' OR district=$2) AND ($3='' OR (name||' '||description_de||' '||district) ILIKE '%'||$3||'%') AND ($4='' OR (verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() AND ($4!='top' OR editorial_rank>0))) ORDER BY CASE WHEN verification_status='verified' AND activity_status='operating' AND verified_at > now()-interval '30 days' THEN 0 ELSE 1 END, editorial_rank DESC, name LIMIT 80",[category,district,search.slice(0,100),mode,user?.id||null]);
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
    // Coordinates are temporary request inputs, never stored on user accounts.
    const near=qs.has('lat')||qs.has('lon');
    const lat=Number(qs.get('lat')),lon=Number(qs.get('lon'));
    const radius=Number(qs.get('radius')||3);
    if(near&&(!qs.has('lat')||!qs.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<49.7||lat>50.4||lon<8.2||lon>9.1||!Number.isFinite(radius)||radius<0.25||radius>12))return bad('Standort oder Umkreis ungültig');
    // Latitude/longitude haversine filter works with existing PostgreSQL without PostGIS.
    const nearClause=(a:number,b:number,c:number)=>' AND (6371 * acos(LEAST(1,GREATEST(-1, SIN(RADIANS(
  }
  if(method==='GET'&&path==='discovery-map'){
    const raw=trim(qs.get('bbox')).split(',').map(Number);
    if(raw.length!==4||raw.some(v=>!Number.isFinite(v))||
      raw[0]<8.2||raw[2]>9.1||raw[1]<49.7||raw[3]>50.4||raw[0]>=raw[2]||raw[1]>=raw[3])
      return bad('Kartenausschnitt ungültig');
    const cat=trim(qs.get('category'));
    const validCategory=cat==='Apotheken Notdienst'?'Apotheken':cat;
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,phone,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  // AI can only reorder independently verified database records; never invent venues.
  if(method==='GET'&&path==='recommendations'){
    rate(req,'recommendations');
    const search=trim(qs.get('q')).slice(0,180);
    const lang=qs.get('lang')==='en'?'en':'de';
    const usePreferences=qs.get('use_interests')==='1'&&!!user;
    let interests:string[]=[];
    if(usePreferences&&user){
      const prefs=await query<{interests:string[]}>('SELECT interests FROM user_preferences WHERE user_id=$1',[user.id]);
      interests=Array.isArray(prefs.rows[0]?.interests)?prefs.rows[0].interests.slice(0,6):[];
    }
    const locations=await query("SELECT id,name,category,district,address,latitude,longitude,description_de,description_en,source_url,verification_source,verified_at FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() ORDER BY editorial_rank DESC,name LIMIT 80");
    const items=locations.rows.filter(p=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude));
    const words=(search+' '+interests.join(' ')).toLocaleLowerCase().split(/[^a-zäöüß0-9]+/i).filter(x=>x.length>=3);
    const ranked=items.map(p=>({p,score:words.reduce((n,w)=>n+([p.name,p.category,p.district,p.description_de,p.description_en].join(' ').toLocaleLowerCase().includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);
    let candidates=ranked.slice(0,6).map(x=>x.p);
    let mode:'editorial'|'ai'='editorial';
    if(search.length>=3&&candidates.length&&process.env.OPENAI_API_KEY){
      try{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),6500);
        try{
          const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,
            headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
            body:JSON.stringify({model:process.env.OPENAI_RECOMMENDATION_MODEL||'gpt-4o-mini',temperature:0,max_tokens:220,response_format:{type:'json_object'},messages:[
              {role:'system',content:'Choose up to 4 ID values ONLY from provided candidates. Return JSON {"ids":["..."]}. Never invent places, live opening hours, prices or availability.'},
              {role:'user',content:JSON.stringify({question:search,interests:usePreferences?interests:[],language:lang,candidates:candidates.map(p=>({id:p.id,name:p.name,category:p.category,district:p.district,description:p.description_de}))})}
            ]})});
          if(response.ok){
            const answer=await response.json();
            const parsed=JSON.parse(answer.choices?.[0]?.message?.content||'{}') as {ids?:unknown};
            if(Array.isArray(parsed.ids)){
              const selected=parsed.ids.filter((id:unknown):id is string=>typeof id==='string').map(id=>candidates.find(p=>p.id===id)).filter((p:unknown)=>!!p).slice(0,4);
              if(selected.length){candidates=selected;mode='ai';}
            }
          }
        }finally{clearTimeout(timer);}
      }catch{ /* Keep deterministic verified-location ranking when AI fails. */ }
    }
    return ok({items:candidates.slice(0,4),mode,notice:items.length?
      (lang==='de'?'Nur unabhängig bestätigte Orte. Öffnungszeiten und Preise beim Anbieter prüfen.':'Only independently verified places. Confirm hours and prices with the venue.'):
      (lang==='de'?'Noch keine aktuell bestätigten Orte. Ungeprüfte OSM Einträge findest du unter Entdecken.':'No recently verified places yet. Unverified OSM places are available under Explore.')});
  }
  if(method==='GET'&&path==='tours/curated'){
    const all=await query("SELECT id,name,category,district,address,latitude,longitude,verified_at FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now() AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY editorial_rank DESC,name LIMIT 80");
    const themes=[
      {id:'klassiker',title:'Frankfurts Klassiker',categories:['Sehenswürdigkeiten','Museen','Kultur']},
      {id:'genuss',title:'Frankfurt genießen',categories:['Cafés','Restaurants','Brunch','Imbiss']},
      {id:'gruen',title:'Natur und Bewegung',categories:['Natur','Freizeit','Sport']}
    ];
    const curated=themes.map(t=>({id:t.id,title:t.title,stops:all.rows.filter(p=>t.categories.includes(p.category)).slice(0,5)})).filter(t=>t.stops.length>=2);
    return ok({items:curated,notice:'Nur unabhängig bestätigte Standorte; Route und Gehzeit nicht vorab geprüft.'});
  }
  if(method==='GET'&&path==='event-favorites'){
    const u=need(user);
    const r=await query("SELECT e.id,e.title,e.venue,e.starts_at,e.description_de,e.ticket_url FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ORDER BY e.starts_at ASC LIMIT 100",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='POST'&&path==='event-favorites'){
    rate(req,'event-favorite');const u=need(user);
    const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
    if(b.active){
      const r=await query("INSERT INTO event_favorites(user_id,event_id) SELECT $1,e.id FROM events e WHERE e.id=$2 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ON CONFLICT DO NOTHING RETURNING event_id",[u.id,b.event_id]);
      if(!r.rowCount){
        const existing=await query('SELECT event_id FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
        if(!existing.rowCount)return bad('Event not available',404);
      }
    }else await query('DELETE FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
    return ok({saved:b.active});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='reviews'){
    const venueId=trim(qs.get('place_id'));
    if(!validLocationId(venueId))return bad('Invalid place ID');
    const isCandidate=osmId.test(venueId);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[venueId]);
    if(!exists.rowCount)return bad('Place not found',404);
    const col=isCandidate?'osm_id':'place_id';
    const [summary,items]=await Promise.all([
      query("SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS average FROM venue_reviews WHERE "+col+"=$1 AND status='published'",[venueId]),
      query("SELECT r.id,r.rating,r.body,r.created_at,LEFT(u.display_name,1) AS display_name FROM venue_reviews r JOIN users u ON u.id=r.user_id WHERE r."+col+"=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30",[venueId])
    ]);
    return ok({summary:summary.rows[0],items:items.rows});
  }
  if(method==='GET'&&path==='posts'){
    const following=qs.get('scope')==='following';
    if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
    if(following&&!user)return bad('Login required',401);
    const r=await query(`SELECT p.id,p.user_id AS author_id,p.body,p.media_url,p.created_at,
      LEFT(u.display_name,1) AS display_name,COALESCE(pl.name,dc.name) AS place_name,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes_count,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.status='published') AS comments_count,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id) AS following_author,
      (p.user_id=$1) AS own_post
      FROM posts p JOIN users u ON u.id=p.user_id
      LEFT JOIN places pl ON pl.id=p.place_id
      LEFT JOIN businesses bu ON bu.id=pl.business_id AND bu.status='approved'
      LEFT JOIN discovery_candidates dc ON dc.osm_id=p.candidate_osm_id
      WHERE p.status='published' AND ($2::boolean IS FALSE OR
        EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id)
        OR (bu.id IS NOT NULL AND EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=bu.id)))
      ORDER BY p.created_at DESC LIMIT 40`,[user?.id||null,following]);
    return ok({items:r.rows,scope:following?'following':'all'});
  }
  if(method==='GET'&&path==='follows'){
    // Only the current user can see their own followed people and businesses.
    const u=need(user);
    const [people,businesses]=await Promise.all([
      query("SELECT uf.followed_id AS id,LEFT(us.display_name,1) AS display_name FROM user_follows uf JOIN users us ON us.id=uf.followed_id WHERE uf.follower_id=$1 ORDER BY uf.created_at DESC LIMIT 100",[u.id]),
      query("SELECT bf.business_id AS id,b.name FROM business_follows bf JOIN businesses b ON b.id=bf.business_id WHERE bf.follower_id=$1 AND b.status='approved' ORDER BY bf.created_at DESC LIMIT 100",[u.id])
    ]);
    return ok({people:people.rows,businesses:businesses.rows});
  }
  if(method==='POST'&&path==='follows'){
    rate(req,'follow');const u=need(user);
    const b=parse(z.object({
      target_type:z.enum(['user','business']),
      target_id:id,
      active:z.boolean()
    }),await payload(req));
    if(b.target_type==='user'){
      if(b.target_id===u.id)return bad('Cannot follow yourself');
      if(b.active){
        const created=await query("INSERT INTO user_follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND EXISTS(SELECT 1 FROM posts WHERE user_id=$2 AND status='published') ON CONFLICT DO NOTHING RETURNING followed_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT followed_id FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Author not available',404);
        }
      }else await query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
    }else{
      if(b.active){
        // Businesses are followable only after approval AND after a location
        // is publicly published; claiming an OSM record does not qualify.
        const created=await query("INSERT INTO business_follows(follower_id,business_id) SELECT $1,b.id FROM businesses b WHERE b.id=$2 AND b.status='approved' AND b.owner_id!=$1 AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published' AND p.activity_status!='permanently_closed') ON CONFLICT DO NOTHING RETURNING business_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT business_id FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Business not available',404);
        }
      }else await query('DELETE FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
    }
    return ok({following:b.active});
  }
  if(method==='GET'&&path==='comments'){
    const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
    const post=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[postId]);
    if(!post.rowCount)return bad('Post not found',404);
    const r=await query("SELECT c.id,c.body,c.created_at,LEFT(u.display_name,1) AS display_name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 60",[postId]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='coupons'){
    const u=need(user);
    const r=await query("SELECT c.id,c.deal_id,c.code,c.created_at,c.redeemed_at,d.title,d.valid_until,b.name AS business_name, (d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now())) AS available FROM coupon_claims c JOIN deals d ON d.id=c.deal_id JOIN businesses b ON b.id=d.business_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100",[u.id]);
    const response=ok({items:r.rows});response.headers.set('Cache-Control','no-store, private');return response;
  }
  if(method==='POST'&&path==='coupons/claim'){
    rate(req,'coupon-claim');const u=need(user);
    const b=parse(z.object({deal_id:id}),await payload(req));
    const found=await query("SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.status='published' AND b.status='approved' AND b.owner_id!=$2 AND (d.valid_until IS NULL OR d.valid_until>now())",[b.deal_id,u.id]);
    if(!found.rowCount)return bad('Coupon not available',404);
    const secret=randomBytes(18).toString('base64url');
    const r=await query("INSERT INTO coupon_claims(deal_id,user_id,code) VALUES($1,$2,$3) ON CONFLICT(deal_id,user_id) DO UPDATE SET deal_id=excluded.deal_id RETURNING code,redeemed_at",
      [b.deal_id,u.id,secret]);
    return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)});
  }
  if(method==='POST'&&path==='business/coupons/redeem'){
    rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
    // Atomic: never allow a second redemption, even on concurrent requests.
    const r=await query("UPDATE coupon_claims c SET redeemed_at=now(),redeemed_by=$2 FROM deals d WHERE c.code=$1 AND c.deal_id=d.id AND d.business_id=$3 AND d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) AND c.redeemed_at IS NULL RETURNING c.id,d.title",
      [b.code,u.id,business.id]);
    if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
    await audit(u,'coupon:redeemed','coupon_claim',r.rows[0].id);
    return ok({success:true,title:r.rows[0].title});
  }
  if(method==='GET'&&path==='location'){
    const place_id=trim(qs.get('id'));
    if(!validLocationId(place_id))return bad('Invalid place ID',400);
    if(osmId.test(place_id)){
      const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'",[place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      return ok({place:r.rows[0]});
    }
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$2 AND bf.business_id=places.business_id) AS following_business FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[place_id,user?.id||null]);
    if(!r.rowCount)return bad('Place not found',404);
    return ok({place:r.rows[0]});
  }
  if(method==='GET'&&path==='tours'){
    const u=need(user);
    const r=await query("SELECT t.id,t.title,t.share_token,t.created_at,t.updated_at,(SELECT count(*)::int FROM tour_stops st WHERE st.tour_id=t.id) AS stop_count FROM user_tours t WHERE t.owner_id=$1 ORDER BY t.updated_at DESC LIMIT 50",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='tours/details'){
    const u=need(user);
    const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
    const r=await query("SELECT id,title,share_token,created_at FROM user_tours WHERE id=$1 AND owner_id=$2",[tourId,u.id]);
    if(!r.rowCount)return bad('Tour not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time
      FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified')
      ORDER BY s.position`,[tourId]);
    return ok({tour:r.rows[0],stops:stops.rows});
  }
  if(method==='GET'&&path==='tours/shared'){
    const token=trim(qs.get('token'));
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
    const r=await query("SELECT id,title FROM user_tours WHERE share_token=$1 AND shared_at IS NOT NULL",[token]);
    if(!r.rowCount)return bad('Tour link not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified') ORDER BY s.position`,[r.rows[0].id]);
    return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true});
  }
  if(method==='POST'&&path==='tours'){
    rate(req,'tour');const u=need(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('save'),id:id.optional(),title:text(100),
        stop_ids:z.array(z.string().refine(validLocationId)).min(2).max(8),
        planned_times:z.array(z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).nullable()).max(8).optional()}),
      z.object({action:z.literal('share'),id,enabled:z.boolean()}),
      z.object({action:z.literal('delete'),id})
    ]),await payload(req));
    if(b.action==='delete'){
      const removed=await query('DELETE FROM user_tours WHERE id=$1 AND owner_id=$2 RETURNING id',[b.id,u.id]);
      if(!removed.rowCount)return bad('Tour not found',404);
      return ok({success:true});
    }
    if(b.action==='share'){
      const token=randomBytes(32).toString('base64url');
      const changed=await query(b.enabled
        ?"UPDATE user_tours SET share_token=coalesce(share_token,$3),shared_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token"
        :"UPDATE user_tours SET share_token=NULL,shared_at=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token",
        b.enabled?[b.id,u.id,token]:[b.id,u.id]);
      if(!changed.rowCount)return bad('Tour not found',404);
      return ok({success:true,token:changed.rows[0].share_token||null});
    }
    if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
    if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
    // Only actual public, geolocated venues may be stops. OSM data remains
    // explicitly unverified and is never silently promoted to a published place.
    for(const stop of b.stop_ids){
      const candidate=osmId.test(stop);
      const available=await query(candidate
        ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified' AND latitude IS NOT NULL AND longitude IS NOT NULL"
        :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed' AND latitude IS NOT NULL AND longitude IS NOT NULL",[stop]);
      if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
    }
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      let tourId=b.id;
      if(tourId){
        const owned=await tx.query('SELECT id FROM user_tours WHERE id=$1 AND owner_id=$2 FOR UPDATE',[tourId,u.id]);
        if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
        await tx.query('UPDATE user_tours SET title=$3,updated_at=now() WHERE id=$1 AND owner_id=$2',[tourId,u.id,b.title]);
        await tx.query('DELETE FROM tour_stops WHERE tour_id=$1',[tourId]);
      }else{
        const created=await tx.query('INSERT INTO user_tours(owner_id,title) VALUES($1,$2) RETURNING id',[u.id,b.title]);
        tourId=created.rows[0].id;
      }
      for(let i=0;i<b.stop_ids.length;i++){
        const stop=b.stop_ids[i],candidate=osmId.test(stop);
        await tx.query('INSERT INTO tour_stops(tour_id,position,place_id,osm_id,planned_time) VALUES($1,$2,$3,$4,$5)',
          [tourId,i+1,candidate?null:stop,candidate?stop:null,b.planned_times?.[i]||null]);
      }
      await tx.query('COMMIT');
      return ok({id:tourId,success:true},b.id?200:201);
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }

  if(method==='GET'&&path==='favorites/details'){
    const u=need(user);
    const [listed,candidates]=await Promise.all([
      query("SELECT p.id,p.name,p.category,p.district,p.address,p.latitude,p.longitude,p.website,p.description_de,p.description_en,p.source_url,p.image_url,p.verification_status,p.activity_status,p.verified_at,p.verification_source,p.opening_hours_text,(SELECT b.id FROM businesses b WHERE b.id=p.business_id AND b.status='approved') AS business_id,EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=p.business_id) AS following_business,f.created_at AS saved_at,false AS candidate FROM favorites f JOIN places p ON p.id=f.place_id WHERE f.user_id=$1 AND p.status='published' AND p.activity_status!='permanently_closed' ORDER BY f.created_at DESC LIMIT 120",[u.id]),
      query("SELECT dc.osm_id AS id,dc.osm_id,dc.name,dc.category,dc.address,dc.latitude,dc.longitude,dc.website,dc.phone,dc.osm_url AS source_url,dc.activity_status,'unverified' AS verification_status,dc.opening_hours AS opening_hours_text,cf.created_at AS saved_at,true AS candidate FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id WHERE cf.user_id=$1 AND dc.reviewed_status='unverified' ORDER BY cf.created_at DESC LIMIT 120",[u.id])
    ]);
    const items=[...listed.rows,...candidates.rows].sort((a,b)=>new Date(b.saved_at).getTime()-new Date(a.saved_at).getTime()).slice(0,120);
    return ok({items});
  }
  if(method==='GET'&&path==='favorites'){
    const u=need(user);
    const [published,candidates]=await Promise.all([
      query('SELECT place_id AS id FROM favorites WHERE user_id=$1',[u.id]),
      query('SELECT osm_id AS id FROM candidate_favorites WHERE user_id=$1',[u.id])
    ]);
    return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)});
  }
  if(method==='POST'&&path==='favorites'){
    const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
    if(osmId.test(b.place_id)){
      if(b.active){
        const r=await query("INSERT INTO candidate_favorites(user_id,osm_id) SELECT $1,osm_id FROM discovery_candidates WHERE osm_id=$2 AND reviewed_status='unverified' ON CONFLICT DO NOTHING RETURNING osm_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT osm_id FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);
    }else{
      if(b.active){
        const r=await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING RETURNING place_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT place_id FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    }
    return ok({success:true});
  }
  if(method==='POST'&&path==='place-reports'){
    rate(req,'place-report');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
      reason:z.enum(['closed','address','details','other']),message:z.string().trim().min(12).max(750)}),await payload(req));
    const isOsm=osmId.test(b.place_id);
    const exists=await query(isOsm?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status!='hidden'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query("INSERT INTO place_reports(user_id,place_id,osm_id,reason,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [u.id,isOsm?null:b.place_id,isOsm?b.place_id:null,b.reason,b.message]);
    await audit(u,'report:submitted','place_report',r.rows[0].id);
    return ok({id:r.rows[0].id,status:r.rows[0].status},201);
  }
  if(method==='POST'&&path==='reviews'){
    rate(req,'venue-review');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
    const isCandidate=osmId.test(b.place_id);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query(isCandidate
      ? "INSERT INTO venue_reviews(user_id,osm_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status"
      : "INSERT INTO venue_reviews(user_id,place_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,place_id) WHERE place_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status",
      [u.id,b.place_id,b.rating,b.body]);
    await audit(u,'review:submitted','venue_review',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='review-reports'){
    rate(req,'review-abuse');const u=need(user);
    const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
    const found=await query("SELECT id FROM venue_reviews WHERE id=$1 AND status='published' AND user_id!=$2",[b.review_id,u.id]);
    if(!found.rowCount)return bad('Review unavailable',404);
    const r=await query("INSERT INTO venue_review_reports(review_id,reporter_id,reason,message) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,reporter_id) DO NOTHING RETURNING id",
      [b.review_id,u.id,b.reason,b.message]);
    if(!r.rowCount)return bad('Already reported',409);
    await audit(u,'review:reported','venue_review',b.review_id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='post-likes'){
    rate(req,'post-like');const u=need(user);
    const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    if(b.active)await query("INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,b.post_id]);
    else await query("DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2",[u.id,b.post_id]);
    const count=await query("SELECT count(*)::int AS count FROM post_likes WHERE post_id=$1",[b.post_id]);
    return ok({success:true,liked:b.active,count:count.rows[0].count});
  }
  if(method==='POST'&&path==='comments'){
    rate(req,'post-comment');const u=need(user);
    const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    const r=await query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id,status",[b.post_id,u.id,b.body]);
    await audit(u,'comment:submitted','post_comment',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);
    const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    let placeId:string|null=null,candidateId:string|null=null;
    if(b.place_id){
      const candidate=osmId.test(b.place_id);
      const r=await query(candidate?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      if(candidate)candidateId=b.place_id;else placeId=b.place_id;
    }
    const r=await query("INSERT INTO posts(user_id,place_id,candidate_osm_id,body,media_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id,placeId,candidateId,b.body,media]);
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
    const [p,d,c,changes]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query("SELECT id,place_id,name,address,phone,website,opening_hours_text,status,submitted_at,editor_note FROM place_change_requests WHERE business_id=$1 ORDER BY submitted_at DESC LIMIT 40",[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows});
  }
  if(method==='POST'&&path==='business/places/change'){
    rate(req,'business-place-change');
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
      website:z.string().trim().max(1000).optional().default(''),phone:z.string().trim().max(40).optional().default(''),
      opening_hours_text:z.string().trim().max(300).optional().default('')}),await payload(req));
    if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
    const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
    const owned=await query("SELECT id FROM places WHERE id=$1 AND business_id=$2 AND status='published'",[b.place_id,business.id]);
    if(!owned.rowCount)return bad('Place not owned',403);
    const r=await query("INSERT INTO place_change_requests(place_id,business_id,submitted_by,name,address,website,phone,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(place_id) WHERE status='pending' DO UPDATE SET submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,website=excluded.website,phone=excluded.phone,opening_hours_text=excluded.opening_hours_text,submitted_at=now() RETURNING id,status",
      [b.place_id,business.id,u.id,b.name,b.address,website,b.phone||null,b.opening_hours_text||null]);
    await audit(u,'business:branch-change-requested','place_change',r.rows[0].id);
    return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }

  if(method==='GET'&&path==='admin/validation'){
    admin(user);
    const [counts,stale]=await Promise.all([
      query(`SELECT
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='unverified') AS kandidaten,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='needs_review') AS rueckfragen,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='hidden') AS ausgeblendet,
        (SELECT count(*)::int FROM discovery_candidates WHERE category='Apotheken') AS apotheken,
        (SELECT count(*)::int FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now()) AS aktuell_geprueft,
        (SELECT count(*)::int FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at < now()-interval '30 days')) AS offen_zur_pruefung`),
      query("SELECT id,name,category,verified_at,verification_source,verification_note FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days') ORDER BY verified_at ASC NULLS FIRST,name LIMIT 25")
    ]);
    return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false});
  }
  if(method==='GET'&&path==='admin/candidates'){
    admin(user);
    const q=trim(qs.get('q')).slice(0,90);
    const cat=trim(qs.get('category')).slice(0,70);
    const state=trim(qs.get('state'))||'unverified';
    if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
    const page=Number(qs.get('page')||0);
    const offset=Number.isFinite(page)?Math.min(Math.max(Math.floor(page),0),1000)*25:0;
    const args=[state,cat,q,offset];
    const where="WHERE reviewed_status=$1 AND ($2='' OR category=$2) AND ($3='' OR name ILIKE '%'||$3||'%' OR address ILIKE '%'||$3||'%')";
    const [r,n]=await Promise.all([
      query("SELECT osm_id,name,category,address,website,phone,opening_hours,last_osm_check,osm_url,latitude,longitude,reviewed_status FROM discovery_candidates "+where+" ORDER BY CASE WHEN website IS NOT NULL AND website!='' THEN 0 ELSE 1 END,category,name,osm_id LIMIT 25 OFFSET $4",args),
      query("SELECT count(*)::int AS total FROM discovery_candidates "+where,args.slice(0,3))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset});
  }
  if(method==='POST'&&path==='admin/review-candidate'){
    const u=admin(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('publish'),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        verification_source:z.url().max(1000),
        verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
        verification_note:z.string().trim().min(25).max(2000),
        confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_operation:z.literal(true),
        editorial_rank:z.number().int().min(0).max(100).default(0),
        opening_hours_text:z.string().trim().max(300).optional().default('')}),
      z.object({action:z.enum(['hide','needs_review']),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        reason:z.string().trim().min(10).max(500)})
    ]),await payload(req));
    const proof=b.action==='publish'?independentProof(b.verification_source):null;
    if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const source=await tx.query("SELECT * FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status IN ('unverified','needs_review') FOR UPDATE",[b.osm_id]);
      const c=source.rows[0];
      if(!c)throw conflict('Eintrag bereits bearbeitet oder nicht gefunden');
      if(b.action==='publish'){
        const duplicate=await tx.query("SELECT id,name FROM places WHERE osm_id=$1 OR (lower(name)=lower($2) AND latitude IS NOT NULL AND longitude IS NOT NULL AND abs(latitude-$3)<0.0005 AND abs(longitude-$4)<0.0008) LIMIT 1",[c.osm_id,c.name,c.latitude,c.longitude]);
        if(duplicate.rowCount)throw conflict('Ein ähnlicher Ort existiert bereits. Bitte den bestehenden Eintrag prüfen: '+duplicate.rows[0].name);
        const inserted=await tx.query(
          "INSERT INTO places(osm_id,name,category,address,latitude,longitude,website,source_url,status,description_de,verification_status,activity_status,verification_source,verification_method,verification_note,verified_by,verified_at,editorial_rank,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,'verified','operating',$10,$11,$12,$13,now(),$14,$15) RETURNING id",
          [c.osm_id,c.name,c.category,c.address,c.latitude,c.longitude,c.website,c.osm_url,'Redaktionell auf Betriebsstatus überprüft. Zeiten bitte direkt beim Anbieter prüfen.',proof,b.verification_method,b.verification_note,u.id,b.editorial_rank,b.opening_hours_text]);
        await tx.query("UPDATE discovery_candidates SET reviewed_status='hidden' WHERE osm_id=$1",[c.osm_id]);
        await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'publish:independent-source-review','place',$2)",[u.id,inserted.rows[0].id]);
        await tx.query('COMMIT');
        return ok({success:true,id:inserted.rows[0].id,verified:true});
      }
      await tx.query('UPDATE discovery_candidates SET reviewed_status=$2 WHERE osm_id=$1',[b.osm_id,b.action==='hide'?'hidden':'needs_review']);
      await tx.query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,b.action+':'+b.reason,'discovery_candidate',b.osm_id]);
      await tx.query('COMMIT');
      return ok({success:true,verified:false});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'"),
      query("SELECT r.id,r.reason,r.message AS note,COALESCE(p.name,dc.name) AS place_name FROM place_reports r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 60"),
      query("SELECT r.id,r.rating,r.body,COALESCE(p.name,dc.name) AS place_name FROM venue_reviews r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 80"),
      query("SELECT rr.id,rr.review_id,rr.reason,rr.message AS note,vr.body,COALESCE(p.name,dc.name) AS place_name FROM venue_review_reports rr JOIN venue_reviews vr ON vr.id=rr.review_id LEFT JOIN places p ON p.id=vr.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=vr.osm_id WHERE rr.status='pending' ORDER BY rr.created_at LIMIT 60"),
      query("SELECT c.id,c.body,LEFT(p.body,80) AS title FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 80"),
      query("SELECT cr.id,cr.name,cr.address,cr.website,cr.phone,cr.opening_hours_text,cr.submitted_at,p.name AS place_name,b.name AS business_name FROM place_change_requests cr JOIN places p ON p.id=cr.place_id JOIN businesses b ON b.id=cr.business_id WHERE cr.status='pending' ORDER BY cr.submitted_at ASC LIMIT 80")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows,reports:reports.rows,reviews:reviews.rows,reviewReports:reviewReports.rows,comments:comments.rows,branchChanges:branchChanges.rows});
  }
  if(method==='POST'&&path==='admin/review-place-change'){
    const u=admin(user);
    const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const request=await tx.query("SELECT * FROM place_change_requests WHERE id=$1 AND status='pending' FOR UPDATE",[b.id]);
      const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
      if(b.approve){
        const updated=await tx.query("UPDATE places SET name=$2,address=$3,website=$4,phone=$5,opening_hours_text=$6,verification_status='unverified',activity_status='unknown',verified_at=NULL,verification_source=NULL,verification_method=NULL,verification_note=NULL,verified_by=NULL,editorial_rank=0,updated_at=now() WHERE id=$1 AND business_id=$7 AND status='published' AND EXISTS(SELECT 1 FROM businesses b WHERE b.id=$7 AND b.status='approved') RETURNING id",
          [change.place_id,change.name,change.address,change.website,change.phone,change.opening_hours_text,change.business_id]);
        if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
      }
      await tx.query("UPDATE place_change_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),editor_note=$4 WHERE id=$1",[b.id,b.approve?'approved':'rejected',u.id,b.note]);
      await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place_change',$3)",[u.id,b.approve?'editor:branch-change-approved':'editor:branch-change-rejected',b.id]);
      await tx.query('COMMIT');return ok({success:true,status:b.approve?'approved':'rejected'});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='POST'&&path==='admin/moderate-review'){
    const u=admin(user);const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
    const target=b.approve?'published':'rejected';
    const result=await query("UPDATE venue_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",[b.id,target,u.id]);
    if(!result.rowCount)return bad('Pending review not found',404);
    await audit(u,'review:'+target,'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/moderate-review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const result=await query("UPDATE venue_review_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,review_id",
      [b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!result.rowCount)return bad('Pending review report not found',404);
    // Review and report flags remain separate; a moderator must decide removal.
    await audit(u,b.reviewed?'review-report:reviewed':'review-report:rejected','venue_review_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/remove-review'){
    const u=admin(user);const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
    const r=await query("UPDATE venue_reviews SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='published' RETURNING id",[b.id,u.id]);
    if(!r.rowCount)return bad('Published review not found',404);
    await audit(u,'review:removed:'+b.reason.slice(0,70),'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const r=await query("UPDATE place_reports SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id,osm_id,place_id",[b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!r.rowCount)return bad('Report not found',404);
    // This records review only; independent verification is required for a
    // status change or candidate hide, preventing false closure assertions.
    await audit(u,b.reviewed?'report:reviewed':'report:rejected','place_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published'],comment:['post_comments','published']} as const;
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
      verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
      verification_note:z.string().trim().min(25).max(2000),
      confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_status:z.literal(true),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=independentProof(b.verification_source);
    if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,verification_method=$6,verification_note=$7,verified_by=$8,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text,b.verification_method,b.verification_note,u.id]);
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
+a+')) * SIN(RADIANS(latitude)) + COS(RADIANS(
  }
  if(method==='GET'&&path==='discovery-map'){
    const raw=trim(qs.get('bbox')).split(',').map(Number);
    if(raw.length!==4||raw.some(v=>!Number.isFinite(v))||
      raw[0]<8.2||raw[2]>9.1||raw[1]<49.7||raw[3]>50.4||raw[0]>=raw[2]||raw[1]>=raw[3])
      return bad('Kartenausschnitt ungültig');
    const cat=trim(qs.get('category'));
    const validCategory=cat==='Apotheken Notdienst'?'Apotheken':cat;
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,phone,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  if(method==='GET'&&path==='event-favorites'){
    const u=need(user);
    const r=await query("SELECT e.id,e.title,e.venue,e.starts_at,e.description_de,e.ticket_url FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ORDER BY e.starts_at ASC LIMIT 100",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='POST'&&path==='event-favorites'){
    rate(req,'event-favorite');const u=need(user);
    const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
    if(b.active){
      const r=await query("INSERT INTO event_favorites(user_id,event_id) SELECT $1,e.id FROM events e WHERE e.id=$2 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ON CONFLICT DO NOTHING RETURNING event_id",[u.id,b.event_id]);
      if(!r.rowCount){
        const existing=await query('SELECT event_id FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
        if(!existing.rowCount)return bad('Event not available',404);
      }
    }else await query('DELETE FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
    return ok({saved:b.active});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='reviews'){
    const venueId=trim(qs.get('place_id'));
    if(!validLocationId(venueId))return bad('Invalid place ID');
    const isCandidate=osmId.test(venueId);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[venueId]);
    if(!exists.rowCount)return bad('Place not found',404);
    const col=isCandidate?'osm_id':'place_id';
    const [summary,items]=await Promise.all([
      query("SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS average FROM venue_reviews WHERE "+col+"=$1 AND status='published'",[venueId]),
      query("SELECT r.id,r.rating,r.body,r.created_at,LEFT(u.display_name,1) AS display_name FROM venue_reviews r JOIN users u ON u.id=r.user_id WHERE r."+col+"=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30",[venueId])
    ]);
    return ok({summary:summary.rows[0],items:items.rows});
  }
  if(method==='GET'&&path==='posts'){
    const following=qs.get('scope')==='following';
    if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
    if(following&&!user)return bad('Login required',401);
    const r=await query(`SELECT p.id,p.user_id AS author_id,p.body,p.media_url,p.created_at,
      LEFT(u.display_name,1) AS display_name,COALESCE(pl.name,dc.name) AS place_name,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes_count,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.status='published') AS comments_count,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id) AS following_author,
      (p.user_id=$1) AS own_post
      FROM posts p JOIN users u ON u.id=p.user_id
      LEFT JOIN places pl ON pl.id=p.place_id
      LEFT JOIN businesses bu ON bu.id=pl.business_id AND bu.status='approved'
      LEFT JOIN discovery_candidates dc ON dc.osm_id=p.candidate_osm_id
      WHERE p.status='published' AND ($2::boolean IS FALSE OR
        EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id)
        OR (bu.id IS NOT NULL AND EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=bu.id)))
      ORDER BY p.created_at DESC LIMIT 40`,[user?.id||null,following]);
    return ok({items:r.rows,scope:following?'following':'all'});
  }
  if(method==='GET'&&path==='follows'){
    // Only the current user can see their own followed people and businesses.
    const u=need(user);
    const [people,businesses]=await Promise.all([
      query("SELECT uf.followed_id AS id,LEFT(us.display_name,1) AS display_name FROM user_follows uf JOIN users us ON us.id=uf.followed_id WHERE uf.follower_id=$1 ORDER BY uf.created_at DESC LIMIT 100",[u.id]),
      query("SELECT bf.business_id AS id,b.name FROM business_follows bf JOIN businesses b ON b.id=bf.business_id WHERE bf.follower_id=$1 AND b.status='approved' ORDER BY bf.created_at DESC LIMIT 100",[u.id])
    ]);
    return ok({people:people.rows,businesses:businesses.rows});
  }
  if(method==='POST'&&path==='follows'){
    rate(req,'follow');const u=need(user);
    const b=parse(z.object({
      target_type:z.enum(['user','business']),
      target_id:id,
      active:z.boolean()
    }),await payload(req));
    if(b.target_type==='user'){
      if(b.target_id===u.id)return bad('Cannot follow yourself');
      if(b.active){
        const created=await query("INSERT INTO user_follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND EXISTS(SELECT 1 FROM posts WHERE user_id=$2 AND status='published') ON CONFLICT DO NOTHING RETURNING followed_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT followed_id FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Author not available',404);
        }
      }else await query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
    }else{
      if(b.active){
        // Businesses are followable only after approval AND after a location
        // is publicly published; claiming an OSM record does not qualify.
        const created=await query("INSERT INTO business_follows(follower_id,business_id) SELECT $1,b.id FROM businesses b WHERE b.id=$2 AND b.status='approved' AND b.owner_id!=$1 AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published' AND p.activity_status!='permanently_closed') ON CONFLICT DO NOTHING RETURNING business_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT business_id FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Business not available',404);
        }
      }else await query('DELETE FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
    }
    return ok({following:b.active});
  }
  if(method==='GET'&&path==='comments'){
    const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
    const post=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[postId]);
    if(!post.rowCount)return bad('Post not found',404);
    const r=await query("SELECT c.id,c.body,c.created_at,LEFT(u.display_name,1) AS display_name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 60",[postId]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='coupons'){
    const u=need(user);
    const r=await query("SELECT c.id,c.deal_id,c.code,c.created_at,c.redeemed_at,d.title,d.valid_until,b.name AS business_name, (d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now())) AS available FROM coupon_claims c JOIN deals d ON d.id=c.deal_id JOIN businesses b ON b.id=d.business_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100",[u.id]);
    const response=ok({items:r.rows});response.headers.set('Cache-Control','no-store, private');return response;
  }
  if(method==='POST'&&path==='coupons/claim'){
    rate(req,'coupon-claim');const u=need(user);
    const b=parse(z.object({deal_id:id}),await payload(req));
    const found=await query("SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.status='published' AND b.status='approved' AND b.owner_id!=$2 AND (d.valid_until IS NULL OR d.valid_until>now())",[b.deal_id,u.id]);
    if(!found.rowCount)return bad('Coupon not available',404);
    const secret=randomBytes(18).toString('base64url');
    const r=await query("INSERT INTO coupon_claims(deal_id,user_id,code) VALUES($1,$2,$3) ON CONFLICT(deal_id,user_id) DO UPDATE SET deal_id=excluded.deal_id RETURNING code,redeemed_at",
      [b.deal_id,u.id,secret]);
    return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)});
  }
  if(method==='POST'&&path==='business/coupons/redeem'){
    rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
    // Atomic: never allow a second redemption, even on concurrent requests.
    const r=await query("UPDATE coupon_claims c SET redeemed_at=now(),redeemed_by=$2 FROM deals d WHERE c.code=$1 AND c.deal_id=d.id AND d.business_id=$3 AND d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) AND c.redeemed_at IS NULL RETURNING c.id,d.title",
      [b.code,u.id,business.id]);
    if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
    await audit(u,'coupon:redeemed','coupon_claim',r.rows[0].id);
    return ok({success:true,title:r.rows[0].title});
  }
  if(method==='GET'&&path==='location'){
    const place_id=trim(qs.get('id'));
    if(!validLocationId(place_id))return bad('Invalid place ID',400);
    if(osmId.test(place_id)){
      const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'",[place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      return ok({place:r.rows[0]});
    }
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$2 AND bf.business_id=places.business_id) AS following_business FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[place_id,user?.id||null]);
    if(!r.rowCount)return bad('Place not found',404);
    return ok({place:r.rows[0]});
  }
  if(method==='GET'&&path==='tours'){
    const u=need(user);
    const r=await query("SELECT t.id,t.title,t.share_token,t.created_at,t.updated_at,(SELECT count(*)::int FROM tour_stops st WHERE st.tour_id=t.id) AS stop_count FROM user_tours t WHERE t.owner_id=$1 ORDER BY t.updated_at DESC LIMIT 50",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='tours/details'){
    const u=need(user);
    const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
    const r=await query("SELECT id,title,share_token,created_at FROM user_tours WHERE id=$1 AND owner_id=$2",[tourId,u.id]);
    if(!r.rowCount)return bad('Tour not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time
      FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified')
      ORDER BY s.position`,[tourId]);
    return ok({tour:r.rows[0],stops:stops.rows});
  }
  if(method==='GET'&&path==='tours/shared'){
    const token=trim(qs.get('token'));
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
    const r=await query("SELECT id,title FROM user_tours WHERE share_token=$1 AND shared_at IS NOT NULL",[token]);
    if(!r.rowCount)return bad('Tour link not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified') ORDER BY s.position`,[r.rows[0].id]);
    return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true});
  }
  if(method==='POST'&&path==='tours'){
    rate(req,'tour');const u=need(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('save'),id:id.optional(),title:text(100),
        stop_ids:z.array(z.string().refine(validLocationId)).min(2).max(8),
        planned_times:z.array(z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).nullable()).max(8).optional()}),
      z.object({action:z.literal('share'),id,enabled:z.boolean()}),
      z.object({action:z.literal('delete'),id})
    ]),await payload(req));
    if(b.action==='delete'){
      const removed=await query('DELETE FROM user_tours WHERE id=$1 AND owner_id=$2 RETURNING id',[b.id,u.id]);
      if(!removed.rowCount)return bad('Tour not found',404);
      return ok({success:true});
    }
    if(b.action==='share'){
      const token=randomBytes(32).toString('base64url');
      const changed=await query(b.enabled
        ?"UPDATE user_tours SET share_token=coalesce(share_token,$3),shared_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token"
        :"UPDATE user_tours SET share_token=NULL,shared_at=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token",
        b.enabled?[b.id,u.id,token]:[b.id,u.id]);
      if(!changed.rowCount)return bad('Tour not found',404);
      return ok({success:true,token:changed.rows[0].share_token||null});
    }
    if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
    if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
    // Only actual public, geolocated venues may be stops. OSM data remains
    // explicitly unverified and is never silently promoted to a published place.
    for(const stop of b.stop_ids){
      const candidate=osmId.test(stop);
      const available=await query(candidate
        ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified' AND latitude IS NOT NULL AND longitude IS NOT NULL"
        :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed' AND latitude IS NOT NULL AND longitude IS NOT NULL",[stop]);
      if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
    }
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      let tourId=b.id;
      if(tourId){
        const owned=await tx.query('SELECT id FROM user_tours WHERE id=$1 AND owner_id=$2 FOR UPDATE',[tourId,u.id]);
        if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
        await tx.query('UPDATE user_tours SET title=$3,updated_at=now() WHERE id=$1 AND owner_id=$2',[tourId,u.id,b.title]);
        await tx.query('DELETE FROM tour_stops WHERE tour_id=$1',[tourId]);
      }else{
        const created=await tx.query('INSERT INTO user_tours(owner_id,title) VALUES($1,$2) RETURNING id',[u.id,b.title]);
        tourId=created.rows[0].id;
      }
      for(let i=0;i<b.stop_ids.length;i++){
        const stop=b.stop_ids[i],candidate=osmId.test(stop);
        await tx.query('INSERT INTO tour_stops(tour_id,position,place_id,osm_id,planned_time) VALUES($1,$2,$3,$4,$5)',
          [tourId,i+1,candidate?null:stop,candidate?stop:null,b.planned_times?.[i]||null]);
      }
      await tx.query('COMMIT');
      return ok({id:tourId,success:true},b.id?200:201);
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }

  if(method==='GET'&&path==='favorites/details'){
    const u=need(user);
    const [listed,candidates]=await Promise.all([
      query("SELECT p.id,p.name,p.category,p.district,p.address,p.latitude,p.longitude,p.website,p.description_de,p.description_en,p.source_url,p.image_url,p.verification_status,p.activity_status,p.verified_at,p.verification_source,p.opening_hours_text,(SELECT b.id FROM businesses b WHERE b.id=p.business_id AND b.status='approved') AS business_id,EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=p.business_id) AS following_business,f.created_at AS saved_at,false AS candidate FROM favorites f JOIN places p ON p.id=f.place_id WHERE f.user_id=$1 AND p.status='published' AND p.activity_status!='permanently_closed' ORDER BY f.created_at DESC LIMIT 120",[u.id]),
      query("SELECT dc.osm_id AS id,dc.osm_id,dc.name,dc.category,dc.address,dc.latitude,dc.longitude,dc.website,dc.phone,dc.osm_url AS source_url,dc.activity_status,'unverified' AS verification_status,dc.opening_hours AS opening_hours_text,cf.created_at AS saved_at,true AS candidate FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id WHERE cf.user_id=$1 AND dc.reviewed_status='unverified' ORDER BY cf.created_at DESC LIMIT 120",[u.id])
    ]);
    const items=[...listed.rows,...candidates.rows].sort((a,b)=>new Date(b.saved_at).getTime()-new Date(a.saved_at).getTime()).slice(0,120);
    return ok({items});
  }
  if(method==='GET'&&path==='favorites'){
    const u=need(user);
    const [published,candidates]=await Promise.all([
      query('SELECT place_id AS id FROM favorites WHERE user_id=$1',[u.id]),
      query('SELECT osm_id AS id FROM candidate_favorites WHERE user_id=$1',[u.id])
    ]);
    return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)});
  }
  if(method==='POST'&&path==='favorites'){
    const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
    if(osmId.test(b.place_id)){
      if(b.active){
        const r=await query("INSERT INTO candidate_favorites(user_id,osm_id) SELECT $1,osm_id FROM discovery_candidates WHERE osm_id=$2 AND reviewed_status='unverified' ON CONFLICT DO NOTHING RETURNING osm_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT osm_id FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);
    }else{
      if(b.active){
        const r=await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING RETURNING place_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT place_id FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    }
    return ok({success:true});
  }
  if(method==='POST'&&path==='place-reports'){
    rate(req,'place-report');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
      reason:z.enum(['closed','address','details','other']),message:z.string().trim().min(12).max(750)}),await payload(req));
    const isOsm=osmId.test(b.place_id);
    const exists=await query(isOsm?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status!='hidden'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query("INSERT INTO place_reports(user_id,place_id,osm_id,reason,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [u.id,isOsm?null:b.place_id,isOsm?b.place_id:null,b.reason,b.message]);
    await audit(u,'report:submitted','place_report',r.rows[0].id);
    return ok({id:r.rows[0].id,status:r.rows[0].status},201);
  }
  if(method==='POST'&&path==='reviews'){
    rate(req,'venue-review');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
    const isCandidate=osmId.test(b.place_id);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query(isCandidate
      ? "INSERT INTO venue_reviews(user_id,osm_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status"
      : "INSERT INTO venue_reviews(user_id,place_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,place_id) WHERE place_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status",
      [u.id,b.place_id,b.rating,b.body]);
    await audit(u,'review:submitted','venue_review',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='review-reports'){
    rate(req,'review-abuse');const u=need(user);
    const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
    const found=await query("SELECT id FROM venue_reviews WHERE id=$1 AND status='published' AND user_id!=$2",[b.review_id,u.id]);
    if(!found.rowCount)return bad('Review unavailable',404);
    const r=await query("INSERT INTO venue_review_reports(review_id,reporter_id,reason,message) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,reporter_id) DO NOTHING RETURNING id",
      [b.review_id,u.id,b.reason,b.message]);
    if(!r.rowCount)return bad('Already reported',409);
    await audit(u,'review:reported','venue_review',b.review_id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='post-likes'){
    rate(req,'post-like');const u=need(user);
    const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    if(b.active)await query("INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,b.post_id]);
    else await query("DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2",[u.id,b.post_id]);
    const count=await query("SELECT count(*)::int AS count FROM post_likes WHERE post_id=$1",[b.post_id]);
    return ok({success:true,liked:b.active,count:count.rows[0].count});
  }
  if(method==='POST'&&path==='comments'){
    rate(req,'post-comment');const u=need(user);
    const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    const r=await query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id,status",[b.post_id,u.id,b.body]);
    await audit(u,'comment:submitted','post_comment',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);
    const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    let placeId:string|null=null,candidateId:string|null=null;
    if(b.place_id){
      const candidate=osmId.test(b.place_id);
      const r=await query(candidate?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      if(candidate)candidateId=b.place_id;else placeId=b.place_id;
    }
    const r=await query("INSERT INTO posts(user_id,place_id,candidate_osm_id,body,media_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id,placeId,candidateId,b.body,media]);
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
    const [p,d,c,changes]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query("SELECT id,place_id,name,address,phone,website,opening_hours_text,status,submitted_at,editor_note FROM place_change_requests WHERE business_id=$1 ORDER BY submitted_at DESC LIMIT 40",[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows});
  }
  if(method==='POST'&&path==='business/places/change'){
    rate(req,'business-place-change');
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
      website:z.string().trim().max(1000).optional().default(''),phone:z.string().trim().max(40).optional().default(''),
      opening_hours_text:z.string().trim().max(300).optional().default('')}),await payload(req));
    if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
    const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
    const owned=await query("SELECT id FROM places WHERE id=$1 AND business_id=$2 AND status='published'",[b.place_id,business.id]);
    if(!owned.rowCount)return bad('Place not owned',403);
    const r=await query("INSERT INTO place_change_requests(place_id,business_id,submitted_by,name,address,website,phone,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(place_id) WHERE status='pending' DO UPDATE SET submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,website=excluded.website,phone=excluded.phone,opening_hours_text=excluded.opening_hours_text,submitted_at=now() RETURNING id,status",
      [b.place_id,business.id,u.id,b.name,b.address,website,b.phone||null,b.opening_hours_text||null]);
    await audit(u,'business:branch-change-requested','place_change',r.rows[0].id);
    return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }

  if(method==='GET'&&path==='admin/validation'){
    admin(user);
    const [counts,stale]=await Promise.all([
      query(`SELECT
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='unverified') AS kandidaten,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='needs_review') AS rueckfragen,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='hidden') AS ausgeblendet,
        (SELECT count(*)::int FROM discovery_candidates WHERE category='Apotheken') AS apotheken,
        (SELECT count(*)::int FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now()) AS aktuell_geprueft,
        (SELECT count(*)::int FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at < now()-interval '30 days')) AS offen_zur_pruefung`),
      query("SELECT id,name,category,verified_at,verification_source,verification_note FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days') ORDER BY verified_at ASC NULLS FIRST,name LIMIT 25")
    ]);
    return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false});
  }
  if(method==='GET'&&path==='admin/candidates'){
    admin(user);
    const q=trim(qs.get('q')).slice(0,90);
    const cat=trim(qs.get('category')).slice(0,70);
    const state=trim(qs.get('state'))||'unverified';
    if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
    const page=Number(qs.get('page')||0);
    const offset=Number.isFinite(page)?Math.min(Math.max(Math.floor(page),0),1000)*25:0;
    const args=[state,cat,q,offset];
    const where="WHERE reviewed_status=$1 AND ($2='' OR category=$2) AND ($3='' OR name ILIKE '%'||$3||'%' OR address ILIKE '%'||$3||'%')";
    const [r,n]=await Promise.all([
      query("SELECT osm_id,name,category,address,website,phone,opening_hours,last_osm_check,osm_url,latitude,longitude,reviewed_status FROM discovery_candidates "+where+" ORDER BY CASE WHEN website IS NOT NULL AND website!='' THEN 0 ELSE 1 END,category,name,osm_id LIMIT 25 OFFSET $4",args),
      query("SELECT count(*)::int AS total FROM discovery_candidates "+where,args.slice(0,3))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset});
  }
  if(method==='POST'&&path==='admin/review-candidate'){
    const u=admin(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('publish'),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        verification_source:z.url().max(1000),
        verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
        verification_note:z.string().trim().min(25).max(2000),
        confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_operation:z.literal(true),
        editorial_rank:z.number().int().min(0).max(100).default(0),
        opening_hours_text:z.string().trim().max(300).optional().default('')}),
      z.object({action:z.enum(['hide','needs_review']),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        reason:z.string().trim().min(10).max(500)})
    ]),await payload(req));
    const proof=b.action==='publish'?independentProof(b.verification_source):null;
    if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const source=await tx.query("SELECT * FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status IN ('unverified','needs_review') FOR UPDATE",[b.osm_id]);
      const c=source.rows[0];
      if(!c)throw conflict('Eintrag bereits bearbeitet oder nicht gefunden');
      if(b.action==='publish'){
        const duplicate=await tx.query("SELECT id,name FROM places WHERE osm_id=$1 OR (lower(name)=lower($2) AND latitude IS NOT NULL AND longitude IS NOT NULL AND abs(latitude-$3)<0.0005 AND abs(longitude-$4)<0.0008) LIMIT 1",[c.osm_id,c.name,c.latitude,c.longitude]);
        if(duplicate.rowCount)throw conflict('Ein ähnlicher Ort existiert bereits. Bitte den bestehenden Eintrag prüfen: '+duplicate.rows[0].name);
        const inserted=await tx.query(
          "INSERT INTO places(osm_id,name,category,address,latitude,longitude,website,source_url,status,description_de,verification_status,activity_status,verification_source,verification_method,verification_note,verified_by,verified_at,editorial_rank,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,'verified','operating',$10,$11,$12,$13,now(),$14,$15) RETURNING id",
          [c.osm_id,c.name,c.category,c.address,c.latitude,c.longitude,c.website,c.osm_url,'Redaktionell auf Betriebsstatus überprüft. Zeiten bitte direkt beim Anbieter prüfen.',proof,b.verification_method,b.verification_note,u.id,b.editorial_rank,b.opening_hours_text]);
        await tx.query("UPDATE discovery_candidates SET reviewed_status='hidden' WHERE osm_id=$1",[c.osm_id]);
        await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'publish:independent-source-review','place',$2)",[u.id,inserted.rows[0].id]);
        await tx.query('COMMIT');
        return ok({success:true,id:inserted.rows[0].id,verified:true});
      }
      await tx.query('UPDATE discovery_candidates SET reviewed_status=$2 WHERE osm_id=$1',[b.osm_id,b.action==='hide'?'hidden':'needs_review']);
      await tx.query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,b.action+':'+b.reason,'discovery_candidate',b.osm_id]);
      await tx.query('COMMIT');
      return ok({success:true,verified:false});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'"),
      query("SELECT r.id,r.reason,r.message AS note,COALESCE(p.name,dc.name) AS place_name FROM place_reports r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 60"),
      query("SELECT r.id,r.rating,r.body,COALESCE(p.name,dc.name) AS place_name FROM venue_reviews r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 80"),
      query("SELECT rr.id,rr.review_id,rr.reason,rr.message AS note,vr.body,COALESCE(p.name,dc.name) AS place_name FROM venue_review_reports rr JOIN venue_reviews vr ON vr.id=rr.review_id LEFT JOIN places p ON p.id=vr.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=vr.osm_id WHERE rr.status='pending' ORDER BY rr.created_at LIMIT 60"),
      query("SELECT c.id,c.body,LEFT(p.body,80) AS title FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 80"),
      query("SELECT cr.id,cr.name,cr.address,cr.website,cr.phone,cr.opening_hours_text,cr.submitted_at,p.name AS place_name,b.name AS business_name FROM place_change_requests cr JOIN places p ON p.id=cr.place_id JOIN businesses b ON b.id=cr.business_id WHERE cr.status='pending' ORDER BY cr.submitted_at ASC LIMIT 80")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows,reports:reports.rows,reviews:reviews.rows,reviewReports:reviewReports.rows,comments:comments.rows,branchChanges:branchChanges.rows});
  }
  if(method==='POST'&&path==='admin/review-place-change'){
    const u=admin(user);
    const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const request=await tx.query("SELECT * FROM place_change_requests WHERE id=$1 AND status='pending' FOR UPDATE",[b.id]);
      const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
      if(b.approve){
        const updated=await tx.query("UPDATE places SET name=$2,address=$3,website=$4,phone=$5,opening_hours_text=$6,verification_status='unverified',activity_status='unknown',verified_at=NULL,verification_source=NULL,verification_method=NULL,verification_note=NULL,verified_by=NULL,editorial_rank=0,updated_at=now() WHERE id=$1 AND business_id=$7 AND status='published' AND EXISTS(SELECT 1 FROM businesses b WHERE b.id=$7 AND b.status='approved') RETURNING id",
          [change.place_id,change.name,change.address,change.website,change.phone,change.opening_hours_text,change.business_id]);
        if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
      }
      await tx.query("UPDATE place_change_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),editor_note=$4 WHERE id=$1",[b.id,b.approve?'approved':'rejected',u.id,b.note]);
      await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place_change',$3)",[u.id,b.approve?'editor:branch-change-approved':'editor:branch-change-rejected',b.id]);
      await tx.query('COMMIT');return ok({success:true,status:b.approve?'approved':'rejected'});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='POST'&&path==='admin/moderate-review'){
    const u=admin(user);const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
    const target=b.approve?'published':'rejected';
    const result=await query("UPDATE venue_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",[b.id,target,u.id]);
    if(!result.rowCount)return bad('Pending review not found',404);
    await audit(u,'review:'+target,'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/moderate-review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const result=await query("UPDATE venue_review_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,review_id",
      [b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!result.rowCount)return bad('Pending review report not found',404);
    // Review and report flags remain separate; a moderator must decide removal.
    await audit(u,b.reviewed?'review-report:reviewed':'review-report:rejected','venue_review_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/remove-review'){
    const u=admin(user);const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
    const r=await query("UPDATE venue_reviews SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='published' RETURNING id",[b.id,u.id]);
    if(!r.rowCount)return bad('Published review not found',404);
    await audit(u,'review:removed:'+b.reason.slice(0,70),'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const r=await query("UPDATE place_reports SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id,osm_id,place_id",[b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!r.rowCount)return bad('Report not found',404);
    // This records review only; independent verification is required for a
    // status change or candidate hide, preventing false closure assertions.
    await audit(u,b.reviewed?'report:reviewed':'report:rejected','place_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published'],comment:['post_comments','published']} as const;
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
      verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
      verification_note:z.string().trim().min(25).max(2000),
      confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_status:z.literal(true),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=independentProof(b.verification_source);
    if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,verification_method=$6,verification_note=$7,verified_by=$8,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text,b.verification_method,b.verification_note,u.id]);
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
+a+')) * COS(RADIANS(latitude)) * COS(RADIANS(longitude - 
  }
  if(method==='GET'&&path==='discovery-map'){
    const raw=trim(qs.get('bbox')).split(',').map(Number);
    if(raw.length!==4||raw.some(v=>!Number.isFinite(v))||
      raw[0]<8.2||raw[2]>9.1||raw[1]<49.7||raw[3]>50.4||raw[0]>=raw[2]||raw[1]>=raw[3])
      return bad('Kartenausschnitt ungültig');
    const cat=trim(qs.get('category'));
    const validCategory=cat==='Apotheken Notdienst'?'Apotheken':cat;
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,phone,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  if(method==='GET'&&path==='event-favorites'){
    const u=need(user);
    const r=await query("SELECT e.id,e.title,e.venue,e.starts_at,e.description_de,e.ticket_url FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ORDER BY e.starts_at ASC LIMIT 100",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='POST'&&path==='event-favorites'){
    rate(req,'event-favorite');const u=need(user);
    const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
    if(b.active){
      const r=await query("INSERT INTO event_favorites(user_id,event_id) SELECT $1,e.id FROM events e WHERE e.id=$2 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ON CONFLICT DO NOTHING RETURNING event_id",[u.id,b.event_id]);
      if(!r.rowCount){
        const existing=await query('SELECT event_id FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
        if(!existing.rowCount)return bad('Event not available',404);
      }
    }else await query('DELETE FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
    return ok({saved:b.active});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='reviews'){
    const venueId=trim(qs.get('place_id'));
    if(!validLocationId(venueId))return bad('Invalid place ID');
    const isCandidate=osmId.test(venueId);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[venueId]);
    if(!exists.rowCount)return bad('Place not found',404);
    const col=isCandidate?'osm_id':'place_id';
    const [summary,items]=await Promise.all([
      query("SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS average FROM venue_reviews WHERE "+col+"=$1 AND status='published'",[venueId]),
      query("SELECT r.id,r.rating,r.body,r.created_at,LEFT(u.display_name,1) AS display_name FROM venue_reviews r JOIN users u ON u.id=r.user_id WHERE r."+col+"=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30",[venueId])
    ]);
    return ok({summary:summary.rows[0],items:items.rows});
  }
  if(method==='GET'&&path==='posts'){
    const following=qs.get('scope')==='following';
    if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
    if(following&&!user)return bad('Login required',401);
    const r=await query(`SELECT p.id,p.user_id AS author_id,p.body,p.media_url,p.created_at,
      LEFT(u.display_name,1) AS display_name,COALESCE(pl.name,dc.name) AS place_name,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes_count,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.status='published') AS comments_count,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id) AS following_author,
      (p.user_id=$1) AS own_post
      FROM posts p JOIN users u ON u.id=p.user_id
      LEFT JOIN places pl ON pl.id=p.place_id
      LEFT JOIN businesses bu ON bu.id=pl.business_id AND bu.status='approved'
      LEFT JOIN discovery_candidates dc ON dc.osm_id=p.candidate_osm_id
      WHERE p.status='published' AND ($2::boolean IS FALSE OR
        EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id)
        OR (bu.id IS NOT NULL AND EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=bu.id)))
      ORDER BY p.created_at DESC LIMIT 40`,[user?.id||null,following]);
    return ok({items:r.rows,scope:following?'following':'all'});
  }
  if(method==='GET'&&path==='follows'){
    // Only the current user can see their own followed people and businesses.
    const u=need(user);
    const [people,businesses]=await Promise.all([
      query("SELECT uf.followed_id AS id,LEFT(us.display_name,1) AS display_name FROM user_follows uf JOIN users us ON us.id=uf.followed_id WHERE uf.follower_id=$1 ORDER BY uf.created_at DESC LIMIT 100",[u.id]),
      query("SELECT bf.business_id AS id,b.name FROM business_follows bf JOIN businesses b ON b.id=bf.business_id WHERE bf.follower_id=$1 AND b.status='approved' ORDER BY bf.created_at DESC LIMIT 100",[u.id])
    ]);
    return ok({people:people.rows,businesses:businesses.rows});
  }
  if(method==='POST'&&path==='follows'){
    rate(req,'follow');const u=need(user);
    const b=parse(z.object({
      target_type:z.enum(['user','business']),
      target_id:id,
      active:z.boolean()
    }),await payload(req));
    if(b.target_type==='user'){
      if(b.target_id===u.id)return bad('Cannot follow yourself');
      if(b.active){
        const created=await query("INSERT INTO user_follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND EXISTS(SELECT 1 FROM posts WHERE user_id=$2 AND status='published') ON CONFLICT DO NOTHING RETURNING followed_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT followed_id FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Author not available',404);
        }
      }else await query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
    }else{
      if(b.active){
        // Businesses are followable only after approval AND after a location
        // is publicly published; claiming an OSM record does not qualify.
        const created=await query("INSERT INTO business_follows(follower_id,business_id) SELECT $1,b.id FROM businesses b WHERE b.id=$2 AND b.status='approved' AND b.owner_id!=$1 AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published' AND p.activity_status!='permanently_closed') ON CONFLICT DO NOTHING RETURNING business_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT business_id FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Business not available',404);
        }
      }else await query('DELETE FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
    }
    return ok({following:b.active});
  }
  if(method==='GET'&&path==='comments'){
    const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
    const post=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[postId]);
    if(!post.rowCount)return bad('Post not found',404);
    const r=await query("SELECT c.id,c.body,c.created_at,LEFT(u.display_name,1) AS display_name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 60",[postId]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='coupons'){
    const u=need(user);
    const r=await query("SELECT c.id,c.deal_id,c.code,c.created_at,c.redeemed_at,d.title,d.valid_until,b.name AS business_name, (d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now())) AS available FROM coupon_claims c JOIN deals d ON d.id=c.deal_id JOIN businesses b ON b.id=d.business_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100",[u.id]);
    const response=ok({items:r.rows});response.headers.set('Cache-Control','no-store, private');return response;
  }
  if(method==='POST'&&path==='coupons/claim'){
    rate(req,'coupon-claim');const u=need(user);
    const b=parse(z.object({deal_id:id}),await payload(req));
    const found=await query("SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.status='published' AND b.status='approved' AND b.owner_id!=$2 AND (d.valid_until IS NULL OR d.valid_until>now())",[b.deal_id,u.id]);
    if(!found.rowCount)return bad('Coupon not available',404);
    const secret=randomBytes(18).toString('base64url');
    const r=await query("INSERT INTO coupon_claims(deal_id,user_id,code) VALUES($1,$2,$3) ON CONFLICT(deal_id,user_id) DO UPDATE SET deal_id=excluded.deal_id RETURNING code,redeemed_at",
      [b.deal_id,u.id,secret]);
    return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)});
  }
  if(method==='POST'&&path==='business/coupons/redeem'){
    rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
    // Atomic: never allow a second redemption, even on concurrent requests.
    const r=await query("UPDATE coupon_claims c SET redeemed_at=now(),redeemed_by=$2 FROM deals d WHERE c.code=$1 AND c.deal_id=d.id AND d.business_id=$3 AND d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) AND c.redeemed_at IS NULL RETURNING c.id,d.title",
      [b.code,u.id,business.id]);
    if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
    await audit(u,'coupon:redeemed','coupon_claim',r.rows[0].id);
    return ok({success:true,title:r.rows[0].title});
  }
  if(method==='GET'&&path==='location'){
    const place_id=trim(qs.get('id'));
    if(!validLocationId(place_id))return bad('Invalid place ID',400);
    if(osmId.test(place_id)){
      const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'",[place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      return ok({place:r.rows[0]});
    }
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$2 AND bf.business_id=places.business_id) AS following_business FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[place_id,user?.id||null]);
    if(!r.rowCount)return bad('Place not found',404);
    return ok({place:r.rows[0]});
  }
  if(method==='GET'&&path==='tours'){
    const u=need(user);
    const r=await query("SELECT t.id,t.title,t.share_token,t.created_at,t.updated_at,(SELECT count(*)::int FROM tour_stops st WHERE st.tour_id=t.id) AS stop_count FROM user_tours t WHERE t.owner_id=$1 ORDER BY t.updated_at DESC LIMIT 50",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='tours/details'){
    const u=need(user);
    const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
    const r=await query("SELECT id,title,share_token,created_at FROM user_tours WHERE id=$1 AND owner_id=$2",[tourId,u.id]);
    if(!r.rowCount)return bad('Tour not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time
      FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified')
      ORDER BY s.position`,[tourId]);
    return ok({tour:r.rows[0],stops:stops.rows});
  }
  if(method==='GET'&&path==='tours/shared'){
    const token=trim(qs.get('token'));
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
    const r=await query("SELECT id,title FROM user_tours WHERE share_token=$1 AND shared_at IS NOT NULL",[token]);
    if(!r.rowCount)return bad('Tour link not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified') ORDER BY s.position`,[r.rows[0].id]);
    return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true});
  }
  if(method==='POST'&&path==='tours'){
    rate(req,'tour');const u=need(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('save'),id:id.optional(),title:text(100),
        stop_ids:z.array(z.string().refine(validLocationId)).min(2).max(8),
        planned_times:z.array(z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).nullable()).max(8).optional()}),
      z.object({action:z.literal('share'),id,enabled:z.boolean()}),
      z.object({action:z.literal('delete'),id})
    ]),await payload(req));
    if(b.action==='delete'){
      const removed=await query('DELETE FROM user_tours WHERE id=$1 AND owner_id=$2 RETURNING id',[b.id,u.id]);
      if(!removed.rowCount)return bad('Tour not found',404);
      return ok({success:true});
    }
    if(b.action==='share'){
      const token=randomBytes(32).toString('base64url');
      const changed=await query(b.enabled
        ?"UPDATE user_tours SET share_token=coalesce(share_token,$3),shared_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token"
        :"UPDATE user_tours SET share_token=NULL,shared_at=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token",
        b.enabled?[b.id,u.id,token]:[b.id,u.id]);
      if(!changed.rowCount)return bad('Tour not found',404);
      return ok({success:true,token:changed.rows[0].share_token||null});
    }
    if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
    if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
    // Only actual public, geolocated venues may be stops. OSM data remains
    // explicitly unverified and is never silently promoted to a published place.
    for(const stop of b.stop_ids){
      const candidate=osmId.test(stop);
      const available=await query(candidate
        ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified' AND latitude IS NOT NULL AND longitude IS NOT NULL"
        :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed' AND latitude IS NOT NULL AND longitude IS NOT NULL",[stop]);
      if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
    }
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      let tourId=b.id;
      if(tourId){
        const owned=await tx.query('SELECT id FROM user_tours WHERE id=$1 AND owner_id=$2 FOR UPDATE',[tourId,u.id]);
        if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
        await tx.query('UPDATE user_tours SET title=$3,updated_at=now() WHERE id=$1 AND owner_id=$2',[tourId,u.id,b.title]);
        await tx.query('DELETE FROM tour_stops WHERE tour_id=$1',[tourId]);
      }else{
        const created=await tx.query('INSERT INTO user_tours(owner_id,title) VALUES($1,$2) RETURNING id',[u.id,b.title]);
        tourId=created.rows[0].id;
      }
      for(let i=0;i<b.stop_ids.length;i++){
        const stop=b.stop_ids[i],candidate=osmId.test(stop);
        await tx.query('INSERT INTO tour_stops(tour_id,position,place_id,osm_id,planned_time) VALUES($1,$2,$3,$4,$5)',
          [tourId,i+1,candidate?null:stop,candidate?stop:null,b.planned_times?.[i]||null]);
      }
      await tx.query('COMMIT');
      return ok({id:tourId,success:true},b.id?200:201);
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }

  if(method==='GET'&&path==='favorites/details'){
    const u=need(user);
    const [listed,candidates]=await Promise.all([
      query("SELECT p.id,p.name,p.category,p.district,p.address,p.latitude,p.longitude,p.website,p.description_de,p.description_en,p.source_url,p.image_url,p.verification_status,p.activity_status,p.verified_at,p.verification_source,p.opening_hours_text,(SELECT b.id FROM businesses b WHERE b.id=p.business_id AND b.status='approved') AS business_id,EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=p.business_id) AS following_business,f.created_at AS saved_at,false AS candidate FROM favorites f JOIN places p ON p.id=f.place_id WHERE f.user_id=$1 AND p.status='published' AND p.activity_status!='permanently_closed' ORDER BY f.created_at DESC LIMIT 120",[u.id]),
      query("SELECT dc.osm_id AS id,dc.osm_id,dc.name,dc.category,dc.address,dc.latitude,dc.longitude,dc.website,dc.phone,dc.osm_url AS source_url,dc.activity_status,'unverified' AS verification_status,dc.opening_hours AS opening_hours_text,cf.created_at AS saved_at,true AS candidate FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id WHERE cf.user_id=$1 AND dc.reviewed_status='unverified' ORDER BY cf.created_at DESC LIMIT 120",[u.id])
    ]);
    const items=[...listed.rows,...candidates.rows].sort((a,b)=>new Date(b.saved_at).getTime()-new Date(a.saved_at).getTime()).slice(0,120);
    return ok({items});
  }
  if(method==='GET'&&path==='favorites'){
    const u=need(user);
    const [published,candidates]=await Promise.all([
      query('SELECT place_id AS id FROM favorites WHERE user_id=$1',[u.id]),
      query('SELECT osm_id AS id FROM candidate_favorites WHERE user_id=$1',[u.id])
    ]);
    return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)});
  }
  if(method==='POST'&&path==='favorites'){
    const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
    if(osmId.test(b.place_id)){
      if(b.active){
        const r=await query("INSERT INTO candidate_favorites(user_id,osm_id) SELECT $1,osm_id FROM discovery_candidates WHERE osm_id=$2 AND reviewed_status='unverified' ON CONFLICT DO NOTHING RETURNING osm_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT osm_id FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);
    }else{
      if(b.active){
        const r=await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING RETURNING place_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT place_id FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    }
    return ok({success:true});
  }
  if(method==='POST'&&path==='place-reports'){
    rate(req,'place-report');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
      reason:z.enum(['closed','address','details','other']),message:z.string().trim().min(12).max(750)}),await payload(req));
    const isOsm=osmId.test(b.place_id);
    const exists=await query(isOsm?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status!='hidden'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query("INSERT INTO place_reports(user_id,place_id,osm_id,reason,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [u.id,isOsm?null:b.place_id,isOsm?b.place_id:null,b.reason,b.message]);
    await audit(u,'report:submitted','place_report',r.rows[0].id);
    return ok({id:r.rows[0].id,status:r.rows[0].status},201);
  }
  if(method==='POST'&&path==='reviews'){
    rate(req,'venue-review');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
    const isCandidate=osmId.test(b.place_id);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query(isCandidate
      ? "INSERT INTO venue_reviews(user_id,osm_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status"
      : "INSERT INTO venue_reviews(user_id,place_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,place_id) WHERE place_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status",
      [u.id,b.place_id,b.rating,b.body]);
    await audit(u,'review:submitted','venue_review',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='review-reports'){
    rate(req,'review-abuse');const u=need(user);
    const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
    const found=await query("SELECT id FROM venue_reviews WHERE id=$1 AND status='published' AND user_id!=$2",[b.review_id,u.id]);
    if(!found.rowCount)return bad('Review unavailable',404);
    const r=await query("INSERT INTO venue_review_reports(review_id,reporter_id,reason,message) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,reporter_id) DO NOTHING RETURNING id",
      [b.review_id,u.id,b.reason,b.message]);
    if(!r.rowCount)return bad('Already reported',409);
    await audit(u,'review:reported','venue_review',b.review_id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='post-likes'){
    rate(req,'post-like');const u=need(user);
    const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    if(b.active)await query("INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,b.post_id]);
    else await query("DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2",[u.id,b.post_id]);
    const count=await query("SELECT count(*)::int AS count FROM post_likes WHERE post_id=$1",[b.post_id]);
    return ok({success:true,liked:b.active,count:count.rows[0].count});
  }
  if(method==='POST'&&path==='comments'){
    rate(req,'post-comment');const u=need(user);
    const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    const r=await query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id,status",[b.post_id,u.id,b.body]);
    await audit(u,'comment:submitted','post_comment',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);
    const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    let placeId:string|null=null,candidateId:string|null=null;
    if(b.place_id){
      const candidate=osmId.test(b.place_id);
      const r=await query(candidate?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      if(candidate)candidateId=b.place_id;else placeId=b.place_id;
    }
    const r=await query("INSERT INTO posts(user_id,place_id,candidate_osm_id,body,media_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id,placeId,candidateId,b.body,media]);
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
    const [p,d,c,changes]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query("SELECT id,place_id,name,address,phone,website,opening_hours_text,status,submitted_at,editor_note FROM place_change_requests WHERE business_id=$1 ORDER BY submitted_at DESC LIMIT 40",[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows});
  }
  if(method==='POST'&&path==='business/places/change'){
    rate(req,'business-place-change');
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
      website:z.string().trim().max(1000).optional().default(''),phone:z.string().trim().max(40).optional().default(''),
      opening_hours_text:z.string().trim().max(300).optional().default('')}),await payload(req));
    if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
    const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
    const owned=await query("SELECT id FROM places WHERE id=$1 AND business_id=$2 AND status='published'",[b.place_id,business.id]);
    if(!owned.rowCount)return bad('Place not owned',403);
    const r=await query("INSERT INTO place_change_requests(place_id,business_id,submitted_by,name,address,website,phone,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(place_id) WHERE status='pending' DO UPDATE SET submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,website=excluded.website,phone=excluded.phone,opening_hours_text=excluded.opening_hours_text,submitted_at=now() RETURNING id,status",
      [b.place_id,business.id,u.id,b.name,b.address,website,b.phone||null,b.opening_hours_text||null]);
    await audit(u,'business:branch-change-requested','place_change',r.rows[0].id);
    return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }

  if(method==='GET'&&path==='admin/validation'){
    admin(user);
    const [counts,stale]=await Promise.all([
      query(`SELECT
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='unverified') AS kandidaten,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='needs_review') AS rueckfragen,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='hidden') AS ausgeblendet,
        (SELECT count(*)::int FROM discovery_candidates WHERE category='Apotheken') AS apotheken,
        (SELECT count(*)::int FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now()) AS aktuell_geprueft,
        (SELECT count(*)::int FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at < now()-interval '30 days')) AS offen_zur_pruefung`),
      query("SELECT id,name,category,verified_at,verification_source,verification_note FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days') ORDER BY verified_at ASC NULLS FIRST,name LIMIT 25")
    ]);
    return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false});
  }
  if(method==='GET'&&path==='admin/candidates'){
    admin(user);
    const q=trim(qs.get('q')).slice(0,90);
    const cat=trim(qs.get('category')).slice(0,70);
    const state=trim(qs.get('state'))||'unverified';
    if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
    const page=Number(qs.get('page')||0);
    const offset=Number.isFinite(page)?Math.min(Math.max(Math.floor(page),0),1000)*25:0;
    const args=[state,cat,q,offset];
    const where="WHERE reviewed_status=$1 AND ($2='' OR category=$2) AND ($3='' OR name ILIKE '%'||$3||'%' OR address ILIKE '%'||$3||'%')";
    const [r,n]=await Promise.all([
      query("SELECT osm_id,name,category,address,website,phone,opening_hours,last_osm_check,osm_url,latitude,longitude,reviewed_status FROM discovery_candidates "+where+" ORDER BY CASE WHEN website IS NOT NULL AND website!='' THEN 0 ELSE 1 END,category,name,osm_id LIMIT 25 OFFSET $4",args),
      query("SELECT count(*)::int AS total FROM discovery_candidates "+where,args.slice(0,3))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset});
  }
  if(method==='POST'&&path==='admin/review-candidate'){
    const u=admin(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('publish'),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        verification_source:z.url().max(1000),
        verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
        verification_note:z.string().trim().min(25).max(2000),
        confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_operation:z.literal(true),
        editorial_rank:z.number().int().min(0).max(100).default(0),
        opening_hours_text:z.string().trim().max(300).optional().default('')}),
      z.object({action:z.enum(['hide','needs_review']),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        reason:z.string().trim().min(10).max(500)})
    ]),await payload(req));
    const proof=b.action==='publish'?independentProof(b.verification_source):null;
    if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const source=await tx.query("SELECT * FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status IN ('unverified','needs_review') FOR UPDATE",[b.osm_id]);
      const c=source.rows[0];
      if(!c)throw conflict('Eintrag bereits bearbeitet oder nicht gefunden');
      if(b.action==='publish'){
        const duplicate=await tx.query("SELECT id,name FROM places WHERE osm_id=$1 OR (lower(name)=lower($2) AND latitude IS NOT NULL AND longitude IS NOT NULL AND abs(latitude-$3)<0.0005 AND abs(longitude-$4)<0.0008) LIMIT 1",[c.osm_id,c.name,c.latitude,c.longitude]);
        if(duplicate.rowCount)throw conflict('Ein ähnlicher Ort existiert bereits. Bitte den bestehenden Eintrag prüfen: '+duplicate.rows[0].name);
        const inserted=await tx.query(
          "INSERT INTO places(osm_id,name,category,address,latitude,longitude,website,source_url,status,description_de,verification_status,activity_status,verification_source,verification_method,verification_note,verified_by,verified_at,editorial_rank,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,'verified','operating',$10,$11,$12,$13,now(),$14,$15) RETURNING id",
          [c.osm_id,c.name,c.category,c.address,c.latitude,c.longitude,c.website,c.osm_url,'Redaktionell auf Betriebsstatus überprüft. Zeiten bitte direkt beim Anbieter prüfen.',proof,b.verification_method,b.verification_note,u.id,b.editorial_rank,b.opening_hours_text]);
        await tx.query("UPDATE discovery_candidates SET reviewed_status='hidden' WHERE osm_id=$1",[c.osm_id]);
        await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'publish:independent-source-review','place',$2)",[u.id,inserted.rows[0].id]);
        await tx.query('COMMIT');
        return ok({success:true,id:inserted.rows[0].id,verified:true});
      }
      await tx.query('UPDATE discovery_candidates SET reviewed_status=$2 WHERE osm_id=$1',[b.osm_id,b.action==='hide'?'hidden':'needs_review']);
      await tx.query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,b.action+':'+b.reason,'discovery_candidate',b.osm_id]);
      await tx.query('COMMIT');
      return ok({success:true,verified:false});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'"),
      query("SELECT r.id,r.reason,r.message AS note,COALESCE(p.name,dc.name) AS place_name FROM place_reports r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 60"),
      query("SELECT r.id,r.rating,r.body,COALESCE(p.name,dc.name) AS place_name FROM venue_reviews r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 80"),
      query("SELECT rr.id,rr.review_id,rr.reason,rr.message AS note,vr.body,COALESCE(p.name,dc.name) AS place_name FROM venue_review_reports rr JOIN venue_reviews vr ON vr.id=rr.review_id LEFT JOIN places p ON p.id=vr.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=vr.osm_id WHERE rr.status='pending' ORDER BY rr.created_at LIMIT 60"),
      query("SELECT c.id,c.body,LEFT(p.body,80) AS title FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 80"),
      query("SELECT cr.id,cr.name,cr.address,cr.website,cr.phone,cr.opening_hours_text,cr.submitted_at,p.name AS place_name,b.name AS business_name FROM place_change_requests cr JOIN places p ON p.id=cr.place_id JOIN businesses b ON b.id=cr.business_id WHERE cr.status='pending' ORDER BY cr.submitted_at ASC LIMIT 80")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows,reports:reports.rows,reviews:reviews.rows,reviewReports:reviewReports.rows,comments:comments.rows,branchChanges:branchChanges.rows});
  }
  if(method==='POST'&&path==='admin/review-place-change'){
    const u=admin(user);
    const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const request=await tx.query("SELECT * FROM place_change_requests WHERE id=$1 AND status='pending' FOR UPDATE",[b.id]);
      const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
      if(b.approve){
        const updated=await tx.query("UPDATE places SET name=$2,address=$3,website=$4,phone=$5,opening_hours_text=$6,verification_status='unverified',activity_status='unknown',verified_at=NULL,verification_source=NULL,verification_method=NULL,verification_note=NULL,verified_by=NULL,editorial_rank=0,updated_at=now() WHERE id=$1 AND business_id=$7 AND status='published' AND EXISTS(SELECT 1 FROM businesses b WHERE b.id=$7 AND b.status='approved') RETURNING id",
          [change.place_id,change.name,change.address,change.website,change.phone,change.opening_hours_text,change.business_id]);
        if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
      }
      await tx.query("UPDATE place_change_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),editor_note=$4 WHERE id=$1",[b.id,b.approve?'approved':'rejected',u.id,b.note]);
      await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place_change',$3)",[u.id,b.approve?'editor:branch-change-approved':'editor:branch-change-rejected',b.id]);
      await tx.query('COMMIT');return ok({success:true,status:b.approve?'approved':'rejected'});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='POST'&&path==='admin/moderate-review'){
    const u=admin(user);const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
    const target=b.approve?'published':'rejected';
    const result=await query("UPDATE venue_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",[b.id,target,u.id]);
    if(!result.rowCount)return bad('Pending review not found',404);
    await audit(u,'review:'+target,'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/moderate-review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const result=await query("UPDATE venue_review_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,review_id",
      [b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!result.rowCount)return bad('Pending review report not found',404);
    // Review and report flags remain separate; a moderator must decide removal.
    await audit(u,b.reviewed?'review-report:reviewed':'review-report:rejected','venue_review_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/remove-review'){
    const u=admin(user);const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
    const r=await query("UPDATE venue_reviews SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='published' RETURNING id",[b.id,u.id]);
    if(!r.rowCount)return bad('Published review not found',404);
    await audit(u,'review:removed:'+b.reason.slice(0,70),'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const r=await query("UPDATE place_reports SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id,osm_id,place_id",[b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!r.rowCount)return bad('Report not found',404);
    // This records review only; independent verification is required for a
    // status change or candidate hide, preventing false closure assertions.
    await audit(u,b.reviewed?'report:reviewed':'report:rejected','place_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published'],comment:['post_comments','published']} as const;
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
      verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
      verification_note:z.string().trim().min(25).max(2000),
      confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_status:z.literal(true),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=independentProof(b.verification_source);
    if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,verification_method=$6,verification_note=$7,verified_by=$8,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text,b.verification_method,b.verification_note,u.id]);
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
+b+')))))) <= 
  }
  if(method==='GET'&&path==='discovery-map'){
    const raw=trim(qs.get('bbox')).split(',').map(Number);
    if(raw.length!==4||raw.some(v=>!Number.isFinite(v))||
      raw[0]<8.2||raw[2]>9.1||raw[1]<49.7||raw[3]>50.4||raw[0]>=raw[2]||raw[1]>=raw[3])
      return bad('Kartenausschnitt ungültig');
    const cat=trim(qs.get('category'));
    const validCategory=cat==='Apotheken Notdienst'?'Apotheken':cat;
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,phone,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  if(method==='GET'&&path==='event-favorites'){
    const u=need(user);
    const r=await query("SELECT e.id,e.title,e.venue,e.starts_at,e.description_de,e.ticket_url FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ORDER BY e.starts_at ASC LIMIT 100",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='POST'&&path==='event-favorites'){
    rate(req,'event-favorite');const u=need(user);
    const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
    if(b.active){
      const r=await query("INSERT INTO event_favorites(user_id,event_id) SELECT $1,e.id FROM events e WHERE e.id=$2 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ON CONFLICT DO NOTHING RETURNING event_id",[u.id,b.event_id]);
      if(!r.rowCount){
        const existing=await query('SELECT event_id FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
        if(!existing.rowCount)return bad('Event not available',404);
      }
    }else await query('DELETE FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
    return ok({saved:b.active});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='reviews'){
    const venueId=trim(qs.get('place_id'));
    if(!validLocationId(venueId))return bad('Invalid place ID');
    const isCandidate=osmId.test(venueId);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[venueId]);
    if(!exists.rowCount)return bad('Place not found',404);
    const col=isCandidate?'osm_id':'place_id';
    const [summary,items]=await Promise.all([
      query("SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS average FROM venue_reviews WHERE "+col+"=$1 AND status='published'",[venueId]),
      query("SELECT r.id,r.rating,r.body,r.created_at,LEFT(u.display_name,1) AS display_name FROM venue_reviews r JOIN users u ON u.id=r.user_id WHERE r."+col+"=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30",[venueId])
    ]);
    return ok({summary:summary.rows[0],items:items.rows});
  }
  if(method==='GET'&&path==='posts'){
    const following=qs.get('scope')==='following';
    if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
    if(following&&!user)return bad('Login required',401);
    const r=await query(`SELECT p.id,p.user_id AS author_id,p.body,p.media_url,p.created_at,
      LEFT(u.display_name,1) AS display_name,COALESCE(pl.name,dc.name) AS place_name,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes_count,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.status='published') AS comments_count,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id) AS following_author,
      (p.user_id=$1) AS own_post
      FROM posts p JOIN users u ON u.id=p.user_id
      LEFT JOIN places pl ON pl.id=p.place_id
      LEFT JOIN businesses bu ON bu.id=pl.business_id AND bu.status='approved'
      LEFT JOIN discovery_candidates dc ON dc.osm_id=p.candidate_osm_id
      WHERE p.status='published' AND ($2::boolean IS FALSE OR
        EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id)
        OR (bu.id IS NOT NULL AND EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=bu.id)))
      ORDER BY p.created_at DESC LIMIT 40`,[user?.id||null,following]);
    return ok({items:r.rows,scope:following?'following':'all'});
  }
  if(method==='GET'&&path==='follows'){
    // Only the current user can see their own followed people and businesses.
    const u=need(user);
    const [people,businesses]=await Promise.all([
      query("SELECT uf.followed_id AS id,LEFT(us.display_name,1) AS display_name FROM user_follows uf JOIN users us ON us.id=uf.followed_id WHERE uf.follower_id=$1 ORDER BY uf.created_at DESC LIMIT 100",[u.id]),
      query("SELECT bf.business_id AS id,b.name FROM business_follows bf JOIN businesses b ON b.id=bf.business_id WHERE bf.follower_id=$1 AND b.status='approved' ORDER BY bf.created_at DESC LIMIT 100",[u.id])
    ]);
    return ok({people:people.rows,businesses:businesses.rows});
  }
  if(method==='POST'&&path==='follows'){
    rate(req,'follow');const u=need(user);
    const b=parse(z.object({
      target_type:z.enum(['user','business']),
      target_id:id,
      active:z.boolean()
    }),await payload(req));
    if(b.target_type==='user'){
      if(b.target_id===u.id)return bad('Cannot follow yourself');
      if(b.active){
        const created=await query("INSERT INTO user_follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND EXISTS(SELECT 1 FROM posts WHERE user_id=$2 AND status='published') ON CONFLICT DO NOTHING RETURNING followed_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT followed_id FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Author not available',404);
        }
      }else await query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
    }else{
      if(b.active){
        // Businesses are followable only after approval AND after a location
        // is publicly published; claiming an OSM record does not qualify.
        const created=await query("INSERT INTO business_follows(follower_id,business_id) SELECT $1,b.id FROM businesses b WHERE b.id=$2 AND b.status='approved' AND b.owner_id!=$1 AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published' AND p.activity_status!='permanently_closed') ON CONFLICT DO NOTHING RETURNING business_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT business_id FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Business not available',404);
        }
      }else await query('DELETE FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
    }
    return ok({following:b.active});
  }
  if(method==='GET'&&path==='comments'){
    const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
    const post=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[postId]);
    if(!post.rowCount)return bad('Post not found',404);
    const r=await query("SELECT c.id,c.body,c.created_at,LEFT(u.display_name,1) AS display_name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 60",[postId]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='coupons'){
    const u=need(user);
    const r=await query("SELECT c.id,c.deal_id,c.code,c.created_at,c.redeemed_at,d.title,d.valid_until,b.name AS business_name, (d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now())) AS available FROM coupon_claims c JOIN deals d ON d.id=c.deal_id JOIN businesses b ON b.id=d.business_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100",[u.id]);
    const response=ok({items:r.rows});response.headers.set('Cache-Control','no-store, private');return response;
  }
  if(method==='POST'&&path==='coupons/claim'){
    rate(req,'coupon-claim');const u=need(user);
    const b=parse(z.object({deal_id:id}),await payload(req));
    const found=await query("SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.status='published' AND b.status='approved' AND b.owner_id!=$2 AND (d.valid_until IS NULL OR d.valid_until>now())",[b.deal_id,u.id]);
    if(!found.rowCount)return bad('Coupon not available',404);
    const secret=randomBytes(18).toString('base64url');
    const r=await query("INSERT INTO coupon_claims(deal_id,user_id,code) VALUES($1,$2,$3) ON CONFLICT(deal_id,user_id) DO UPDATE SET deal_id=excluded.deal_id RETURNING code,redeemed_at",
      [b.deal_id,u.id,secret]);
    return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)});
  }
  if(method==='POST'&&path==='business/coupons/redeem'){
    rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
    // Atomic: never allow a second redemption, even on concurrent requests.
    const r=await query("UPDATE coupon_claims c SET redeemed_at=now(),redeemed_by=$2 FROM deals d WHERE c.code=$1 AND c.deal_id=d.id AND d.business_id=$3 AND d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) AND c.redeemed_at IS NULL RETURNING c.id,d.title",
      [b.code,u.id,business.id]);
    if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
    await audit(u,'coupon:redeemed','coupon_claim',r.rows[0].id);
    return ok({success:true,title:r.rows[0].title});
  }
  if(method==='GET'&&path==='location'){
    const place_id=trim(qs.get('id'));
    if(!validLocationId(place_id))return bad('Invalid place ID',400);
    if(osmId.test(place_id)){
      const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'",[place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      return ok({place:r.rows[0]});
    }
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$2 AND bf.business_id=places.business_id) AS following_business FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[place_id,user?.id||null]);
    if(!r.rowCount)return bad('Place not found',404);
    return ok({place:r.rows[0]});
  }
  if(method==='GET'&&path==='tours'){
    const u=need(user);
    const r=await query("SELECT t.id,t.title,t.share_token,t.created_at,t.updated_at,(SELECT count(*)::int FROM tour_stops st WHERE st.tour_id=t.id) AS stop_count FROM user_tours t WHERE t.owner_id=$1 ORDER BY t.updated_at DESC LIMIT 50",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='tours/details'){
    const u=need(user);
    const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
    const r=await query("SELECT id,title,share_token,created_at FROM user_tours WHERE id=$1 AND owner_id=$2",[tourId,u.id]);
    if(!r.rowCount)return bad('Tour not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time
      FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified')
      ORDER BY s.position`,[tourId]);
    return ok({tour:r.rows[0],stops:stops.rows});
  }
  if(method==='GET'&&path==='tours/shared'){
    const token=trim(qs.get('token'));
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
    const r=await query("SELECT id,title FROM user_tours WHERE share_token=$1 AND shared_at IS NOT NULL",[token]);
    if(!r.rowCount)return bad('Tour link not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified') ORDER BY s.position`,[r.rows[0].id]);
    return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true});
  }
  if(method==='POST'&&path==='tours'){
    rate(req,'tour');const u=need(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('save'),id:id.optional(),title:text(100),
        stop_ids:z.array(z.string().refine(validLocationId)).min(2).max(8),
        planned_times:z.array(z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).nullable()).max(8).optional()}),
      z.object({action:z.literal('share'),id,enabled:z.boolean()}),
      z.object({action:z.literal('delete'),id})
    ]),await payload(req));
    if(b.action==='delete'){
      const removed=await query('DELETE FROM user_tours WHERE id=$1 AND owner_id=$2 RETURNING id',[b.id,u.id]);
      if(!removed.rowCount)return bad('Tour not found',404);
      return ok({success:true});
    }
    if(b.action==='share'){
      const token=randomBytes(32).toString('base64url');
      const changed=await query(b.enabled
        ?"UPDATE user_tours SET share_token=coalesce(share_token,$3),shared_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token"
        :"UPDATE user_tours SET share_token=NULL,shared_at=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token",
        b.enabled?[b.id,u.id,token]:[b.id,u.id]);
      if(!changed.rowCount)return bad('Tour not found',404);
      return ok({success:true,token:changed.rows[0].share_token||null});
    }
    if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
    if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
    // Only actual public, geolocated venues may be stops. OSM data remains
    // explicitly unverified and is never silently promoted to a published place.
    for(const stop of b.stop_ids){
      const candidate=osmId.test(stop);
      const available=await query(candidate
        ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified' AND latitude IS NOT NULL AND longitude IS NOT NULL"
        :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed' AND latitude IS NOT NULL AND longitude IS NOT NULL",[stop]);
      if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
    }
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      let tourId=b.id;
      if(tourId){
        const owned=await tx.query('SELECT id FROM user_tours WHERE id=$1 AND owner_id=$2 FOR UPDATE',[tourId,u.id]);
        if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
        await tx.query('UPDATE user_tours SET title=$3,updated_at=now() WHERE id=$1 AND owner_id=$2',[tourId,u.id,b.title]);
        await tx.query('DELETE FROM tour_stops WHERE tour_id=$1',[tourId]);
      }else{
        const created=await tx.query('INSERT INTO user_tours(owner_id,title) VALUES($1,$2) RETURNING id',[u.id,b.title]);
        tourId=created.rows[0].id;
      }
      for(let i=0;i<b.stop_ids.length;i++){
        const stop=b.stop_ids[i],candidate=osmId.test(stop);
        await tx.query('INSERT INTO tour_stops(tour_id,position,place_id,osm_id,planned_time) VALUES($1,$2,$3,$4,$5)',
          [tourId,i+1,candidate?null:stop,candidate?stop:null,b.planned_times?.[i]||null]);
      }
      await tx.query('COMMIT');
      return ok({id:tourId,success:true},b.id?200:201);
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }

  if(method==='GET'&&path==='favorites/details'){
    const u=need(user);
    const [listed,candidates]=await Promise.all([
      query("SELECT p.id,p.name,p.category,p.district,p.address,p.latitude,p.longitude,p.website,p.description_de,p.description_en,p.source_url,p.image_url,p.verification_status,p.activity_status,p.verified_at,p.verification_source,p.opening_hours_text,(SELECT b.id FROM businesses b WHERE b.id=p.business_id AND b.status='approved') AS business_id,EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=p.business_id) AS following_business,f.created_at AS saved_at,false AS candidate FROM favorites f JOIN places p ON p.id=f.place_id WHERE f.user_id=$1 AND p.status='published' AND p.activity_status!='permanently_closed' ORDER BY f.created_at DESC LIMIT 120",[u.id]),
      query("SELECT dc.osm_id AS id,dc.osm_id,dc.name,dc.category,dc.address,dc.latitude,dc.longitude,dc.website,dc.phone,dc.osm_url AS source_url,dc.activity_status,'unverified' AS verification_status,dc.opening_hours AS opening_hours_text,cf.created_at AS saved_at,true AS candidate FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id WHERE cf.user_id=$1 AND dc.reviewed_status='unverified' ORDER BY cf.created_at DESC LIMIT 120",[u.id])
    ]);
    const items=[...listed.rows,...candidates.rows].sort((a,b)=>new Date(b.saved_at).getTime()-new Date(a.saved_at).getTime()).slice(0,120);
    return ok({items});
  }
  if(method==='GET'&&path==='favorites'){
    const u=need(user);
    const [published,candidates]=await Promise.all([
      query('SELECT place_id AS id FROM favorites WHERE user_id=$1',[u.id]),
      query('SELECT osm_id AS id FROM candidate_favorites WHERE user_id=$1',[u.id])
    ]);
    return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)});
  }
  if(method==='POST'&&path==='favorites'){
    const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
    if(osmId.test(b.place_id)){
      if(b.active){
        const r=await query("INSERT INTO candidate_favorites(user_id,osm_id) SELECT $1,osm_id FROM discovery_candidates WHERE osm_id=$2 AND reviewed_status='unverified' ON CONFLICT DO NOTHING RETURNING osm_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT osm_id FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);
    }else{
      if(b.active){
        const r=await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING RETURNING place_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT place_id FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    }
    return ok({success:true});
  }
  if(method==='POST'&&path==='place-reports'){
    rate(req,'place-report');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
      reason:z.enum(['closed','address','details','other']),message:z.string().trim().min(12).max(750)}),await payload(req));
    const isOsm=osmId.test(b.place_id);
    const exists=await query(isOsm?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status!='hidden'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query("INSERT INTO place_reports(user_id,place_id,osm_id,reason,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [u.id,isOsm?null:b.place_id,isOsm?b.place_id:null,b.reason,b.message]);
    await audit(u,'report:submitted','place_report',r.rows[0].id);
    return ok({id:r.rows[0].id,status:r.rows[0].status},201);
  }
  if(method==='POST'&&path==='reviews'){
    rate(req,'venue-review');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
    const isCandidate=osmId.test(b.place_id);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query(isCandidate
      ? "INSERT INTO venue_reviews(user_id,osm_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status"
      : "INSERT INTO venue_reviews(user_id,place_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,place_id) WHERE place_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status",
      [u.id,b.place_id,b.rating,b.body]);
    await audit(u,'review:submitted','venue_review',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='review-reports'){
    rate(req,'review-abuse');const u=need(user);
    const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
    const found=await query("SELECT id FROM venue_reviews WHERE id=$1 AND status='published' AND user_id!=$2",[b.review_id,u.id]);
    if(!found.rowCount)return bad('Review unavailable',404);
    const r=await query("INSERT INTO venue_review_reports(review_id,reporter_id,reason,message) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,reporter_id) DO NOTHING RETURNING id",
      [b.review_id,u.id,b.reason,b.message]);
    if(!r.rowCount)return bad('Already reported',409);
    await audit(u,'review:reported','venue_review',b.review_id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='post-likes'){
    rate(req,'post-like');const u=need(user);
    const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    if(b.active)await query("INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,b.post_id]);
    else await query("DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2",[u.id,b.post_id]);
    const count=await query("SELECT count(*)::int AS count FROM post_likes WHERE post_id=$1",[b.post_id]);
    return ok({success:true,liked:b.active,count:count.rows[0].count});
  }
  if(method==='POST'&&path==='comments'){
    rate(req,'post-comment');const u=need(user);
    const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    const r=await query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id,status",[b.post_id,u.id,b.body]);
    await audit(u,'comment:submitted','post_comment',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);
    const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    let placeId:string|null=null,candidateId:string|null=null;
    if(b.place_id){
      const candidate=osmId.test(b.place_id);
      const r=await query(candidate?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      if(candidate)candidateId=b.place_id;else placeId=b.place_id;
    }
    const r=await query("INSERT INTO posts(user_id,place_id,candidate_osm_id,body,media_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id,placeId,candidateId,b.body,media]);
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
    const [p,d,c,changes]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query("SELECT id,place_id,name,address,phone,website,opening_hours_text,status,submitted_at,editor_note FROM place_change_requests WHERE business_id=$1 ORDER BY submitted_at DESC LIMIT 40",[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows});
  }
  if(method==='POST'&&path==='business/places/change'){
    rate(req,'business-place-change');
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
      website:z.string().trim().max(1000).optional().default(''),phone:z.string().trim().max(40).optional().default(''),
      opening_hours_text:z.string().trim().max(300).optional().default('')}),await payload(req));
    if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
    const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
    const owned=await query("SELECT id FROM places WHERE id=$1 AND business_id=$2 AND status='published'",[b.place_id,business.id]);
    if(!owned.rowCount)return bad('Place not owned',403);
    const r=await query("INSERT INTO place_change_requests(place_id,business_id,submitted_by,name,address,website,phone,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(place_id) WHERE status='pending' DO UPDATE SET submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,website=excluded.website,phone=excluded.phone,opening_hours_text=excluded.opening_hours_text,submitted_at=now() RETURNING id,status",
      [b.place_id,business.id,u.id,b.name,b.address,website,b.phone||null,b.opening_hours_text||null]);
    await audit(u,'business:branch-change-requested','place_change',r.rows[0].id);
    return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }

  if(method==='GET'&&path==='admin/validation'){
    admin(user);
    const [counts,stale]=await Promise.all([
      query(`SELECT
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='unverified') AS kandidaten,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='needs_review') AS rueckfragen,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='hidden') AS ausgeblendet,
        (SELECT count(*)::int FROM discovery_candidates WHERE category='Apotheken') AS apotheken,
        (SELECT count(*)::int FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now()) AS aktuell_geprueft,
        (SELECT count(*)::int FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at < now()-interval '30 days')) AS offen_zur_pruefung`),
      query("SELECT id,name,category,verified_at,verification_source,verification_note FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days') ORDER BY verified_at ASC NULLS FIRST,name LIMIT 25")
    ]);
    return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false});
  }
  if(method==='GET'&&path==='admin/candidates'){
    admin(user);
    const q=trim(qs.get('q')).slice(0,90);
    const cat=trim(qs.get('category')).slice(0,70);
    const state=trim(qs.get('state'))||'unverified';
    if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
    const page=Number(qs.get('page')||0);
    const offset=Number.isFinite(page)?Math.min(Math.max(Math.floor(page),0),1000)*25:0;
    const args=[state,cat,q,offset];
    const where="WHERE reviewed_status=$1 AND ($2='' OR category=$2) AND ($3='' OR name ILIKE '%'||$3||'%' OR address ILIKE '%'||$3||'%')";
    const [r,n]=await Promise.all([
      query("SELECT osm_id,name,category,address,website,phone,opening_hours,last_osm_check,osm_url,latitude,longitude,reviewed_status FROM discovery_candidates "+where+" ORDER BY CASE WHEN website IS NOT NULL AND website!='' THEN 0 ELSE 1 END,category,name,osm_id LIMIT 25 OFFSET $4",args),
      query("SELECT count(*)::int AS total FROM discovery_candidates "+where,args.slice(0,3))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset});
  }
  if(method==='POST'&&path==='admin/review-candidate'){
    const u=admin(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('publish'),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        verification_source:z.url().max(1000),
        verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
        verification_note:z.string().trim().min(25).max(2000),
        confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_operation:z.literal(true),
        editorial_rank:z.number().int().min(0).max(100).default(0),
        opening_hours_text:z.string().trim().max(300).optional().default('')}),
      z.object({action:z.enum(['hide','needs_review']),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        reason:z.string().trim().min(10).max(500)})
    ]),await payload(req));
    const proof=b.action==='publish'?independentProof(b.verification_source):null;
    if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const source=await tx.query("SELECT * FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status IN ('unverified','needs_review') FOR UPDATE",[b.osm_id]);
      const c=source.rows[0];
      if(!c)throw conflict('Eintrag bereits bearbeitet oder nicht gefunden');
      if(b.action==='publish'){
        const duplicate=await tx.query("SELECT id,name FROM places WHERE osm_id=$1 OR (lower(name)=lower($2) AND latitude IS NOT NULL AND longitude IS NOT NULL AND abs(latitude-$3)<0.0005 AND abs(longitude-$4)<0.0008) LIMIT 1",[c.osm_id,c.name,c.latitude,c.longitude]);
        if(duplicate.rowCount)throw conflict('Ein ähnlicher Ort existiert bereits. Bitte den bestehenden Eintrag prüfen: '+duplicate.rows[0].name);
        const inserted=await tx.query(
          "INSERT INTO places(osm_id,name,category,address,latitude,longitude,website,source_url,status,description_de,verification_status,activity_status,verification_source,verification_method,verification_note,verified_by,verified_at,editorial_rank,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,'verified','operating',$10,$11,$12,$13,now(),$14,$15) RETURNING id",
          [c.osm_id,c.name,c.category,c.address,c.latitude,c.longitude,c.website,c.osm_url,'Redaktionell auf Betriebsstatus überprüft. Zeiten bitte direkt beim Anbieter prüfen.',proof,b.verification_method,b.verification_note,u.id,b.editorial_rank,b.opening_hours_text]);
        await tx.query("UPDATE discovery_candidates SET reviewed_status='hidden' WHERE osm_id=$1",[c.osm_id]);
        await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'publish:independent-source-review','place',$2)",[u.id,inserted.rows[0].id]);
        await tx.query('COMMIT');
        return ok({success:true,id:inserted.rows[0].id,verified:true});
      }
      await tx.query('UPDATE discovery_candidates SET reviewed_status=$2 WHERE osm_id=$1',[b.osm_id,b.action==='hide'?'hidden':'needs_review']);
      await tx.query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,b.action+':'+b.reason,'discovery_candidate',b.osm_id]);
      await tx.query('COMMIT');
      return ok({success:true,verified:false});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'"),
      query("SELECT r.id,r.reason,r.message AS note,COALESCE(p.name,dc.name) AS place_name FROM place_reports r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 60"),
      query("SELECT r.id,r.rating,r.body,COALESCE(p.name,dc.name) AS place_name FROM venue_reviews r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 80"),
      query("SELECT rr.id,rr.review_id,rr.reason,rr.message AS note,vr.body,COALESCE(p.name,dc.name) AS place_name FROM venue_review_reports rr JOIN venue_reviews vr ON vr.id=rr.review_id LEFT JOIN places p ON p.id=vr.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=vr.osm_id WHERE rr.status='pending' ORDER BY rr.created_at LIMIT 60"),
      query("SELECT c.id,c.body,LEFT(p.body,80) AS title FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 80"),
      query("SELECT cr.id,cr.name,cr.address,cr.website,cr.phone,cr.opening_hours_text,cr.submitted_at,p.name AS place_name,b.name AS business_name FROM place_change_requests cr JOIN places p ON p.id=cr.place_id JOIN businesses b ON b.id=cr.business_id WHERE cr.status='pending' ORDER BY cr.submitted_at ASC LIMIT 80")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows,reports:reports.rows,reviews:reviews.rows,reviewReports:reviewReports.rows,comments:comments.rows,branchChanges:branchChanges.rows});
  }
  if(method==='POST'&&path==='admin/review-place-change'){
    const u=admin(user);
    const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const request=await tx.query("SELECT * FROM place_change_requests WHERE id=$1 AND status='pending' FOR UPDATE",[b.id]);
      const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
      if(b.approve){
        const updated=await tx.query("UPDATE places SET name=$2,address=$3,website=$4,phone=$5,opening_hours_text=$6,verification_status='unverified',activity_status='unknown',verified_at=NULL,verification_source=NULL,verification_method=NULL,verification_note=NULL,verified_by=NULL,editorial_rank=0,updated_at=now() WHERE id=$1 AND business_id=$7 AND status='published' AND EXISTS(SELECT 1 FROM businesses b WHERE b.id=$7 AND b.status='approved') RETURNING id",
          [change.place_id,change.name,change.address,change.website,change.phone,change.opening_hours_text,change.business_id]);
        if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
      }
      await tx.query("UPDATE place_change_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),editor_note=$4 WHERE id=$1",[b.id,b.approve?'approved':'rejected',u.id,b.note]);
      await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place_change',$3)",[u.id,b.approve?'editor:branch-change-approved':'editor:branch-change-rejected',b.id]);
      await tx.query('COMMIT');return ok({success:true,status:b.approve?'approved':'rejected'});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='POST'&&path==='admin/moderate-review'){
    const u=admin(user);const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
    const target=b.approve?'published':'rejected';
    const result=await query("UPDATE venue_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",[b.id,target,u.id]);
    if(!result.rowCount)return bad('Pending review not found',404);
    await audit(u,'review:'+target,'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/moderate-review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const result=await query("UPDATE venue_review_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,review_id",
      [b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!result.rowCount)return bad('Pending review report not found',404);
    // Review and report flags remain separate; a moderator must decide removal.
    await audit(u,b.reviewed?'review-report:reviewed':'review-report:rejected','venue_review_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/remove-review'){
    const u=admin(user);const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
    const r=await query("UPDATE venue_reviews SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='published' RETURNING id",[b.id,u.id]);
    if(!r.rowCount)return bad('Published review not found',404);
    await audit(u,'review:removed:'+b.reason.slice(0,70),'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const r=await query("UPDATE place_reports SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id,osm_id,place_id",[b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!r.rowCount)return bad('Report not found',404);
    // This records review only; independent verification is required for a
    // status change or candidate hide, preventing false closure assertions.
    await audit(u,b.reviewed?'report:reviewed':'report:rejected','place_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published'],comment:['post_comments','published']} as const;
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
      verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
      verification_note:z.string().trim().min(25).max(2000),
      confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_status:z.literal(true),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=independentProof(b.verification_source);
    if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,verification_method=$6,verification_note=$7,verified_by=$8,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text,b.verification_method,b.verification_note,u.id]);
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
+c;
    const baseWhere="WHERE reviewed_status='unverified' AND ($1='' OR category=$1) AND ($2='' OR name ILIKE '%'||$2||'%' OR address ILIKE '%'||$2||'%') AND ($3::float8 IS NULL OR (longitude BETWEEN $3 AND $5 AND latitude BETWEEN $4 AND $6))";
    const where=baseWhere+(near?nearClause(9,10,11):'');
    const countWhere=baseWhere+(near?nearClause(7,8,9):'');
    const placeParams=near?[...params,lat,lon,radius]:params;
    const countParams=near?[...params.slice(0,6),lat,lon,radius]:params.slice(0,6);
    const [r,n]=await Promise.all([
      query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,last_osm_check,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates "+where+" ORDER BY category,name,osm_id LIMIT $7 OFFSET $8",placeParams),
      query("SELECT count(*)::int AS count FROM discovery_candidates "+countWhere,countParams)
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
    const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,osm_url AS source_url,website,phone,opening_hours AS opening_hours_text FROM discovery_candidates WHERE reviewed_status='unverified' AND longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4 AND ($5='' OR category=$5) ORDER BY osm_id LIMIT 1500",[raw[0],raw[1],raw[2],raw[3],validCategory==='Alle'?'':validCategory]);
    return ok({items:r.rows,limited:r.rowCount===1500,verified:false,source:'© OpenStreetMap-Mitwirkende · ODbL'});
  }
  if(method==='GET'&&path==='pharmacy-notdienst'){
    // External, official, dynamic duty rota. No guesses or caching duty data.
    return ok({url:'https://www.aponet.de/notdienstsuche/60320-Frankfurt',source:'aponet · Bundesapothekerkammer',
      notice:'Den aktuellen Apotheken-Notdienst bitte unmittelbar auf der offiziellen Seite prüfen. Kein Notdienst wurde hier als aktuell bestätigt.'});
  }
  if(method==='GET'&&path==='event-favorites'){
    const u=need(user);
    const r=await query("SELECT e.id,e.title,e.venue,e.starts_at,e.description_de,e.ticket_url FROM event_favorites f JOIN events e ON e.id=f.event_id WHERE f.user_id=$1 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ORDER BY e.starts_at ASC LIMIT 100",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='POST'&&path==='event-favorites'){
    rate(req,'event-favorite');const u=need(user);
    const b=parse(z.object({event_id:id,active:z.boolean()}),await payload(req));
    if(b.active){
      const r=await query("INSERT INTO event_favorites(user_id,event_id) SELECT $1,e.id FROM events e WHERE e.id=$2 AND e.status='published' AND e.starts_at>=now()-interval '1 day' ON CONFLICT DO NOTHING RETURNING event_id",[u.id,b.event_id]);
      if(!r.rowCount){
        const existing=await query('SELECT event_id FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
        if(!existing.rowCount)return bad('Event not available',404);
      }
    }else await query('DELETE FROM event_favorites WHERE user_id=$1 AND event_id=$2',[u.id,b.event_id]);
    return ok({saved:b.active});
  }
  if(method==='GET'&&path==='events'){const r=await query("SELECT * FROM events WHERE status='published' AND starts_at>=now()-interval '1 day' ORDER BY starts_at LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='news'){const r=await query("SELECT * FROM news WHERE status='published' ORDER BY published_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='reviews'){
    const venueId=trim(qs.get('place_id'));
    if(!validLocationId(venueId))return bad('Invalid place ID');
    const isCandidate=osmId.test(venueId);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[venueId]);
    if(!exists.rowCount)return bad('Place not found',404);
    const col=isCandidate?'osm_id':'place_id';
    const [summary,items]=await Promise.all([
      query("SELECT count(*)::int AS count,round(avg(rating)::numeric,1)::float AS average FROM venue_reviews WHERE "+col+"=$1 AND status='published'",[venueId]),
      query("SELECT r.id,r.rating,r.body,r.created_at,LEFT(u.display_name,1) AS display_name FROM venue_reviews r JOIN users u ON u.id=r.user_id WHERE r."+col+"=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 30",[venueId])
    ]);
    return ok({summary:summary.rows[0],items:items.rows});
  }
  if(method==='GET'&&path==='posts'){
    const following=qs.get('scope')==='following';
    if(qs.has('scope')&&!['all','following'].includes(qs.get('scope')||''))return bad('Invalid feed scope');
    if(following&&!user)return bad('Login required',401);
    const r=await query(`SELECT p.id,p.user_id AS author_id,p.body,p.media_url,p.created_at,
      LEFT(u.display_name,1) AS display_name,COALESCE(pl.name,dc.name) AS place_name,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes_count,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id AND c.status='published') AS comments_count,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
      EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id) AS following_author,
      (p.user_id=$1) AS own_post
      FROM posts p JOIN users u ON u.id=p.user_id
      LEFT JOIN places pl ON pl.id=p.place_id
      LEFT JOIN businesses bu ON bu.id=pl.business_id AND bu.status='approved'
      LEFT JOIN discovery_candidates dc ON dc.osm_id=p.candidate_osm_id
      WHERE p.status='published' AND ($2::boolean IS FALSE OR
        EXISTS(SELECT 1 FROM user_follows uf WHERE uf.follower_id=$1 AND uf.followed_id=p.user_id)
        OR (bu.id IS NOT NULL AND EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=bu.id)))
      ORDER BY p.created_at DESC LIMIT 40`,[user?.id||null,following]);
    return ok({items:r.rows,scope:following?'following':'all'});
  }
  if(method==='GET'&&path==='follows'){
    // Only the current user can see their own followed people and businesses.
    const u=need(user);
    const [people,businesses]=await Promise.all([
      query("SELECT uf.followed_id AS id,LEFT(us.display_name,1) AS display_name FROM user_follows uf JOIN users us ON us.id=uf.followed_id WHERE uf.follower_id=$1 ORDER BY uf.created_at DESC LIMIT 100",[u.id]),
      query("SELECT bf.business_id AS id,b.name FROM business_follows bf JOIN businesses b ON b.id=bf.business_id WHERE bf.follower_id=$1 AND b.status='approved' ORDER BY bf.created_at DESC LIMIT 100",[u.id])
    ]);
    return ok({people:people.rows,businesses:businesses.rows});
  }
  if(method==='POST'&&path==='follows'){
    rate(req,'follow');const u=need(user);
    const b=parse(z.object({
      target_type:z.enum(['user','business']),
      target_id:id,
      active:z.boolean()
    }),await payload(req));
    if(b.target_type==='user'){
      if(b.target_id===u.id)return bad('Cannot follow yourself');
      if(b.active){
        const created=await query("INSERT INTO user_follows(follower_id,followed_id) SELECT $1,id FROM users WHERE id=$2 AND EXISTS(SELECT 1 FROM posts WHERE user_id=$2 AND status='published') ON CONFLICT DO NOTHING RETURNING followed_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT followed_id FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Author not available',404);
        }
      }else await query('DELETE FROM user_follows WHERE follower_id=$1 AND followed_id=$2',[u.id,b.target_id]);
    }else{
      if(b.active){
        // Businesses are followable only after approval AND after a location
        // is publicly published; claiming an OSM record does not qualify.
        const created=await query("INSERT INTO business_follows(follower_id,business_id) SELECT $1,b.id FROM businesses b WHERE b.id=$2 AND b.status='approved' AND b.owner_id!=$1 AND EXISTS(SELECT 1 FROM places p WHERE p.business_id=b.id AND p.status='published' AND p.activity_status!='permanently_closed') ON CONFLICT DO NOTHING RETURNING business_id",[u.id,b.target_id]);
        if(!created.rowCount){
          const existing=await query('SELECT business_id FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
          if(!existing.rowCount)return bad('Business not available',404);
        }
      }else await query('DELETE FROM business_follows WHERE follower_id=$1 AND business_id=$2',[u.id,b.target_id]);
    }
    return ok({following:b.active});
  }
  if(method==='GET'&&path==='comments'){
    const postId=qs.get('post_id')||'';if(!id.safeParse(postId).success)return bad('Invalid post ID');
    const post=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[postId]);
    if(!post.rowCount)return bad('Post not found',404);
    const r=await query("SELECT c.id,c.body,c.created_at,LEFT(u.display_name,1) AS display_name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 AND c.status='published' ORDER BY c.created_at ASC LIMIT 60",[postId]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='deals'){const r=await query("SELECT d.id,d.title,d.details,d.valid_until,b.name AS business_name,p.name AS place_name FROM deals d JOIN businesses b ON b.id=d.business_id LEFT JOIN places p ON p.id=d.place_id WHERE d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now()) ORDER BY d.created_at DESC LIMIT 40");return ok({items:r.rows});}
  if(method==='GET'&&path==='coupons'){
    const u=need(user);
    const r=await query("SELECT c.id,c.deal_id,c.code,c.created_at,c.redeemed_at,d.title,d.valid_until,b.name AS business_name, (d.status='published' AND b.status='approved' AND (d.valid_until IS NULL OR d.valid_until>now())) AS available FROM coupon_claims c JOIN deals d ON d.id=c.deal_id JOIN businesses b ON b.id=d.business_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 100",[u.id]);
    const response=ok({items:r.rows});response.headers.set('Cache-Control','no-store, private');return response;
  }
  if(method==='POST'&&path==='coupons/claim'){
    rate(req,'coupon-claim');const u=need(user);
    const b=parse(z.object({deal_id:id}),await payload(req));
    const found=await query("SELECT d.id FROM deals d JOIN businesses b ON b.id=d.business_id WHERE d.id=$1 AND d.status='published' AND b.status='approved' AND b.owner_id!=$2 AND (d.valid_until IS NULL OR d.valid_until>now())",[b.deal_id,u.id]);
    if(!found.rowCount)return bad('Coupon not available',404);
    const secret=randomBytes(18).toString('base64url');
    const r=await query("INSERT INTO coupon_claims(deal_id,user_id,code) VALUES($1,$2,$3) ON CONFLICT(deal_id,user_id) DO UPDATE SET deal_id=excluded.deal_id RETURNING code,redeemed_at",
      [b.deal_id,u.id,secret]);
    return ok({code:r.rows[0].code,redeemed:Boolean(r.rows[0].redeemed_at)});
  }
  if(method==='POST'&&path==='business/coupons/redeem'){
    rate(req,'coupon-redeem');const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({code:z.string().regex(/^[A-Za-z0-9_-]{24}$/)}),await payload(req));
    // Atomic: never allow a second redemption, even on concurrent requests.
    const r=await query("UPDATE coupon_claims c SET redeemed_at=now(),redeemed_by=$2 FROM deals d WHERE c.code=$1 AND c.deal_id=d.id AND d.business_id=$3 AND d.status='published' AND (d.valid_until IS NULL OR d.valid_until>now()) AND c.redeemed_at IS NULL RETURNING c.id,d.title",
      [b.code,u.id,business.id]);
    if(!r.rowCount)return bad('Coupon invalid, expired or already redeemed',409);
    await audit(u,'coupon:redeemed','coupon_claim',r.rows[0].id);
    return ok({success:true,title:r.rows[0].title});
  }
  if(method==='GET'&&path==='location'){
    const place_id=trim(qs.get('id'));
    if(!validLocationId(place_id))return bad('Invalid place ID',400);
    if(osmId.test(place_id)){
      const r=await query("SELECT osm_id AS id,osm_id,name,category,latitude,longitude,address,website,phone,opening_hours AS opening_hours_text,osm_url AS source_url,activity_status,'unverified' AS verification_status,false AS demo,true AS candidate FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'",[place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      return ok({place:r.rows[0]});
    }
    const r=await query("SELECT id,name,category,district,description_de,description_en,address,latitude,longitude,website,image_url,source_url,verification_status,activity_status,verified_at,verification_source,editorial_rank,opening_hours_text,phone, CASE WHEN business_id IN (SELECT id FROM businesses WHERE status='approved') THEN business_id ELSE NULL END AS business_id, EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$2 AND bf.business_id=places.business_id) AS following_business FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[place_id,user?.id||null]);
    if(!r.rowCount)return bad('Place not found',404);
    return ok({place:r.rows[0]});
  }
  if(method==='GET'&&path==='tours'){
    const u=need(user);
    const r=await query("SELECT t.id,t.title,t.share_token,t.created_at,t.updated_at,(SELECT count(*)::int FROM tour_stops st WHERE st.tour_id=t.id) AS stop_count FROM user_tours t WHERE t.owner_id=$1 ORDER BY t.updated_at DESC LIMIT 50",[u.id]);
    return ok({items:r.rows});
  }
  if(method==='GET'&&path==='tours/details'){
    const u=need(user);
    const tourId=qs.get('id')||'';if(!id.safeParse(tourId).success)return bad('Invalid tour ID');
    const r=await query("SELECT id,title,share_token,created_at FROM user_tours WHERE id=$1 AND owner_id=$2",[tourId,u.id]);
    if(!r.rowCount)return bad('Tour not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time
      FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified')
      ORDER BY s.position`,[tourId]);
    return ok({tour:r.rows[0],stops:stops.rows});
  }
  if(method==='GET'&&path==='tours/shared'){
    const token=trim(qs.get('token'));
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))return bad('Invalid tour link',404);
    const r=await query("SELECT id,title FROM user_tours WHERE share_token=$1 AND shared_at IS NOT NULL",[token]);
    if(!r.rowCount)return bad('Tour link not found',404);
    const stops=await query(`SELECT COALESCE(s.osm_id,p.id::text) AS id,coalesce(p.name,c.name) AS name,
      coalesce(p.address,c.address) AS address,coalesce(p.category,c.category) AS category,
      coalesce(p.latitude,c.latitude) AS latitude,coalesce(p.longitude,c.longitude) AS longitude,
      CASE WHEN c.osm_id IS NOT NULL THEN 'unverified' ELSE p.verification_status END AS verification_status,
      s.planned_time FROM tour_stops s LEFT JOIN places p ON p.id=s.place_id
      LEFT JOIN discovery_candidates c ON c.osm_id=s.osm_id
      WHERE s.tour_id=$1 AND (p.status='published' AND p.activity_status!='permanently_closed'
        OR c.reviewed_status='unverified') ORDER BY s.position`,[r.rows[0].id]);
    return ok({tour:{title:r.rows[0].title},stops:stops.rows,shared:true});
  }
  if(method==='POST'&&path==='tours'){
    rate(req,'tour');const u=need(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('save'),id:id.optional(),title:text(100),
        stop_ids:z.array(z.string().refine(validLocationId)).min(2).max(8),
        planned_times:z.array(z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/).nullable()).max(8).optional()}),
      z.object({action:z.literal('share'),id,enabled:z.boolean()}),
      z.object({action:z.literal('delete'),id})
    ]),await payload(req));
    if(b.action==='delete'){
      const removed=await query('DELETE FROM user_tours WHERE id=$1 AND owner_id=$2 RETURNING id',[b.id,u.id]);
      if(!removed.rowCount)return bad('Tour not found',404);
      return ok({success:true});
    }
    if(b.action==='share'){
      const token=randomBytes(32).toString('base64url');
      const changed=await query(b.enabled
        ?"UPDATE user_tours SET share_token=coalesce(share_token,$3),shared_at=now(),updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token"
        :"UPDATE user_tours SET share_token=NULL,shared_at=NULL,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING share_token",
        b.enabled?[b.id,u.id,token]:[b.id,u.id]);
      if(!changed.rowCount)return bad('Tour not found',404);
      return ok({success:true,token:changed.rows[0].share_token||null});
    }
    if(new Set(b.stop_ids).size!==b.stop_ids.length)return bad('Each stop can appear only once');
    if(b.planned_times&&b.planned_times.length!==b.stop_ids.length)return bad('Times do not match stops');
    // Only actual public, geolocated venues may be stops. OSM data remains
    // explicitly unverified and is never silently promoted to a published place.
    for(const stop of b.stop_ids){
      const candidate=osmId.test(stop);
      const available=await query(candidate
        ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified' AND latitude IS NOT NULL AND longitude IS NOT NULL"
        :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed' AND latitude IS NOT NULL AND longitude IS NOT NULL",[stop]);
      if(!available.rowCount)return bad('Tour stop is not an accessible real venue',404);
    }
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      let tourId=b.id;
      if(tourId){
        const owned=await tx.query('SELECT id FROM user_tours WHERE id=$1 AND owner_id=$2 FOR UPDATE',[tourId,u.id]);
        if(!owned.rowCount){await tx.query('ROLLBACK');return bad('Tour not found',404)}
        await tx.query('UPDATE user_tours SET title=$3,updated_at=now() WHERE id=$1 AND owner_id=$2',[tourId,u.id,b.title]);
        await tx.query('DELETE FROM tour_stops WHERE tour_id=$1',[tourId]);
      }else{
        const created=await tx.query('INSERT INTO user_tours(owner_id,title) VALUES($1,$2) RETURNING id',[u.id,b.title]);
        tourId=created.rows[0].id;
      }
      for(let i=0;i<b.stop_ids.length;i++){
        const stop=b.stop_ids[i],candidate=osmId.test(stop);
        await tx.query('INSERT INTO tour_stops(tour_id,position,place_id,osm_id,planned_time) VALUES($1,$2,$3,$4,$5)',
          [tourId,i+1,candidate?null:stop,candidate?stop:null,b.planned_times?.[i]||null]);
      }
      await tx.query('COMMIT');
      return ok({id:tourId,success:true},b.id?200:201);
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }

  if(method==='GET'&&path==='favorites/details'){
    const u=need(user);
    const [listed,candidates]=await Promise.all([
      query("SELECT p.id,p.name,p.category,p.district,p.address,p.latitude,p.longitude,p.website,p.description_de,p.description_en,p.source_url,p.image_url,p.verification_status,p.activity_status,p.verified_at,p.verification_source,p.opening_hours_text,(SELECT b.id FROM businesses b WHERE b.id=p.business_id AND b.status='approved') AS business_id,EXISTS(SELECT 1 FROM business_follows bf WHERE bf.follower_id=$1 AND bf.business_id=p.business_id) AS following_business,f.created_at AS saved_at,false AS candidate FROM favorites f JOIN places p ON p.id=f.place_id WHERE f.user_id=$1 AND p.status='published' AND p.activity_status!='permanently_closed' ORDER BY f.created_at DESC LIMIT 120",[u.id]),
      query("SELECT dc.osm_id AS id,dc.osm_id,dc.name,dc.category,dc.address,dc.latitude,dc.longitude,dc.website,dc.phone,dc.osm_url AS source_url,dc.activity_status,'unverified' AS verification_status,dc.opening_hours AS opening_hours_text,cf.created_at AS saved_at,true AS candidate FROM candidate_favorites cf JOIN discovery_candidates dc ON dc.osm_id=cf.osm_id WHERE cf.user_id=$1 AND dc.reviewed_status='unverified' ORDER BY cf.created_at DESC LIMIT 120",[u.id])
    ]);
    const items=[...listed.rows,...candidates.rows].sort((a,b)=>new Date(b.saved_at).getTime()-new Date(a.saved_at).getTime()).slice(0,120);
    return ok({items});
  }
  if(method==='GET'&&path==='favorites'){
    const u=need(user);
    const [published,candidates]=await Promise.all([
      query('SELECT place_id AS id FROM favorites WHERE user_id=$1',[u.id]),
      query('SELECT osm_id AS id FROM candidate_favorites WHERE user_id=$1',[u.id])
    ]);
    return ok({items:[...published.rows,...candidates.rows].map(x=>x.id)});
  }
  if(method==='POST'&&path==='favorites'){
    const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),active:z.boolean()}),await payload(req));
    if(osmId.test(b.place_id)){
      if(b.active){
        const r=await query("INSERT INTO candidate_favorites(user_id,osm_id) SELECT $1,osm_id FROM discovery_candidates WHERE osm_id=$2 AND reviewed_status='unverified' ON CONFLICT DO NOTHING RETURNING osm_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT osm_id FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM candidate_favorites WHERE user_id=$1 AND osm_id=$2',[u.id,b.place_id]);
    }else{
      if(b.active){
        const r=await query("INSERT INTO favorites(user_id,place_id) SELECT $1,id FROM places WHERE id=$2 AND status='published' ON CONFLICT DO NOTHING RETURNING place_id",[u.id,b.place_id]);
        if(!r.rowCount){const exists=await query('SELECT place_id FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);if(!exists.rowCount)return bad('Place not found',404);}
      } else await query('DELETE FROM favorites WHERE user_id=$1 AND place_id=$2',[u.id,b.place_id]);
    }
    return ok({success:true});
  }
  if(method==='POST'&&path==='place-reports'){
    rate(req,'place-report');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),
      reason:z.enum(['closed','address','details','other']),message:z.string().trim().min(12).max(750)}),await payload(req));
    const isOsm=osmId.test(b.place_id);
    const exists=await query(isOsm?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status!='hidden'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query("INSERT INTO place_reports(user_id,place_id,osm_id,reason,message) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
      [u.id,isOsm?null:b.place_id,isOsm?b.place_id:null,b.reason,b.message]);
    await audit(u,'report:submitted','place_report',r.rows[0].id);
    return ok({id:r.rows[0].id,status:r.rows[0].status},201);
  }
  if(method==='POST'&&path==='reviews'){
    rate(req,'venue-review');const u=need(user);
    const b=parse(z.object({place_id:z.string().max(90).refine(validLocationId),rating:z.number().int().min(1).max(5),body:z.string().trim().min(20).max(1000)}),await payload(req));
    const isCandidate=osmId.test(b.place_id);
    const exists=await query(isCandidate
      ?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'"
      :"SELECT id FROM places WHERE id=$1 AND status='published' AND activity_status!='permanently_closed'",[b.place_id]);
    if(!exists.rowCount)return bad('Place not found',404);
    const r=await query(isCandidate
      ? "INSERT INTO venue_reviews(user_id,osm_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status"
      : "INSERT INTO venue_reviews(user_id,place_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT (user_id,place_id) WHERE place_id IS NOT NULL DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending',updated_at=now(),reviewed_by=NULL,reviewed_at=NULL RETURNING id,status",
      [u.id,b.place_id,b.rating,b.body]);
    await audit(u,'review:submitted','venue_review',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='review-reports'){
    rate(req,'review-abuse');const u=need(user);
    const b=parse(z.object({review_id:id,reason:z.enum(['spam','abuse','privacy','incorrect','other']),message:optionalText(500)}),await payload(req));
    const found=await query("SELECT id FROM venue_reviews WHERE id=$1 AND status='published' AND user_id!=$2",[b.review_id,u.id]);
    if(!found.rowCount)return bad('Review unavailable',404);
    const r=await query("INSERT INTO venue_review_reports(review_id,reporter_id,reason,message) VALUES($1,$2,$3,$4) ON CONFLICT(review_id,reporter_id) DO NOTHING RETURNING id",
      [b.review_id,u.id,b.reason,b.message]);
    if(!r.rowCount)return bad('Already reported',409);
    await audit(u,'review:reported','venue_review',b.review_id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='post-likes'){
    rate(req,'post-like');const u=need(user);
    const b=parse(z.object({post_id:id,active:z.boolean()}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    if(b.active)await query("INSERT INTO post_likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,b.post_id]);
    else await query("DELETE FROM post_likes WHERE user_id=$1 AND post_id=$2",[u.id,b.post_id]);
    const count=await query("SELECT count(*)::int AS count FROM post_likes WHERE post_id=$1",[b.post_id]);
    return ok({success:true,liked:b.active,count:count.rows[0].count});
  }
  if(method==='POST'&&path==='comments'){
    rate(req,'post-comment');const u=need(user);
    const b=parse(z.object({post_id:id,body:z.string().trim().min(3).max(800)}),await payload(req));
    const visible=await query("SELECT id FROM posts WHERE id=$1 AND status='published'",[b.post_id]);
    if(!visible.rowCount)return bad('Post not found',404);
    const r=await query("INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3) RETURNING id,status",[b.post_id,u.id,b.body]);
    await audit(u,'comment:submitted','post_comment',r.rows[0].id);
    return ok({id:r.rows[0].id,status:'pending'},201);
  }
  if(method==='POST'&&path==='posts'){
    rate(req,'post');const u=need(user);
    const b=parse(z.object({body:text(1000),place_id:z.string().refine(validLocationId).nullish(),media_url:z.string().max(1000).optional()}),await payload(req));
    const media=allowedUrl(b.media_url);if(b.media_url&&!media)return bad('Invalid media link');
    let placeId:string|null=null,candidateId:string|null=null;
    if(b.place_id){
      const candidate=osmId.test(b.place_id);
      const r=await query(candidate?"SELECT osm_id FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status='unverified'":"SELECT id FROM places WHERE id=$1 AND status='published'",[b.place_id]);
      if(!r.rowCount)return bad('Place not found',404);
      if(candidate)candidateId=b.place_id;else placeId=b.place_id;
    }
    const r=await query("INSERT INTO posts(user_id,place_id,candidate_osm_id,body,media_url) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [u.id,placeId,candidateId,b.body,media]);
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
    const [p,d,c,changes]=await Promise.all([query('SELECT * FROM places WHERE business_id=$1',[b.id]),query('SELECT * FROM deals WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query('SELECT * FROM claims WHERE business_id=$1 ORDER BY created_at DESC',[b.id]),query("SELECT id,place_id,name,address,phone,website,opening_hours_text,status,submitted_at,editor_note FROM place_change_requests WHERE business_id=$1 ORDER BY submitted_at DESC LIMIT 40",[b.id])]);
    return ok({business:b,places:p.rows,deals:d.rows,claims:c.rows,changes:changes.rows});
  }
  if(method==='POST'&&path==='business/places/change'){
    rate(req,'business-place-change');
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({place_id:id,name:text(150),address:optionalText(200),
      website:z.string().trim().max(1000).optional().default(''),phone:z.string().trim().max(40).optional().default(''),
      opening_hours_text:z.string().trim().max(300).optional().default('')}),await payload(req));
    if(b.phone&&!/^\+?[0-9\s().\-/]{4,40}$/.test(b.phone))return bad('Invalid phone');
    const website=allowedUrl(b.website);if(b.website&&!website)return bad('Invalid website');
    const owned=await query("SELECT id FROM places WHERE id=$1 AND business_id=$2 AND status='published'",[b.place_id,business.id]);
    if(!owned.rowCount)return bad('Place not owned',403);
    const r=await query("INSERT INTO place_change_requests(place_id,business_id,submitted_by,name,address,website,phone,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(place_id) WHERE status='pending' DO UPDATE SET submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,website=excluded.website,phone=excluded.phone,opening_hours_text=excluded.opening_hours_text,submitted_at=now() RETURNING id,status",
      [b.place_id,business.id,u.id,b.name,b.address,website,b.phone||null,b.opening_hours_text||null]);
    await audit(u,'business:branch-change-requested','place_change',r.rows[0].id);
    return ok(r.rows[0],201);
  }
  if(method==='POST'&&path==='deals'){
    const u=need(user),business=await ownBusiness(u);
    if(business.status!=='approved')return bad('Business verification pending',403);
    const b=parse(z.object({title:text(150),details:optionalText(1000),place_id:id.nullish()}),await payload(req));
    if(b.place_id){const owned=await query('SELECT id FROM places WHERE id=$1 AND business_id=$2',[b.place_id,business.id]);if(!owned.rowCount)return bad('Place not owned',403);}
    const r=await query('INSERT INTO deals(business_id,place_id,title,details) VALUES($1,$2,$3,$4) RETURNING id,status',[business.id,b.place_id||null,b.title,b.details]);return ok(r.rows[0],201);
  }

  if(method==='GET'&&path==='admin/validation'){
    admin(user);
    const [counts,stale]=await Promise.all([
      query(`SELECT
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='unverified') AS kandidaten,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='needs_review') AS rueckfragen,
        (SELECT count(*)::int FROM discovery_candidates WHERE reviewed_status='hidden') AS ausgeblendet,
        (SELECT count(*)::int FROM discovery_candidates WHERE category='Apotheken') AS apotheken,
        (SELECT count(*)::int FROM places WHERE status='published' AND verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now()) AS aktuell_geprueft,
        (SELECT count(*)::int FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at < now()-interval '30 days')) AS offen_zur_pruefung`),
      query("SELECT id,name,category,verified_at,verification_source,verification_note FROM places WHERE status='published' AND activity_status!='permanently_closed' AND (verification_status!='verified' OR verified_at IS NULL OR verified_at<now()-interval '30 days') ORDER BY verified_at ASC NULLS FIRST,name LIMIT 25")
    ]);
    return ok({stats:counts.rows[0],recheck:stale.rows,validity_days:30,opening_now_guaranteed:false});
  }
  if(method==='GET'&&path==='admin/candidates'){
    admin(user);
    const q=trim(qs.get('q')).slice(0,90);
    const cat=trim(qs.get('category')).slice(0,70);
    const state=trim(qs.get('state'))||'unverified';
    if(!['unverified','needs_review'].includes(state))return bad('Ungültiger Prüfstatus');
    const page=Number(qs.get('page')||0);
    const offset=Number.isFinite(page)?Math.min(Math.max(Math.floor(page),0),1000)*25:0;
    const args=[state,cat,q,offset];
    const where="WHERE reviewed_status=$1 AND ($2='' OR category=$2) AND ($3='' OR name ILIKE '%'||$3||'%' OR address ILIKE '%'||$3||'%')";
    const [r,n]=await Promise.all([
      query("SELECT osm_id,name,category,address,website,phone,opening_hours,last_osm_check,osm_url,latitude,longitude,reviewed_status FROM discovery_candidates "+where+" ORDER BY CASE WHEN website IS NOT NULL AND website!='' THEN 0 ELSE 1 END,category,name,osm_id LIMIT 25 OFFSET $4",args),
      query("SELECT count(*)::int AS total FROM discovery_candidates "+where,args.slice(0,3))
    ]);
    return ok({items:r.rows,total:n.rows[0]?.total||0,limit:25,offset});
  }
  if(method==='POST'&&path==='admin/review-candidate'){
    const u=admin(user);
    const b=parse(z.discriminatedUnion('action',[
      z.object({action:z.literal('publish'),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        verification_source:z.url().max(1000),
        verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
        verification_note:z.string().trim().min(25).max(2000),
        confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_operation:z.literal(true),
        editorial_rank:z.number().int().min(0).max(100).default(0),
        opening_hours_text:z.string().trim().max(300).optional().default('')}),
      z.object({action:z.enum(['hide','needs_review']),osm_id:z.string().regex(new RegExp('^(node|way|relation)/[0-9]+$')),
        reason:z.string().trim().min(10).max(500)})
    ]),await payload(req));
    const proof=b.action==='publish'?independentProof(b.verification_source):null;
    if(b.action==='publish'&&!proof)return bad('Unabhängige HTTPS Quelle des Betreibers oder einer Behörde erforderlich');
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const source=await tx.query("SELECT * FROM discovery_candidates WHERE osm_id=$1 AND reviewed_status IN ('unverified','needs_review') FOR UPDATE",[b.osm_id]);
      const c=source.rows[0];
      if(!c)throw conflict('Eintrag bereits bearbeitet oder nicht gefunden');
      if(b.action==='publish'){
        const duplicate=await tx.query("SELECT id,name FROM places WHERE osm_id=$1 OR (lower(name)=lower($2) AND latitude IS NOT NULL AND longitude IS NOT NULL AND abs(latitude-$3)<0.0005 AND abs(longitude-$4)<0.0008) LIMIT 1",[c.osm_id,c.name,c.latitude,c.longitude]);
        if(duplicate.rowCount)throw conflict('Ein ähnlicher Ort existiert bereits. Bitte den bestehenden Eintrag prüfen: '+duplicate.rows[0].name);
        const inserted=await tx.query(
          "INSERT INTO places(osm_id,name,category,address,latitude,longitude,website,source_url,status,description_de,verification_status,activity_status,verification_source,verification_method,verification_note,verified_by,verified_at,editorial_rank,opening_hours_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'published',$9,'verified','operating',$10,$11,$12,$13,now(),$14,$15) RETURNING id",
          [c.osm_id,c.name,c.category,c.address,c.latitude,c.longitude,c.website,c.osm_url,'Redaktionell auf Betriebsstatus überprüft. Zeiten bitte direkt beim Anbieter prüfen.',proof,b.verification_method,b.verification_note,u.id,b.editorial_rank,b.opening_hours_text]);
        await tx.query("UPDATE discovery_candidates SET reviewed_status='hidden' WHERE osm_id=$1",[c.osm_id]);
        await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,'publish:independent-source-review','place',$2)",[u.id,inserted.rows[0].id]);
        await tx.query('COMMIT');
        return ok({success:true,id:inserted.rows[0].id,verified:true});
      }
      await tx.query('UPDATE discovery_candidates SET reviewed_status=$2 WHERE osm_id=$1',[b.osm_id,b.action==='hide'?'hidden':'needs_review']);
      await tx.query('INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,$3,$4)',[u.id,b.action+':'+b.reason,'discovery_candidate',b.osm_id]);
      await tx.query('COMMIT');
      return ok({success:true,verified:false});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='GET'&&path==='admin/queue'){
    admin(user);const [b,c,p,d,posts,reports,reviews,reviewReports,comments,branchChanges]=await Promise.all([
      query("SELECT id,name,status,created_at FROM businesses WHERE status='pending' ORDER BY created_at"),
      query("SELECT c.id,c.status,c.note,b.name AS business_name,p.name AS place_name FROM claims c JOIN businesses b ON b.id=c.business_id JOIN places p ON p.id=c.place_id WHERE c.status='pending'"),
      query("SELECT id,name,category FROM places WHERE status='pending'"),
      query("SELECT id,title FROM deals WHERE status='pending'"),
      query("SELECT id,body FROM posts WHERE status='pending'"),
      query("SELECT r.id,r.reason,r.message AS note,COALESCE(p.name,dc.name) AS place_name FROM place_reports r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 60"),
      query("SELECT r.id,r.rating,r.body,COALESCE(p.name,dc.name) AS place_name FROM venue_reviews r LEFT JOIN places p ON p.id=r.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=r.osm_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 80"),
      query("SELECT rr.id,rr.review_id,rr.reason,rr.message AS note,vr.body,COALESCE(p.name,dc.name) AS place_name FROM venue_review_reports rr JOIN venue_reviews vr ON vr.id=rr.review_id LEFT JOIN places p ON p.id=vr.place_id LEFT JOIN discovery_candidates dc ON dc.osm_id=vr.osm_id WHERE rr.status='pending' ORDER BY rr.created_at LIMIT 60"),
      query("SELECT c.id,c.body,LEFT(p.body,80) AS title FROM post_comments c JOIN posts p ON p.id=c.post_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 80"),
      query("SELECT cr.id,cr.name,cr.address,cr.website,cr.phone,cr.opening_hours_text,cr.submitted_at,p.name AS place_name,b.name AS business_name FROM place_change_requests cr JOIN places p ON p.id=cr.place_id JOIN businesses b ON b.id=cr.business_id WHERE cr.status='pending' ORDER BY cr.submitted_at ASC LIMIT 80")
    ]);return ok({businesses:b.rows,claims:c.rows,places:p.rows,deals:d.rows,posts:posts.rows,reports:reports.rows,reviews:reviews.rows,reviewReports:reviewReports.rows,comments:comments.rows,branchChanges:branchChanges.rows});
  }
  if(method==='POST'&&path==='admin/review-place-change'){
    const u=admin(user);
    const b=parse(z.object({id,approve:z.boolean(),note:z.string().trim().max(500).optional().default('')}),await payload(req));
    const tx=await pool.connect();
    try{
      await tx.query('BEGIN');
      const request=await tx.query("SELECT * FROM place_change_requests WHERE id=$1 AND status='pending' FOR UPDATE",[b.id]);
      const change=request.rows[0];if(!change){await tx.query('ROLLBACK');return bad('Request not found',404)}
      if(b.approve){
        const updated=await tx.query("UPDATE places SET name=$2,address=$3,website=$4,phone=$5,opening_hours_text=$6,verification_status='unverified',activity_status='unknown',verified_at=NULL,verification_source=NULL,verification_method=NULL,verification_note=NULL,verified_by=NULL,editorial_rank=0,updated_at=now() WHERE id=$1 AND business_id=$7 AND status='published' AND EXISTS(SELECT 1 FROM businesses b WHERE b.id=$7 AND b.status='approved') RETURNING id",
          [change.place_id,change.name,change.address,change.website,change.phone,change.opening_hours_text,change.business_id]);
        if(!updated.rowCount){await tx.query('ROLLBACK');return bad('Business or location no longer authorized',409)}
      }
      await tx.query("UPDATE place_change_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),editor_note=$4 WHERE id=$1",[b.id,b.approve?'approved':'rejected',u.id,b.note]);
      await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'place_change',$3)",[u.id,b.approve?'editor:branch-change-approved':'editor:branch-change-rejected',b.id]);
      await tx.query('COMMIT');return ok({success:true,status:b.approve?'approved':'rejected'});
    }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
  }
  if(method==='POST'&&path==='admin/moderate-review'){
    const u=admin(user);const b=parse(z.object({id,approve:z.boolean()}),await payload(req));
    const target=b.approve?'published':'rejected';
    const result=await query("UPDATE venue_reviews SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id",[b.id,target,u.id]);
    if(!result.rowCount)return bad('Pending review not found',404);
    await audit(u,'review:'+target,'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/moderate-review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const result=await query("UPDATE venue_review_reports SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING id,review_id",
      [b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!result.rowCount)return bad('Pending review report not found',404);
    // Review and report flags remain separate; a moderator must decide removal.
    await audit(u,b.reviewed?'review-report:reviewed':'review-report:rejected','venue_review_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/remove-review'){
    const u=admin(user);const b=parse(z.object({id,reason:z.string().trim().min(10).max(300)}),await payload(req));
    const r=await query("UPDATE venue_reviews SET status='rejected',reviewed_by=$2,reviewed_at=now() WHERE id=$1 AND status='published' RETURNING id",[b.id,u.id]);
    if(!r.rowCount)return bad('Published review not found',404);
    await audit(u,'review:removed:'+b.reason.slice(0,70),'venue_review',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review-report'){
    const u=admin(user);const b=parse(z.object({id,reviewed:z.boolean()}),await payload(req));
    const r=await query("UPDATE place_reports SET status=$2,reviewed_at=now(),reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id,osm_id,place_id",[b.id,b.reviewed?'reviewed':'rejected',u.id]);
    if(!r.rowCount)return bad('Report not found',404);
    // This records review only; independent verification is required for a
    // status change or candidate hide, preventing false closure assertions.
    await audit(u,b.reviewed?'report:reviewed':'report:rejected','place_report',b.id);
    return ok({success:true});
  }
  if(method==='POST'&&path==='admin/review'){
    const u=admin(user);const b=parse(z.object({type:z.enum(['business','claim','place','deal','post','comment']),id:id,approve:z.boolean()}),await payload(req));
    const map={business:['businesses','approved'],claim:['claims','approved'],place:['places','published'],deal:['deals','published'],post:['posts','published'],comment:['post_comments','published']} as const;
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
      verification_method:z.enum(['betreiber_webseite','betreiber_kontakt','behoerde']),
      verification_note:z.string().trim().min(25).max(2000),
      confirms_existence:z.literal(true),confirms_address:z.literal(true),confirms_status:z.literal(true),
      editorial_rank:z.number().int().min(0).max(100).default(0),
      opening_hours_text:z.string().max(300).optional().default('')
    }),await payload(req));
    const source=independentProof(b.verification_source);
    if(!source)return bad('Unabhängige HTTPS Quelle erforderlich');
    // Set the verification time only after an authorized editor explicitly
    // reviewed a cited source. API data alone never auto-confirms businesses.
    const r=await query("UPDATE places SET activity_status=$2, verification_status='verified',verification_source=$3,verified_at=now(),editorial_rank=$4,opening_hours_text=$5,verification_method=$6,verification_note=$7,verified_by=$8,updated_at=now() WHERE id=$1 RETURNING id",
      [b.id,b.activity_status,source,b.activity_status==='operating'?b.editorial_rank:0,b.opening_hours_text,b.verification_method,b.verification_note,u.id]);
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
