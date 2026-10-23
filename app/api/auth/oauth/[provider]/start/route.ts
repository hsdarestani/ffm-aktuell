import {NextRequest,NextResponse} from 'next/server';
import {clientId,configured,pkceChallenge,randomToken,redirectUri,secureCookie,stateCookie,validProvider} from '@/lib/oauth';
export const runtime='nodejs';
export async function GET(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
 const {provider}=await params;
 if(!validProvider(provider))return new NextResponse(null,{status:404});
 if(!configured(provider))return NextResponse.json({error:'Anmeldung noch nicht eingerichtet'},{status:503});
 const state=randomToken(),nonce=randomToken(),verifier=randomToken();
 const values=new URLSearchParams({client_id:clientId(provider)||'',redirect_uri:redirectUri(provider),response_type:'code',scope:provider==='google'?'openid email profile':'name email',state,nonce});
 if(provider==='google'){values.set('code_challenge_method','S256');values.set('code_challenge',pkceChallenge(verifier));}
 else values.set('response_mode','form_post');
 const destination=provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://appleid.apple.com/auth/authorize';
 const response=NextResponse.redirect(destination+'?'+values.toString());
 response.cookies.set(stateCookie(provider),Buffer.from(JSON.stringify({state,nonce,verifier})).toString('base64url'),secureCookie());
 return response;
}
