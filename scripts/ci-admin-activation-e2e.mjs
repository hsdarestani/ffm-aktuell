#!/usr/bin/env node
// Uses a disposable local PostgreSQL database and a locally started Next.js server.
// Never run this against production or use a real invite/password.
import {spawn} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

const raw=process.env.ACTIVATION_CI_DATABASE_URL;
if(!raw)throw Error('Missing ACTIVATION_CI_DATABASE_URL');
const dbURL=new URL(raw);
if(!['localhost','127.0.0.1'].includes(dbURL.hostname)||dbURL.pathname!=='/ffm_activation_ci')
 throw Error('Safety guard: admin activation tests require a disposable local DB named ffm_activation_ci');
const pool=new pg.Pool({connectionString:raw,max:2});
const token=randomBytes(32).toString('hex');
const digest=createHash('sha256').update(token).digest('hex');
const password='CI-Activation-'+randomBytes(18).toString('hex');
const email='ci-activation-'+randomBytes(7).toString('hex')+'@example.com';
const site='http://127.0.0.1:3101';
let server=null,output='';

try{
 await pool.query(await readFile('db/schema.sql','utf8'));
 await pool.query("INSERT INTO admin_invites(token_hash,expires_at) VALUES($1,now()+interval '30 minutes')",[digest]);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3101'],{
  env:{...process.env,DATABASE_URL:raw,NEXT_PUBLIC_SITE_URL:site,NODE_ENV:'production'},
  stdio:['ignore','pipe','pipe']
 });
 server.stdout.on('data',s=>{output=(output+String(s)).slice(-2500)});
 server.stderr.on('data',s=>{output=(output+String(s)).slice(-2500)});
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)break;
  try{const r=await fetch(site+'/api/health',{signal:AbortSignal.timeout(1800)});if(r.ok){ready=true;break}}catch{}
  await delay(400);
 }
 if(!ready)throw Error('Next server did not become healthy: '+output.replaceAll(password,'[redacted]'));
 const body={token,email,display_name:'CI Admin',password};
 const first=await fetch(site+'/api/admin/activate',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 const result=await first.json();
 if(first.status!==201||!result.success||result.role!=='admin')
  throw Error('Expected successful one-time activation; got HTTP '+first.status+' '+JSON.stringify(result));
 const cookie=first.headers.get('set-cookie')?.split(';')[0];
 if(!cookie?.startsWith('ffm_session='))throw Error('Admin session cookie missing');
 const me=await fetch(site+'/api/me',{headers:{Cookie:cookie}});
 const session=await me.json();
 if(me.status!==200||session.user?.role!=='admin'||session.user?.email!==email)
  throw Error('Activation did not establish a usable admin session');
 const retry=await fetch(site+'/api/admin/activate',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,email:'reused-'+email})
 });
 if(retry.status!==403)throw Error('One-time invitation could be reused (status '+retry.status+')');
 const verified=await pool.query(
  'SELECT used_at IS NOT NULL AS used FROM admin_invites WHERE token_hash=$1',[digest]);
 const saved=await pool.query('SELECT u.role, count(s.token_hash)::int AS sessions FROM users u LEFT JOIN sessions s ON s.user_id=u.id WHERE u.email=$1 GROUP BY u.id',[email]);
 const audit=await pool.query("SELECT count(*)::int AS events FROM audit_log WHERE action='admin:one-time-activation' AND target_id=(SELECT id::text FROM users WHERE email=$1)",[email]);
 if(!verified.rows[0]?.used||saved.rows[0]?.role!=='admin'||saved.rows[0]?.sessions!==1||audit.rows[0]?.events!==1)
  throw Error('Atomic database state does not match successful activation');
 // Real API smoke test for user bookmarks, review approvals, abuse reporting
 // and removal. All data lives in the disposable localhost CI database.
 const testOsm='node/'+String(BigInt('2'+randomBytes(5).toString('hex').replace(/[a-f]/g,'1').replace(/0/g,'2'))).slice(0,13);
 await pool.query("INSERT INTO discovery_candidates(osm_id,name,category,latitude,longitude,address,osm_url) VALUES($1,$2,$3,$4,$5,$6,$7)",
  [testOsm,'CI Example Venue','Cafés',50.11,8.68,'CI Teststraße 1','https://www.openstreetmap.org/'+testOsm]);
 const signup=async(label)=>{
  const response=await fetch(site+'/api/auth/register',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({
    email:'ci-reviews-'+label+'-'+randomBytes(6).toString('hex')+'@example.com',
    display_name:'Testperson',password:'ci-review-'+randomBytes(15).toString('hex')
   })});
  if(response.status!==201)throw Error('Test user registration failed: '+response.status);
  const value=response.headers.get('set-cookie')?.split(';')[0];
  if(!value)throw Error('Test user session cookie missing');
  return value;
 };
 const client=await signup('author');
 const post=async(route,cookie,json)=>{
  const response=await fetch(site+'/api/'+route,{method:'POST',
    headers:{'Content-Type':'application/json',Cookie:cookie},
    body:JSON.stringify(json)});
  return {status:response.status,body:await response.json()};
 };
 const get=async(route,cookie)=>{
  const response=await fetch(site+'/api/'+route,{headers:cookie?{Cookie:cookie}:undefined});
  return {status:response.status,body:await response.json()};
 };
 const savedMark=await post('favorites',client,{place_id:testOsm,active:true});
 if(savedMark.status!==200)throw Error('OSM save failed: '+JSON.stringify(savedMark));
 const savedDetails=await get('favorites/details',client);
 if(!savedDetails.body.items.some(v=>v.id===testOsm&&v.candidate===true))throw Error('OSM save missing from Meine Orte');
 const rawRating=await post('reviews',client,{place_id:testOsm,rating:5,body:'A real test comment pending editorial approval.'});
 if(rawRating.status!==201||rawRating.body.status!=='pending')throw Error('Review insert failed: '+JSON.stringify(rawRating));
 const pre=await get('reviews?place_id='+encodeURIComponent(testOsm));
 if(pre.body.summary?.count!==0||pre.body.items?.length!==0)throw Error('Pending review leaked publicly');
 const queue=await get('admin/queue',cookie);
 if(!queue.body.reviews?.some(v=>v.id===rawRating.body.id))throw Error('Review absent from admin queue');
 const approve=await post('admin/moderate-review',cookie,{id:rawRating.body.id,approve:true});
 if(approve.status!==200)throw Error('Admin review approval failed: '+JSON.stringify(approve));
 const approved=await get('reviews?place_id='+encodeURIComponent(testOsm));
 if(approved.body.summary?.count!==1||Number(approved.body.summary?.average)!==5
 ||approved.body.items[0]?.id!==rawRating.body.id)throw Error('Approved review missing or wrong average');
 const reader=await signup('reader');
 const report=await post('review-reports',reader,{review_id:rawRating.body.id,reason:'other',message:'Please verify the review'});
 if(report.status!==201)throw Error('Abuse report failed: '+JSON.stringify(report));
 const duplicate=await post('review-reports',reader,{review_id:rawRating.body.id,reason:'other'});
 if(duplicate.status!==409)throw Error('Duplicate review report was accepted');
 const reports=await get('admin/queue',cookie);
 if(!reports.body.reviewReports?.some(v=>v.review_id===rawRating.body.id))throw Error('Review report missing from admin queue');
 const removal=await post('admin/remove-review',cookie,{id:rawRating.body.id,reason:'CI explicit removal test'});
 if(removal.status!==200)throw Error('Explicit removal failed: '+JSON.stringify(removal));
 const after=await get('reviews?place_id='+encodeURIComponent(testOsm));
 if(after.body.summary?.count!==0)throw Error('Removed review is still publicly counted');
 const pendingPost=await post('posts',client,{place_id:testOsm,body:'A real CI community post on a test location.'});
 if(pendingPost.status!==201)throw Error('Community post submission failed: '+JSON.stringify(pendingPost));
 const postApproval=await post('admin/review',cookie,{type:'post',id:pendingPost.body.id,approve:true});
 if(postApproval.status!==200)throw Error('Community post moderation failed: '+JSON.stringify(postApproval));
 const postsVisible=await get('posts');
 if(!postsVisible.body.items?.some(p=>p.id===pendingPost.body.id&&p.likes_count===0&&p.comments_count===0))throw Error('Community post feed missing counters');
 const newLike=await post('post-likes',reader,{post_id:pendingPost.body.id,active:true});
 if(newLike.status!==200||newLike.body.count!==1||!newLike.body.liked)throw Error('Post like did not persist');
 const newComment=await post('comments',reader,{post_id:pendingPost.body.id,body:'CI moderator should approve this comment.'});
 if(newComment.status!==201||newComment.body.status!=='pending')throw Error('Comment submission failed');
 const hiddenComments=await get('comments?post_id='+pendingPost.body.id);
 if(hiddenComments.body.items?.length!==0)throw Error('Unapproved comment leaked');
 const commentQueue=await get('admin/queue',cookie);
 if(!commentQueue.body.comments?.some(c=>c.id===newComment.body.id))throw Error('Comment missing from moderation queue');
 const commentApprove=await post('admin/review',cookie,{type:'comment',id:newComment.body.id,approve:true});
 if(commentApprove.status!==200)throw Error('Comment moderation failed');
 const visibleComments=await get('comments?post_id='+pendingPost.body.id);
 if(visibleComments.body.items?.length!==1)throw Error('Approved comment not visible');
 const likedFeed=await get('posts',reader);
 const likedRecord=likedFeed.body.items.find(p=>p.id===pendingPost.body.id);
 if(likedRecord?.likes_count!==1||likedRecord?.comments_count!==1||likedRecord?.liked!==true)throw Error('Community aggregates or personal like state wrong');
 const unlike=await post('post-likes',reader,{post_id:pendingPost.body.id,active:false});
 if(unlike.status!==200||unlike.body.count!==0)throw Error('Unlike did not remove user vote');
 // Phase 2c: following must be private, idempotent, authenticated and limited
 // to public content from authors or verified public businesses.
 const authorMe=await get('me',client);
 const authorId=authorMe.body.user?.id;
 if(!authorId)throw Error('Author ID missing');
 const guestFollow=await post('follows','',{target_type:'user',target_id:authorId,active:true});
 if(guestFollow.status!==401)throw Error('Guest user was permitted to follow');
 const emptyFollowing=await get('posts?scope=following',reader);
 if(emptyFollowing.status!==200||emptyFollowing.body.items.length!==0)throw Error('Following feed was not private and empty initially');
 const ownFollow=await post('follows',client,{target_type:'user',target_id:authorId,active:true});
 if(ownFollow.status!==400)throw Error('Self-follow should be refused');
 const followAuthor=await post('follows',reader,{target_type:'user',target_id:authorId,active:true});
 if(followAuthor.status!==200||!followAuthor.body.following)throw Error('Author follow failed');
 const secondFollow=await post('follows',reader,{target_type:'user',target_id:authorId,active:true});
 if(secondFollow.status!==200)throw Error('Follow was not idempotent');
 const followedFeed=await get('posts?scope=following',reader);
 if(!followedFeed.body.items.some(p=>p.id===pendingPost.body.id&&p.following_author))throw Error('Followed approved post missing');
 const followedList=await get('follows',reader);
 if(followedList.body.people?.length!==1)throw Error('Private follow list incorrect');
 const loggedOutFollows=await get('follows');
 if(loggedOutFollows.status!==401)throw Error('Follow identities leaked to guests');
 const unfollow=await post('follows',reader,{target_type:'user',target_id:authorId,active:false});
 if(unfollow.status!==200)throw Error('Unfollow failed');
 const emptyAfterUnfollow=await get('posts?scope=following',reader);
 if(emptyAfterUnfollow.body.items.length!==0)throw Error('Unfollow did not clear feed');

 const createdBusiness=await post('businesses',client,{name:'CI FFM Venue'});
 if(createdBusiness.status!==201)throw Error('Test business creation failed');
 const deniedBusiness=await post('follows',reader,{target_type:'business',target_id:createdBusiness.body.id,active:true});
 if(deniedBusiness.status!==404)throw Error('Pending business was followable');
 await pool.query("UPDATE businesses SET status='approved' WHERE id=$1",[createdBusiness.body.id]);
 const noPublicVenue=await post('follows',reader,{target_type:'business',target_id:createdBusiness.body.id,active:true});
 if(noPublicVenue.status!==404)throw Error('Business without a public venue was followable');
 const publicPlace=await pool.query("INSERT INTO places(business_id,name,category,address,status,activity_status) VALUES($1,'CI Follow Venue','Cafés','CI Main Street','published','operating') RETURNING id",[createdBusiness.body.id]);
 const followBusiness=await post('follows',reader,{target_type:'business',target_id:createdBusiness.body.id,active:true});
 if(followBusiness.status!==200)throw Error('Approved public business follow failed');
 const businessPost=await post('posts',client,{body:'A public CI business venue post for the following feed.',place_id:publicPlace.rows[0].id});
 if(businessPost.status!==201)throw Error('Business related post failed');
 const beforeApproval=await get('posts?scope=following',reader);
 if(beforeApproval.body.items.some(p=>p.id===businessPost.body.id))throw Error('Pending business post leaked');
 const approveBusinessPost=await post('admin/review',cookie,{type:'post',id:businessPost.body.id,approve:true});
 if(approveBusinessPost.status!==200)throw Error('Business post approval failed');
 const afterApproval=await get('posts?scope=following',reader);
 if(!afterApproval.body.items.some(p=>p.id===businessPost.body.id))throw Error('Business follow feed missing approved venue post');
 const deniedOwnBusinessFollow=await post('follows',client,{target_type:'business',target_id:createdBusiness.body.id,active:true});
 if(deniedOwnBusinessFollow.status!==404)throw Error('Own business follow should be refused');
 const businessPlace=await get('location?id='+publicPlace.rows[0].id,reader);
 if(businessPlace.body.place?.business_id!==createdBusiness.body.id||!businessPlace.body.place?.following_business)
   throw Error('Published venue was not connected to its verified followed business');
 // Phase 3a: tours are private by default, shared only by unpredictable token.
 await pool.query('UPDATE places SET latitude=$2,longitude=$3 WHERE id=$1',[publicPlace.rows[0].id,50.113,8.69]);
 const guestTour=await get('tours');
 if(guestTour.status!==401)throw Error('Guest could list private tours');
 const wrongStop=await post('tours',reader,{action:'save',title:'Bad Tour',stop_ids:[testOsm,testOsm]});
 if(wrongStop.status!==400)throw Error('Duplicate stop accepted');
 const newTour=await post('tours',reader,{action:'save',title:'CI City Walk',stop_ids:[testOsm,publicPlace.rows[0].id],planned_times:['10:30','11:45']});
 if(newTour.status!==201||!newTour.body.id)throw Error('Tour not created: '+JSON.stringify(newTour));
 const listedTours=await get('tours',reader);
 if(listedTours.body.items.length!==1||listedTours.body.items[0].share_token!==null)throw Error('Tour was not private by default');
 const otherPerson=await get('tours/details?id='+newTour.body.id,client);
 if(otherPerson.status!==404)throw Error('Other account read a private tour');
 const tourOwner=await get('tours/details?id='+newTour.body.id,reader);
 if(tourOwner.body.stops.map(s=>s.id).join(',')!==testOsm+','+publicPlace.rows[0].id
   ||tourOwner.body.stops[0].planned_time!=='10:30')throw Error('Tour order or times invalid');
 const deniedShared=await get('tours/shared?token='+'1'.repeat(43));
 if(deniedShared.status!==404)throw Error('Unknown shared link succeeded');
 const shareTour=await post('tours',reader,{action:'share',id:newTour.body.id,enabled:true});
 if(shareTour.status!==200||shareTour.body.token?.length!==43)throw Error('Share token missing');
 const publicTour=await get('tours/shared?token='+shareTour.body.token);
 if(publicTour.status!==200||publicTour.body.stops?.length!==2||publicTour.body.tour.owner_id)throw Error('Shared tour leaked private details or stops');
 const revoked=await post('tours',reader,{action:'share',id:newTour.body.id,enabled:false});
 if(revoked.status!==200)throw Error('Tour share was not revoked');
 const noLongerShared=await get('tours/shared?token='+shareTour.body.token);
 if(noLongerShared.status!==404)throw Error('Revoked tour still publicly accessible');
 const reordered=await post('tours',reader,{action:'save',id:newTour.body.id,title:'CI City Walk New',stop_ids:[publicPlace.rows[0].id,testOsm]});
 if(reordered.status!==200)throw Error('Tour stop reorder failed');
 const newOrder=await get('tours/details?id='+newTour.body.id,reader);
 if(newOrder.body.stops[0]?.id!==publicPlace.rows[0].id)throw Error('Ordered stops did not update');
 const deleted=await post('tours',reader,{action:'delete',id:newTour.body.id});
 if(deleted.status!==200)throw Error('Tour deletion failed');
 const afterDelete=await get('tours/details?id='+newTour.body.id,reader);
 if(afterDelete.status!==404)throw Error('Deleted tour still accessible');
 console.log('PASS: private ordered tour planning, timetable, safe shared link, revocation and deletion');
 console.log('PASS: private people/business follows, permissions, idempotency, following feed and editorial gating');
 console.log('PASS: moderated community posts, likes/unlikes, pending comment isolation and editorial approval');
 console.log('PASS: OSM bookmarks, hidden pending review, admin approval, public average, user report and explicit removal');
 console.log('PASS: admin created, audit logged, session working, invitation used exactly once');
}finally{
 if(server){
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>server.once('exit',resolve)),delay(3000)]);
 }
 await pool.end();
}
