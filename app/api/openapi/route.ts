import {NextResponse} from 'next/server';
import specification from '@/docs/openapi.json';
export const dynamic='force-static';
export function GET(){return NextResponse.json(specification,{headers:{'Cache-Control':'public,max-age=300'}})}
