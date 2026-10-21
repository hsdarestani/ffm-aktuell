import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'',kind=req.nextUrl.searchParams.get('kind');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!['event','news'].includes(kind||''))return NextResponse.json({error:'Ungültiger Link'},{status:400});
 const r=await query(kind==='event'?"SELECT * FROM events WHERE id=$1 AND status='published'":"SELECT * FROM news WHERE id=$1 AND status='published' AND published_at<=now()",[id]);
 return NextResponse.json({item:r.rows[0]||null},{status:r.rows.length?200:404,headers:{'Cache-Control':'no-store'}});
}
