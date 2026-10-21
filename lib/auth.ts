import {createHash,randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {query} from '@/lib/db';
export type User={id:string,email:string,display_name:string,role:'user'|'admin',language:'de'|'en',admin_permissions?:string[]};
const cookieName='ffm_session';
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');const digest=scryptSync(password,salt,64).toString('hex');return 'scrypt$'+salt+'$'+digest;}
export function verifyPassword(password:string,stored:string){const parts=stored.split('$');if(parts.length!==3||parts[0]!=='scrypt')return false;try{const a=scryptSync(password,parts[1],64);const b=Buffer.from(parts[2],'hex');return a.length===b.length && timingSafeEqual(a,b);}catch{return false;}}
function tokenHash(token:string){return createHash('sha256').update(token).digest('hex');}
export async function sessionUser(req:NextRequest):Promise<User|null>{
  const token=req.cookies.get(cookieName)?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const r=await query<User>('SELECT u.id,u.email,u.display_name,u.role,u.language,ARRAY(SELECT DISTINCT unnest(ar.permissions) FROM admin_role_assignments ara JOIN admin_roles ar ON ar.code=ara.role_code WHERE ara.user_id=u.id) AS admin_permissions FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[tokenHash(token)]);
  return r.rows[0]||null;
}
export async function beginSession(userId:string,res:NextResponse){
  const token=randomBytes(32).toString('hex');
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[tokenHash(token),userId]);
  res.cookies.set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*30});
}
export async function endSession(req:NextRequest,res:NextResponse){
 const token=req.cookies.get(cookieName)?.value;
 if(token)await query('DELETE FROM sessions WHERE token_hash=$1',[tokenHash(token)]);
 res.cookies.set(cookieName,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
}
export function trustedOrigin(req:NextRequest){
 const origin=req.headers.get('origin');
 const allowed=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
 if(!origin)return req.headers.get('sec-fetch-site') !== 'cross-site';
 return origin===allowed || (process.env.NODE_ENV!=='production' && /^http:\/\/localhost:\d+$/.test(origin));
}

export async function isRecentlyAuthenticated(req:NextRequest,userId:string,minutes=5):Promise<boolean>{
 const raw=req.cookies.get(cookieName)?.value;
 if(!raw||!/^[a-f0-9]{64}$/.test(raw))return false;
 const check=await query("SELECT 1 FROM sessions WHERE token_hash=$1 AND user_id=$2 AND authenticated_at>now()-($3::int * interval '1 minute') AND expires_at>now()",[tokenHash(raw),userId,minutes]);
 return Boolean(check.rowCount);
}

