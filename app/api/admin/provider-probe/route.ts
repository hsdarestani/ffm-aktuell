import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {canAdmin} from '@/lib/admin-permissions';
import {getProviderSecret} from '@/lib/provider-credentials';
export const dynamic='force-dynamic';
type Probe='missing'|'ready'|'unauthorized'|'unavailable';
async function probe(url:string,headers?:Record<string,string>):Promise<Probe>{
 try{const r=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(6500)});
  if(r.status===401||r.status===403)return 'unauthorized';
  if(!r.ok)return 'unavailable';return 'ready';
 }catch{return 'unavailable'}
}
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return NextResponse.json({error:'Ungültige Herkunft'},{status:403});
 const user=await sessionUser(req);
 if(!user||!canAdmin(user,'operations'))return NextResponse.json({error:'Zugriff verweigert'},{status:403});
 const [ai,weather]=await Promise.all([getProviderSecret('OPENAI_API_KEY'),getProviderSecret('OPENWEATHER_API_KEY')]);
 const model=process.env.OPENAI_RECOMMENDATION_MODEL||'gpt-4o-mini';
 const [assistant,forecast]=await Promise.all([
  ai?probe('https://api.openai.com/v1/models/'+encodeURIComponent(model),{Authorization:'Bearer '+ai}):Promise.resolve<Probe>('missing'),
  weather?probe('https://api.openweathermap.org/data/2.5/forecast?lat=50.1109&lon=8.6821&units=metric&cnt=1&appid='+encodeURIComponent(weather)):Promise.resolve<Probe>('missing')
 ]);
 return NextResponse.json({assistant,weather:forecast,model,checked_at:new Date().toISOString(),
  note:'Live provider reachability/auth check. Successful model access does not prove suitable editorial inventory, complete event data or paid call quotas.'},
  {headers:{'Cache-Control':'no-store, private'}});
}
