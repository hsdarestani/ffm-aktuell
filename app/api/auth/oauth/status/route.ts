import {NextResponse} from 'next/server';
import {configured} from '@/lib/oauth';
export function GET(){return NextResponse.json({google:configured('google'),apple:configured('apple')},{headers:{'Cache-Control':'no-store'}})}
