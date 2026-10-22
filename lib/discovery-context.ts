export const berlinDate=(d=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function parseDiscoveryContext(q:URLSearchParams,now=new Date()){
 const date=q.get('date')||berlinDate(now),occasion=q.get('occasion')||'',budget=q.get('budget')||'';
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||date<berlinDate(now)||Date.parse(date)>now.getTime()+366*86400000)throw Error('Datum ungültig');
 if(!['','family','date','friends','quiet'].includes(occasion)||!['','1','2','3','4'].includes(budget))throw Error('Anlass oder Preisniveau ungültig');
 const euros=q.get('event_budget');const eventBudget=euros===null||euros===''?null:Number(euros);
 if(eventBudget!==null&&(!Number.isFinite(eventBudget)||eventBudget<0||eventBudget>10000))throw Error('Veranstaltungsbudget ungültig');
 return {date,occasion,budget,eventBudget:eventBudget===null?null:Math.round(eventBudget*100),weather:q.get('weather')==='1'};
}
export function contextMatches(facts:Record<string,string>,ctx:ReturnType<typeof parseDiscoveryContext>,indoor=false){
 const field:Record<string,string>={family:'family_friendly',date:'date_friendly',friends:'group_friendly',quiet:'quiet'};
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
 if(!process.env.OPENWEATHER_API_KEY||unavailableUntil>Date.now())return null;
 if(!cached||cached.until<Date.now()){
  if(!inFlight)inFlight=(async()=>{const r=await fetch('https://api.openweathermap.org/data/2.5/forecast?lat=50.1109&lon=8.6821&units=metric&appid='+encodeURIComponent(process.env.OPENWEATHER_API_KEY!),{signal:AbortSignal.timeout(6000),cache:'no-store'});if(!r.ok)throw Error('Forecast unavailable');const d=await r.json();if(!Array.isArray(d.list)||d.list.length>50)throw Error('Forecast invalid');cached={until:Date.now()+30*60000,list:d.list,fetchedAt:new Date().toISOString()};return d.list})().finally(()=>{inFlight=null});
  try{await inFlight}catch{unavailableUntil=Date.now()+15*60000;return null}
 }
 const summary=weatherSummary(cached?.list,date);return summary&&cached?{...summary,checked_at:cached.fetchedAt}:null;
}
