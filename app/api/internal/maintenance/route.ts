import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '@/lib/db';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
 const token=process.env.PUSH_WORKER_TOKEN||'',a=Buffer.from('Bearer '+token),b=Buffer.from(req.headers.get('authorization')||'');
 if(token.length<32||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
 const tx=await pool.connect();try{await tx.query('BEGIN');
 await tx.query("DELETE FROM phone_challenges WHERE created_at<now()-interval '2 days'");
 await tx.query("DELETE FROM text_service_usage WHERE created_at<now()-interval '2 days'");
 await tx.query("DELETE FROM ad_exposures WHERE created_at<now()-interval '2 days'");
 await tx.query("DELETE FROM post_translations WHERE created_at<now()-interval '30 days'");
 await tx.query('COMMIT');return NextResponse.json({ok:true});
 }catch{await tx.query('ROLLBACK');return NextResponse.json({error:'Maintenance failed'},{status:500})}finally{tx.release()}
}
