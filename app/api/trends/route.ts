import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
import {localTrendsQuery} from '@/lib/local-trends';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const district=(req.nextUrl.searchParams.get('district')||'').trim(),category=(req.nextUrl.searchParams.get('category')||'').trim();
 if(district.length>90||category.length>70)return NextResponse.json({error:'Filter zu lang'},{status:400});
 const r=await query(localTrendsQuery,[district,category==='Alle'?'':category]);
 return NextResponse.json({items:r.rows,window_days:7,minimum_accounts:3,source:'Öffentliche Likes in FFM mit freigegebener Aktivität. Keine Besucherzahlen oder Aussage über die gesamte Stadt.'});
}
