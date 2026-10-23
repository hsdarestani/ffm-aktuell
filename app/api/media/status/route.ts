import {NextResponse} from 'next/server';
import {scannerReady,MAX} from '@/lib/media-storage';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const healthy=await scannerReady();
 return NextResponse.json({upload_enabled:healthy,max_file_bytes:MAX,allowed_types:['image/jpeg','image/png','image/webp','video/mp4','video/webm']},{headers:{'Cache-Control':'no-store'}});
}
