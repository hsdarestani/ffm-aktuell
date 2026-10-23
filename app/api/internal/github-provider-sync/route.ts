import {NextRequest,NextResponse} from 'next/server';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {pool} from '@/lib/db';
import {encryptCredential,invalidateProviderCache} from '@/lib/provider-credentials';
export const dynamic='force-dynamic';
export const runtime='nodejs';

/** Only the GitHub-hosted, exact FFM source workflow can provision its own two keys.
 * This endpoint does not use an operator/password backdoor and refuses arbitrary
 * repository Actions, branches and untrusted JWT signing keys. */
const issuer='https://token.actions.githubusercontent.com';
const audience='https://ffm-aktuell.smarbiz.sbs/api/internal/github-provider-sync';
const trustedRefs=new Set(['refs/heads/main','refs/heads/feat/ffm-frankfurtleben-parity-20261023']);
const workflowPrefix='hsdarestani/ffm-aktuell/.github/workflows/ffm-provider-sync.yml@';
const jwks=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks'),{timeoutDuration:7000});
function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})}
export async function POST(req:NextRequest){
 const auth=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]{200,6000}$/.test(auth))return response({error:'Authentication required'},401);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return response({error:'JSON required'},415);
 if(Number(req.headers.get('content-length'))>12000)return response({error:'Request too large'},413);
 let claims;
 try{
  const verified=await jwtVerify(auth.slice(7),jwks,{issuer,audience,algorithms:['RS256'],maxTokenAge:'3m',clockTolerance:10});
  claims=verified.payload;
  if(claims.repository!=='hsdarestani/ffm-aktuell'||String(claims.repository_id)!=='1423074676'||
   typeof claims.ref!=='string'||!trustedRefs.has(claims.ref)||
   claims.workflow_ref!==workflowPrefix+claims.ref||!['push','workflow_dispatch'].includes(String(claims.event_name))||
   claims.sub!=='repo:hsdarestani/ffm-aktuell:ref:'+claims.ref||
   typeof claims.jti!=='string'||claims.jti.length<10||claims.jti.length>150)throw Error('Untrusted GitHub workflow');
 }catch{return response({error:'Unauthorized workflow'},403)}
 let body;
 try{body=await req.json()}catch{return response({error:'Invalid JSON'},400)}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='OPENAI_API_KEY,OPENWEATHER_API_KEY'||
  Object.values(body).some(v=>typeof v!=='string'||v.length<10||v.length>5000||/[\r\n\x00-\x1f]/.test(v)))
  return response({error:'Exactly two valid provider credentials required'},400);
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  await tx.query("DELETE FROM github_oidc_receipts WHERE accepted_at<now()-interval '2 days'");
  const replay=await tx.query('INSERT INTO github_oidc_receipts(jti) VALUES($1) ON CONFLICT DO NOTHING RETURNING jti',[claims.jti]);
  if(!replay.rowCount){await tx.query('ROLLBACK');return response({error:'Already used'},409)}
  for(const name of ['OPENAI_API_KEY','OPENWEATHER_API_KEY'] as const)
   await tx.query('INSERT INTO service_credentials(provider,secret_encrypted,updated_at) VALUES($1,$2,now()) ON CONFLICT(provider) DO UPDATE SET secret_encrypted=excluded.secret_encrypted,updated_at=now()',
    [name,encryptCredential(body[name])]);
  await tx.query('COMMIT');invalidateProviderCache();
  return response({ok:true,configured:['OPENAI_API_KEY','OPENWEATHER_API_KEY']});
 }catch{
  await tx.query('ROLLBACK');return response({error:'Credential storage not available'},503);
 }finally{tx.release()}
}
