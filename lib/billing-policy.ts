export const FEATURE_CODES=['extended_profile','stories','analytics','campaign_tools','additional_staff','exclusive_deals','personalized_discovery','saved_tours','priority_support'] as const;
export function billingConfigured(){return Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET)}
export function subscriptionHasAccess(status:string,end:string|Date|null,now=Date.now()){
 return ['active','trialing'].includes(status)&&end!==null&&new Date(end).getTime()>now;
}
export function idOf(value:unknown):string|null{return typeof value==='string'?value:value&&typeof value==='object'&&'id' in value&&typeof value.id==='string'?value.id:null}
export type BillingSnapshot={code:string;audience:string;title_de:string;features:string[];staff_seats:number;branch_limit:number;trial_days:number;legal_terms_url:string;amount:number;interval:'month'|'year'};
export function planSnapshot(plan:Record<string,unknown>,interval:'month'|'year'):BillingSnapshot{
 const amount=Number(interval==='year'?plan.annual_price_cents:plan.monthly_price_cents);
 if(plan.status!=='approved_for_display'||!Number.isSafeInteger(amount)||amount<=0||amount>10000000||typeof plan.legal_terms_url!=='string'||!plan.legal_terms_url.startsWith('https://'))throw Error('Tarif noch nicht zur Buchung freigegeben');
 return {code:String(plan.code),audience:String(plan.audience),title_de:String(plan.title_de),features:Array.isArray(plan.features)?plan.features.filter((x):x is string=>typeof x==='string'):[],staff_seats:Number(plan.staff_seats)||0,branch_limit:Number(plan.branch_limit)||1,trial_days:Number(plan.trial_days)||0,legal_terms_url:plan.legal_terms_url,amount,interval};
}
