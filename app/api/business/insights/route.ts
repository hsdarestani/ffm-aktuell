import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {query} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
const uuid=/^[a-f0-9-]{36}$/;
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(!u)return NextResponse.json({error:'Bitte anmelden'},{status:401});
 const businessId=req.nextUrl.searchParams.get('business_id')||'';
 if(!uuid.test(businessId))return NextResponse.json({error:'Unternehmen auswählen'},{status:400});
 const acl=await query("SELECT b.id,b.name FROM businesses b LEFT JOIN business_team_members tm ON tm.business_id=b.id AND tm.user_id=$2 WHERE b.id=$1 AND b.status='approved' AND (b.owner_id=$2 OR (tm.user_id IS NOT NULL AND tm.all_places)) LIMIT 1",[businessId,u.id]);
 if(!acl.rowCount)return NextResponse.json({error:'Kein Zugriff auf diesen Betrieb'},{status:403});
 const [venues,offers,coupons,posts,followers,ads]=await Promise.all([
  query("SELECT count(*)::int AS n FROM places WHERE business_id=$1 AND status='published'",[businessId]),
  query("SELECT count(*)::int AS n FROM deals WHERE business_id=$1 AND status='published' AND (valid_until IS NULL OR valid_until>now())",[businessId]),
  query("SELECT count(*)::int AS claimed,count(*) FILTER(WHERE c.redeemed_at IS NOT NULL)::int AS redeemed FROM coupon_claims c JOIN deals d ON d.id=c.deal_id WHERE d.business_id=$1 AND c.created_at>now()-interval '30 days'",[businessId]),
  query("SELECT count(DISTINCT po.id)::int AS n FROM posts po JOIN places p ON p.id=po.place_id WHERE p.business_id=$1 AND po.status='published' AND po.created_at>now()-interval '30 days'",[businessId]),
  query("SELECT count(*)::int AS n FROM business_follows WHERE business_id=$1",[businessId]),
  query("SELECT count(*)::int AS drafts,count(*) FILTER(WHERE status='pending_review')::int AS pending,count(*) FILTER(WHERE status='awaiting_commercial_setup')::int AS reviewed FROM ad_campaigns WHERE business_id=$1 AND created_at>now()-interval '30 days'",[businessId])
 ]);
 const follows=followers.rows[0]?.n||0;
 return NextResponse.json({
  business:{id:acl.rows[0].id,name:acl.rows[0].name},
  period:'last_30_days_for_activity',
  active_places:venues.rows[0]?.n||0,
  current_deals:offers.rows[0]?.n||0,
  coupons_claimed:coupons.rows[0]?.claimed||0,
  coupons_redeemed:coupons.rows[0]?.redeemed||0,
  published_posts:posts.rows[0]?.n||0,
  followers:follows>=5?follows:null,followers_privacy_threshold:5,
  campaign_drafts:ads.rows[0]?.drafts||0,campaign_pending:ads.rows[0]?.pending||0,campaign_reviewed_not_paid:ads.rows[0]?.reviewed||0,
  impressions:null,clicks:null,revenue:null,visit_conversions:null,
  disclaimer:'Nur gespeicherte echte Ereignisse; keine erfundenen Impressionen, Einnahmen oder bestätigten Besuche.'
 },{headers:{'Cache-Control':'private,no-store'}});
}

