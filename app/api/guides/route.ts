import {NextResponse} from 'next/server';
import {query} from '@/lib/db';
export const dynamic='force-dynamic';
/** Guides are editorial articles, never inferred from generic news or imported from competing apps. */
export async function GET(){
 const r=await query(`SELECT id,title,body_de,body_en,category,source_url,image_url,published_at
 FROM news WHERE status='published' AND published_at<=now()
 AND category IN ('Guide:Café','Guide:Restaurant','Guide:Club','Guide:Sonstige','Guide:Bar','Guide:Aktivitäten')
 ORDER BY published_at DESC,id DESC LIMIT 100`);
 return NextResponse.json({items:r.rows},{headers:{'Cache-Control':'public, max-age=60, stale-while-revalidate=120'}});
}
