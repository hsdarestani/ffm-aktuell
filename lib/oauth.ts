import {createHash,randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {createRemoteJWKSet,importPKCS8,jwtVerify,SignJWT} from 'jose';
import {beginSession,hashPassword} from '@/lib/auth';
import {pool} from '@/lib/db';
export type Provider='google'|'apple';
export function validProvider(v:string):v is Provider{return v==='google'||v==='apple';}
export function clientId(provider:Provider){return provider==='google'?process.env.GOOGLE_OAUTH_CLIENT_ID:process.env.APPLE_SERVICE_ID;}
export function configured(provider:Provider){
 return provider==='google'?Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID&&process.env.GOOGLE_OAUTH_CLIENT_SECRET):
 Boolean(process.env.APPLE_SERVICE_ID&&process.env.APPLE_TEAM_ID&&process.env.APPLE_KEY_ID&&process.env.APPLE_PRIVATE_KEY);
}
export const site=()=>process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
export const redirectUri=(provider:Provider)=>site()+'/api/auth/oauth/'+provider+'/callback';
export function secureCookie(){return {httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'none' as const,path:'/',maxAge:10*60};}
export function stateCookie(provider:Provider){return 'ffm_oauth_'+provider;}
export function randomToken(){return randomBytes(32).toString('hex');}
export function pkceChallenge(verifier:string){return createHash('sha256').update(verifier).digest('base64url');}
export async function appleSecret(){
 const key=await importPKCS8((process.env.APPLE_PRIVATE_KEY||'').replace(/\\n/g,'\n'),'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:process.env.APPLE_KEY_ID})
  .setIssuer(process.env.APPLE_TEAM_ID||'').setAudience('https://appleid.apple.com').setSubject(process.env.APPLE_SERVICE_ID||'')
  .setIssuedAt().setExpirationTime('5m').sign(key);
}
export async function exchange(provider:Provider,code:string,verifier:string){
 const body=new URLSearchParams({code,client_id:clientId(provider)||'',redirect_uri:redirectUri(provider),grant_type:'authorization_code'});
 if(provider==='google'){body.set('client_secret',process.env.GOOGLE_OAUTH_CLIENT_SECRET||'');body.set('code_verifier',verifier);}
 else body.set('client_secret',await appleSecret());
 const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),15000);
 try{
  const res=await fetch(provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:ctl.signal});
  if(!res.ok)throw Error('Provider token exchange failed');
  const json=await res.json();if(typeof json.id_token!=='string')throw Error('Missing provider identity token');
  return json.id_token as string;
 }finally{clearTimeout(timer);}
}
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys=createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
export async function validate(provider:Provider,token:string,nonce:string){
 const {payload}=await jwtVerify(token,provider==='google'?googleKeys:appleKeys,{issuer:provider==='google'?['https://accounts.google.com','accounts.google.com']:'https://appleid.apple.com',audience:clientId(provider),clockTolerance:'30 seconds'});
 if(payload.nonce!==nonce||typeof payload.sub!=='string'||payload.sub.length>255)throw Error('Identity token mismatch');
 const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
 if(!email||email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!(payload.email_verified===true||payload.email_verified==='true'))throw Error('Verified email required');
 const name=(typeof payload.name==='string'?payload.name.trim():'')||email.split('@')[0];
 return {email,sub:payload.sub,name:name.slice(0,100)};
}
export async function completeLogin(provider:Provider,sub:string,email:string,name:string){
 const tx=await pool.connect();let userId='';
 try{
  await tx.query('BEGIN');
  // Never auto-link an arbitrary social identity to an existing password account by email.
  const linked=await tx.query('SELECT user_id FROM social_identities WHERE provider=$1 AND provider_subject=$2 FOR UPDATE',[provider,sub]);
  if(linked.rowCount){userId=linked.rows[0].user_id;await tx.query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()) WHERE id=$1 AND lower(email)=lower($2)',[userId,email]);}
  else {
   const existing=await tx.query('SELECT id FROM users WHERE lower(email)=lower($1)',[email]);
   if(existing.rowCount)throw Error('ACCOUNT_EXISTS');
   const secret=hashPassword(randomBytes(32).toString('hex'));
   const created=await tx.query("INSERT INTO users(email,password_hash,display_name,language,email_verified_at) VALUES($1,$2,$3,'de',now()) RETURNING id",[email,secret,name]);
   userId=created.rows[0].id;
   await tx.query('INSERT INTO social_identities(user_id,provider,provider_subject,email_at_link) VALUES($1,$2,$3,$4)',[userId,provider,sub,email]);
  }
  await tx.query('COMMIT');
 }catch(e){await tx.query('ROLLBACK');throw e}finally{tx.release()}
 const response=NextResponse.redirect(new URL('/?login=ok',site()));
 await beginSession(userId,response);
 return response;
}
export function failure(reason:string){return NextResponse.redirect(new URL('/?login_error='+encodeURIComponent(reason),site()));}
