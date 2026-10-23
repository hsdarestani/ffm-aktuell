export const berlinDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function parseDiscoveryContext(q:URLSearchParams,now=new Date()){
 const date=q.get('date')||berlinDate(now),occasion=q.get('occasion')||'',budget=q.get('budget')||'';
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<berlinDate(now)||Date.parse(date)>now.getTime()+366*86400000)throw Error('Datum ungültig');
 if(!['','family','date','friends','quiet'].includes(occasion)||!['','1','2','3','4'].includes(budget))throw Error('Anlass oder Preisniveau ungültig');
 const daypart=q.get('daypart')||'',mood=q.get('mood')||'',companion=q.get('companion')||'';
 if(!['','morning','afternoon','evening','night'].includes(daypart)||!['','relaxed','active','social'].includes(mood)||!['','solo','family','friends','partner'].includes(companion))throw Error('Tageszeit, Stimmung oder Begleitung ungültig');
 const radius=Number(q.get('radius')||3),lat=q.has('lat')?Number(q.get('lat')):null,lon=q.has('lon')?Number(q.get('lon')):null;
 if(![1,3,5,10].includes(radius)||(lat===null)!==(lon===null)||lat!==null&&(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<49.7||lat>50.4||lon!<8.2||lon!>9.1))throw Error('Standort ungültig');
 const ranges:Record<string,[number,number]>={morning:[6,12],afternoon:[12,18],evening:[18,24],night:[0,6]};
 const timeRange=ranges[daypart]||[0,24];
 const euros=q.get('event_budget');const eventBudget=euros===null||euros===''?null:Number(euros);
 if(eventBudget!==null&&(!Number.isFinite(eventBudget)||eventBudget<0||eventBudget>10000))throw Error('Veranstaltungsbudget ungültig');
 return {date,occasion,budget,daypart,mood,companion,timeRange,lat,lon,radius,eventBudget:eventBudget===null?null:Math.round(eventBudget*100),weather:q.get('weather')==='1'};
}
export function contextMatches(facts:Record<string,string>,ctx:ReturnType<typeof parseDiscoveryContext>,indoor=false,place:{category?:string;periods?:{start:number;end:number}[];latitude?:number;longitude?:number}={}){
 const field:Record<string,string>={family:'family_friendly',date:'date_friendly',friends:'group_friendly',quiet:'quiet'};
 const companionField:Record<string,string>={family:'family_friendly',friends:'group_friendly',partner:'date_friendly'};
 const distance=ctx.lat!==null?venueDistance(ctx.lat,ctx.lon!,Number(place.latitude),Number(place.longitude)):null;
 if(ctx.lat!==null&&(distance===null||distance>ctx.radius))return false;
 if(ctx.companion&&companionField[ctx.companion]&&facts[companionField[ctx.companion]]!=='yes')return false;
 if(ctx.mood==='relaxed'&&facts.quiet!=='yes'||ctx.mood==='social'&&facts.group_friendly!=='yes'||ctx.mood==='active'&&!['Sport','Fitness','Natur','Freizeit'].includes(place.category||''))return false;
 if(ctx.daypart&&!place.periods?.some(p=>p.start<ctx.timeRange[1]*60&&p.end>ctx.timeRange[0]*60))return false;
 return (!ctx.budget||(facts.price_level!==undefined&&Number(facts.price_level)<=Number(ctx.budget)))&&(!ctx.occasion||facts[field[ctx.occasion]]==='yes')&&(!indoor||facts.indoor==='yes');
}
export function weatherSummary(list:unknown,date:string,now=Date.now()){
 if(!Array.isArray(list))return null;
 const points=list.filter(x=>x&&Number.isFinite(x.dt)&&x.dt*1000>=now-3600000&&berlinDate(new Date(x.dt*1000))===date&&Number.isFinite(x.main?.temp)&&x.main.temp>=-60&&x.main.temp<=60&&Array.isArray(x.weather)&&x.weather.every((w:Record<string,unknown>)=>Number.isInteger(w.id)));
 if(!points.length)return null;
 const wet=points.some(x=>x.weather.some((w:{id:number})=>w.id>=200&&w.id<700)||Number(x.pop)>=0.5);
 return {date,min:Math.round(Math.min(...points.map(x=>x.main.temp))),max:Math.round(Math.max(...points.map(x=>x.main.temp))),prefer_indoor:wet||points.some(x=>x.main.temp<5||x.main.temp>32),checked_at:new Date(now).toISOString(),source_url:'https://openweathermap.org/',provider:'OpenWeather'};
}
let unavailableUntil=0;
let cached:{until:number;list:unknown;fetchedAt:string}|null=null;
let inFlight:Promise<unknown>|null=null;
export async function forecastFor(date:string){
 const {getProviderSecret}=await import('@/lib/provider-credentials');
 const apiKey=await getProviderSecret('OPENWEATHER_API_KEY');
 if(!apiKey||unavailableUntil>Date.now())return null;
 if(!cached||cached.until<Date.now()){
  if(!inFlight)inFlight=(async()=>{const r=await fetch('https://api.openweathermap.org/data/2.5/forecast?lat=50.1109&lon=8.6821&units=metric&appid='+encodeURIComponent(apiKey),{signal:AbortSignal.timeout(6000),cache:'no-store'});if(!r.ok)throw Error('Forecast unavailable');const d=await r.json();if(!Array.isArray(d.list)||d.list.length>50)throw Error('Forecast invalid');cached={until:Date.now()+30*60000,list:d.list,fetchedAt:new Date().toISOString()};return d.list})().finally(()=>{inFlight=null});
  try{await inFlight}catch{unavailableUntil=Date.now()+15*60000;return null}
 }
 const summary=weatherSummary(cached?.list,date);return summary&&cached?{...summary,checked_at:cached.fetchedAt}:null;
}

export function venueDistance(lat:number,lon:number,targetLat:number,targetLon:number){if(![lat,lon,targetLat,targetLon].every(Number.isFinite))return null;const rad=(n:number)=>n*Math.PI/180;const a=Math.sin(rad(targetLat-lat)/2)**2+Math.cos(rad(lat))*Math.cos(rad(targetLat))*Math.sin(rad(targetLon-lon)/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,a)))}
