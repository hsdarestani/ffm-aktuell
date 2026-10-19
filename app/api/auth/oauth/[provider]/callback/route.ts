import {NextRequest,NextResponse} from 'next/server';
import {completeLogin,configured,exchange,failure,stateCookie,validate,validProvider} from '@/lib/oauth';
export const runtime='nodejs';
export async function handle(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
 const {provider}=await params;
 if(!validProvider(provider))return new NextResponse(null,{status:404});
 if(!configured(provider))return failure('not_configured');
 try{
  const result=req.method==='POST'?new URLSearchParams(await req.text()):req.nextUrl.searchParams;
  const state=result.get('state')||'',code=result.get('code')||'';
  const raw=req.cookies.get(stateCookie(provider))?.value||'';
  const saved=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')) as {state:string;nonce:string;verifier:string};
  if(!state||!code||state!==saved.state||!saved.nonce||!saved.verifier||code.length>2048)throw Error('Invalid login state');
  const jwt=await exchange(provider,code,saved.verifier);
  const identity=await validate(provider,jwt,saved.nonce);
  const response=await completeLogin(provider,identity.sub,identity.email,identity.name);
  response.cookies.delete(stateCookie(provider));
  return response;
 }catch(e){const response=failure(e instanceof Error&&e.message==='ACCOUNT_EXISTS'?'existing_account':'oauth_failed');response.cookies.delete(stateCookie(provider));return response}
}
export const GET=handle;
export const POST=handle;
