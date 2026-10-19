#!/usr/bin/env node
// Uses a disposable local PostgreSQL database and a locally started Next.js server.
// Never run this against production or use a real invite/password.
import {spawn} from 'node:child_process';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
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
const mediaDir='/tmp/ffm-ci-media-'+randomBytes(9).toString('hex');

try{
 await mkdir(mediaDir,{recursive:true,mode:0o700});
 await pool.query(await readFile('db/schema.sql','utf8'));
 await pool.query("INSERT INTO admin_invites(token_hash,expires_at) VALUES($1,now()+interval '30 minutes')",[digest]);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3101'],{
  env:{...process.env,DATABASE_URL:raw,NEXT_PUBLIC_SITE_URL:site,NODE_ENV:'production',FFM_MEDIA_DIR:mediaDir},
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
 // Event bookmarks, user preferences and account data rights are exercised
 // against the disposable CI database. Guest access must not leak state.
 const future=new Date(Date.now()+24*3600*1000).toISOString();
 const eventCreate=await post('admin/events',cookie,{title:'CI Frankfurt Event',description_de:'Ein echter CI Termin',venue:'CI Venue',starts_at:future});
 if(eventCreate.status!==201)throw Error('CI event creation failed');
 const eventId=eventCreate.body.id;
 const guestEventBookmark=await get('event-favorites');
 if(guestEventBookmark.status!==401)throw Error('Guest could read private event bookmarks');
 const saveEvent=await post('event-favorites',reader,{event_id:eventId,active:true});
 if(saveEvent.status!==200||!saveEvent.body.saved)throw Error('Event bookmark failed');
 const savedEvents=await get('event-favorites',reader);
 if(savedEvents.body.items.length!==1||savedEvents.body.items[0].id!==eventId)throw Error('Event bookmark not persisted');
 const secondSave=await post('event-favorites',reader,{event_id:eventId,active:true});
 if(secondSave.status!==200)throw Error('Event save not idempotent');
 const prefs=await post('me/preferences',reader,{interests:['Kultur','Cafés','Kultur'],districts:['Nordend'],
  share_activity:false,notify_events:true,notify_news:false,notify_offers:false});
 if(prefs.status!==200||prefs.body.preferences.interests.length!==2)throw Error('Preferences not sanitized');
 const prefsGuest=await get('me/preferences');
 if(prefsGuest.status!==401)throw Error('Guest could read preferences');
 const prefsSaved=await get('me/preferences',reader);
 if(prefsSaved.body.preferences.notify_events!==true||prefsSaved.body.preferences.share_activity!==false)throw Error('Private preferences missing');
 const exported=await get('me/export',reader);
 if(exported.status!==200||exported.body.event_favorites.length!==1||exported.body.preferences?.districts?.[0]!=='Nordend'
   ||exported.body.account.password_hash!==undefined)throw Error('Account export missing data or included credentials');
 const exportedGuest=await get('me/export');
 if(exportedGuest.status!==401)throw Error('Guest could export private account data');
 const removeEvent=await post('event-favorites',reader,{event_id:eventId,active:false});
 if(removeEvent.status!==200||removeEvent.body.saved!==false)throw Error('Could not remove event bookmark');
 const noEvent=await get('event-favorites',reader);
 if(noEvent.body.items.length!==0)throw Error('Event bookmark remove failed');

 const deletionPassword='ci-test-secure-'+randomBytes(18).toString('hex');
 const deleteSignup=await fetch(site+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email:'ci-deletion-'+randomBytes(7).toString('hex')+'@example.com',display_name:'Delete CI',password:deletionPassword})});
 if(deleteSignup.status!==201)throw Error('Disposable deletion account creation failed');
 const delCookie=deleteSignup.headers.get('set-cookie')?.split(';')[0];
 if(!delCookie)throw Error('Deletion test session missing');
 const badDelete=await post('me/delete',delCookie,{password:'wrong',confirmation:'KONTO LÖSCHEN'});
 if(badDelete.status!==403)throw Error('Account deletion accepted bad password');
 const deletedAccount=await post('me/delete',delCookie,{password:deletionPassword,confirmation:'KONTO LÖSCHEN'});
 if(deletedAccount.status!==200||!deletedAccount.body.success)throw Error('Confirmed account deletion failed');
 const afterAccountDelete=await get('me',delCookie);
 if(afterAccountDelete.body.user!==null)throw Error('Deleted account session remains valid');
 // Business basic branch corrections require verified ownership and editor review.
 const originalPublic=await get('location?id='+publicPlace.rows[0].id);
 if(!originalPublic.body.place||originalPublic.body.place.phone)throw Error('CI branch baseline unexpected');
 const deniedEdit=await post('business/places/change',reader,{place_id:publicPlace.rows[0].id,
  name:'Not Mine',address:'Forbidden'});
 if(deniedEdit.status!==403)throw Error('Unrelated person could edit a business venue');
 const branchChange=await post('business/places/change',client,{place_id:publicPlace.rows[0].id,
  name:'CI New Name',address:'CI New Address 12',phone:'+49 69 456789',
  opening_hours_text:'Mo bis Fr 09:00 bis 17:00',website:'https://example.org'});
 if(branchChange.status!==201||branchChange.body.status!=='pending')throw Error('Owner change request failed '+JSON.stringify(branchChange));
 const notPublished=await get('location?id='+publicPlace.rows[0].id);
 if(notPublished.body.place.name==='CI New Name')throw Error('Unmoderated branch edit became public');
 const changeQueue=await get('admin/queue',cookie);
 if(!changeQueue.body.branchChanges?.some(c=>c.id===branchChange.body.id))throw Error('Branch change not in editor queue');
 const ownerOverview=await get('business/overview',client);
 if(!ownerOverview.body.changes?.some(c=>c.id===branchChange.body.id&&c.status==='pending'))throw Error('Owner cannot see pending change');
 const branchApproval=await post('admin/review-place-change',cookie,{id:branchChange.body.id,approve:true});
 if(branchApproval.status!==200)throw Error('Branch approval failed '+JSON.stringify(branchApproval));
 const approvedBranch=await get('location?id='+publicPlace.rows[0].id);
 if(approvedBranch.body.place.name!=='CI New Name'||approvedBranch.body.place.phone!=='+49 69 456789'
    ||approvedBranch.body.place.verification_status!=='unverified'||approvedBranch.body.place.activity_status!=='unknown')
   throw Error('Branch change not applied safely or stale verified status remains');
 const afterBranch=await post('business/places/change',client,{place_id:publicPlace.rows[0].id,
  name:'CI Rejected Name',address:'CI New Address 12'});
 if(afterBranch.status!==201)throw Error('Second branch request failed');
 const rejectBranch=await post('admin/review-place-change',cookie,{id:afterBranch.body.id,approve:false,note:'Data not supported'});
 if(rejectBranch.status!==200)throw Error('Branch reject failed');
 const afterReject=await get('location?id='+publicPlace.rows[0].id);
 if(afterReject.body.place.name!=='CI New Name')throw Error('Rejected change overwrote public details');
 // Coupon pilot uses existing editor-approved Deals. Codes are private,
 // random and cannot be redeemed by a different business or twice.
 const proposed=await post('deals',client,{title:'CI Coffee Voucher',details:'10 percent off one drink',place_id:publicPlace.rows[0].id});
 if(proposed.status!==201||proposed.body.status!=='pending')throw Error('New deal was not pending');
 const pendingClaim=await post('coupons/claim',reader,{deal_id:proposed.body.id});
 if(pendingClaim.status!==404)throw Error('Unreviewed deal was claimable');
 const approval=await post('admin/review',cookie,{type:'deal',id:proposed.body.id,approve:true});
 if(approval.status!==200)throw Error('Offer editorial approval failed');
 const ownerClaim=await post('coupons/claim',client,{deal_id:proposed.body.id});
 if(ownerClaim.status!==404)throw Error('Merchant claimed own offer');
 const guestClaim=await post('coupons/claim','',{deal_id:proposed.body.id});
 if(guestClaim.status!==401)throw Error('Guest claimed a coupon');
 const coupon=await post('coupons/claim',reader,{deal_id:proposed.body.id});
 if(coupon.status!==200||coupon.body.code?.length!==24)throw Error('Secure coupon not issued');
 const repeatClaim=await post('coupons/claim',reader,{deal_id:proposed.body.id});
 if(repeatClaim.status!==200||repeatClaim.body.code!==coupon.body.code)throw Error('Duplicate coupon issued to one user');
 const hiddenCoupons=await get('coupons');
 if(hiddenCoupons.status!==401)throw Error('Guest could see coupon wallet');
 const ownCoupons=await get('coupons',reader);
 if(ownCoupons.status!==200||ownCoupons.body.items?.length!==1||ownCoupons.body.items[0]?.code!==coupon.body.code)throw Error('Private coupon wallet incorrect');
 const forbiddenRedeem=await post('business/coupons/redeem',reader,{code:coupon.body.code});
 if(forbiddenRedeem.status!==403)throw Error('Unapproved account redeemed coupon');
 const wrongCodeRedeem=await post('business/coupons/redeem',client,{code:'X'.repeat(24)});
 if(wrongCodeRedeem.status!==409)throw Error('Bogus coupon accepted');
 const redeem=await post('business/coupons/redeem',client,{code:coupon.body.code});
 if(redeem.status!==200||!redeem.body.success)throw Error('One-time merchant redemption failed');
 const twice=await post('business/coupons/redeem',client,{code:coupon.body.code});
 if(twice.status!==409)throw Error('Coupon replay accepted');
 const claimedAgain=await post('coupons/claim',reader,{deal_id:proposed.body.id});
 if(claimedAgain.status!==200||claimedAgain.body.redeemed!==true||claimedAgain.body.code!==coupon.body.code)
   throw Error('Claim replay reset a redeemed code');
 // Phase 5: proof of media privacy without accepting any unscanned file.
 // Fake media bytes are inserted DIRECTLY into this disposable CI database only.
 // This does not test or bypass the scanner on any production server.
 const mediaService=await get('media/status');
 if(mediaService.status!==200||typeof mediaService.body.upload_enabled!=='boolean')throw Error('Media scanner health endpoint not working');
 const ownerId=(await get('me',reader)).body.user?.id;
 if(!ownerId)throw Error('Media test owner is missing');
 const bytes=Buffer.from('FAKE-CI-VIDEO-HEADER-0123456789-abcdefghijk');
 const storedKey=randomUUID(),mediaId=randomUUID();
 await writeFile(mediaDir+'/'+storedKey,bytes,{flag:'wx',mode:0o600});
 await pool.query("INSERT INTO user_media(id,owner_id,media_type,size_bytes,storage_key,sha256,license_confirmed,status) VALUES($1,$2,'video/mp4',$3,$4,$5,true,'approved')",
  [mediaId,ownerId,bytes.length,storedKey,createHash('sha256').update(bytes).digest('hex')]);
 const invisible=await fetch(site+'/api/media/'+mediaId);
 if(invisible.status!==404)throw Error('Unpublished media leaked to guest');
 const createdStory=await post('stories',reader,{action:'create',media_id:mediaId,caption:'CI private story'});
 if(createdStory.status!==201||createdStory.body.story?.status!=='pending')throw Error('Story was not pending');
 const beforeStory=await get('stories');
 if(beforeStory.body.items.some(item=>item.id===createdStory.body.story.id))throw Error('Unmoderated story leaked publicly');
 const storyApproved=await post('media/moderation',cookie,{id:createdStory.body.story.id,type:'story',approve:true});
 if(storyApproved.status!==200)throw Error('Admin story approval failed');
 const afterStory=await get('stories');
 if(!afterStory.body.items.some(item=>item.id===createdStory.body.story.id))throw Error('Approved live story missing');
 const partial=await fetch(site+'/api/media/'+mediaId,{headers:{Range:'bytes=0-9'}});
 if(partial.status!==206||partial.headers.get('content-range')!=='bytes 0-9/'+bytes.length||(await partial.arrayBuffer()).byteLength!==10)
  throw Error('Video byte range failed');
 const grant=await post('media/rights',reader,{action:'grant',media_id:mediaId,business_id:createdBusiness.body.id,expires_at:new Date(Date.now()+7*86400000).toISOString()});
 if(grant.status!==201)throw Error('Owner-granted consent missing: '+JSON.stringify(grant));
 const list=await get('highlights?business_id='+createdBusiness.body.id+'&scope=available',client);
 if(!list.body.items.some(item=>item.grant_id===grant.body.id))throw Error('Consent was not available to business owner');
 const pendingHighlight=await post('highlights',client,{grant_id:grant.body.id});
 if(pendingHighlight.status!==201||pendingHighlight.body.highlight?.status!=='pending')throw Error('Highlights lack moderation gate');
 const hiddenHighlight=await get('highlights?business_id='+createdBusiness.body.id);
 if(hiddenHighlight.body.items.length!==0)throw Error('Pending highlight leaked to visitors');
 const hlOk=await post('media/moderation',cookie,{id:pendingHighlight.body.highlight.id,type:'highlight',approve:true});
 if(hlOk.status!==200)throw Error('Highlight approval blocked');
 const publishedHighlight=await get('highlights?business_id='+createdBusiness.body.id);
 if(!publishedHighlight.body.items.some(item=>item.id===pendingHighlight.body.highlight.id))throw Error('Approved highlight not visible');
 const revoke=await post('media/rights',reader,{action:'revoke',id:grant.body.id});
 if(revoke.status!==200||!revoke.body.revoked)throw Error('Media owner could not revoke consent');
 const afterRevoke=await get('highlights?business_id='+createdBusiness.body.id);
 if(afterRevoke.body.items.length!==0)throw Error('Revoked business media stayed public');
 const removed=await fetch(site+'/api/media/manage',{method:'DELETE',headers:{'Content-Type':'application/json',Cookie:reader},body:JSON.stringify({id:mediaId})});
 if(removed.status!==200||!(await removed.json()).deleted)throw Error('User could not delete owned media');
 const afterMediaDelete=await fetch(site+'/api/media/'+mediaId);
 if(afterMediaDelete.status!==404)throw Error('Deleted media remained accessible');
 const afterStoryDelete=await get('stories');
 if(afterStoryDelete.body.items.some(item=>item.id===createdStory.body.story.id))throw Error('Deleted media left a public story');
 console.log('PASS: media isolation, moderated 24h Story, private consent, Highlight review, revocation, 206 playback and owner delete');
 console.log('PASS: moderated coupon issue, private wallet, issuer ownership, single-use redemption and replay prevention');
 console.log('PASS: ownership gates, private pending branch corrections, editorial approval, reject and verification reset');
 console.log('PASS: event bookmarking, private preferences, secure data export and confirmed account deletion');
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
 await rm(mediaDir,{recursive:true,force:true});
}
