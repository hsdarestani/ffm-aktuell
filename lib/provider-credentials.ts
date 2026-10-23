import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {query} from '@/lib/db';

/** Runtime-only keys: environment if present, otherwise authenticated GitHub OIDC encrypted delivery.
 * Never expose encrypted rows or a raw key in user responses, logs or static rendering. */
type Provider='OPENAI_API_KEY'|'OPENWEATHER_API_KEY';
const cache=new Map<Provider,{value:string|null,expires:number}>();
function key(){
 const secret=process.env.SESSION_SECRET;
 if(!secret||secret.length<32)throw Error('Server credential protection is not configured');
 return createHash('sha256').update('ffm-city-v1:credential:'+secret,'utf8').digest();
}
export function encryptCredential(raw:string){
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),nonce);
 const content=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
 return 'v1:'+Buffer.concat([nonce,cipher.getAuthTag(),content]).toString('base64');
}
export function decryptCredential(stored:string){
 if(!stored.startsWith('v1:'))throw Error('Invalid provider secret format');
 const bytes=Buffer.from(stored.slice(3),'base64');
 if(bytes.length<29)throw Error('Invalid provider secret length');
 const dec=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
 dec.setAuthTag(bytes.subarray(12,28));
 return Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8');
}
export function invalidateProviderCache(){cache.clear()}
export async function getProviderSecret(provider:Provider):Promise<string|null>{
 const fromEnv=process.env[provider];if(fromEnv)return fromEnv;
 const cached=cache.get(provider);if(cached&&cached.expires>Date.now())return cached.value;
 try{
  const r=await query('SELECT secret_encrypted FROM service_credentials WHERE provider=$1',[provider]);
  const raw=r.rows[0]?.secret_encrypted?decryptCredential(r.rows[0].secret_encrypted):null;
  cache.set(provider,{value:raw,expires:Date.now()+30000});return raw;
 }catch{return null} // On migration/credential failure, providers remain unavailable; no secret leakage.
}
