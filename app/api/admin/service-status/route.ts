import {NextRequest,NextResponse} from 'next/server';
import {sessionUser} from '@/lib/auth';
import {query} from '@/lib/db';
import {configured} from '@/lib/oauth';
import {pushConfigured} from '@/lib/push-policy';
import {scannerReady} from '@/lib/media-storage';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const u=await sessionUser(req);if(u?.role!=='admin')return NextResponse.json({error:'Admin erforderlich'},{status:403});
 const [scanner,push,inventory]=await Promise.all([
  scannerReady(),
  query("SELECT count(*)::int AS devices FROM push_subscriptions"),
  query("SELECT count(*)::int AS total,count(*) FILTER(WHERE verification_status='verified' AND activity_status='operating' AND verified_at BETWEEN now()-interval '30 days' AND now())::int AS current_verified FROM places WHERE status='published'")
 ]);
 return NextResponse.json({
  google:{configured:configured('google')},apple:{configured:configured('apple')},
  assistant:{configured:Boolean(process.env.OPENAI_API_KEY)},
  web_push:{configured:pushConfigured(),devices:push.rows[0]?.devices||0},
  media:{configured:Boolean(process.env.CLAMD_HOST),scanner_reachable:scanner},
  billing:{configured:false,reason:'Zahlungsintegration und Tarifberechtigungen noch nicht implementiert.'},
  inventory:inventory.rows[0],checked_at:new Date().toISOString()
 },{headers:{'Cache-Control':'no-store, private'}});
}
