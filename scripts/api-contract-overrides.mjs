// Canonical client inputs for imperative validators. Runtime guards remain authoritative.
const string={type:'string'},boolean={type:'boolean'},number={type:'number'},uuid={type:'string',format:'uuid'},url={type:'string',format:'uri'},date={type:'string',format:'date'},uuids={type:'array',items:uuid};
const en=(...values)=>({type:'string',enum:values});
const object=(properties,required=[])=>({type:'object',properties,...(required.length?{required}:{})});
export const imperativeInputs={
 'POST /api/ad-booking':object({campaign_id:uuid,action:en('checkout','stop'),accept_terms:boolean,amount:{type:'integer'}},['campaign_id']),
 'POST /api/ad-rates':object({placement:string,daily_cents:{type:'integer'},approved:boolean,reason:string,terms_url:url},['placement','daily_cents','approved','reason']),
 'POST /api/admin/business-seats':object({business_id:uuid,seats:{type:'integer'},terms_approved:boolean,reason:string},['business_id','seats','terms_approved','reason']),
 'POST /api/admin/campaigns':object({action:en('review','stop'),id:uuid,note:string,approve:boolean},['id']),
 'POST /api/admin/plans':object({code:string,action:en('save','approve','withdraw'),title_de:string,title_en:string,monthly_price_cents:{type:['integer','null']},annual_price_cents:{type:['integer','null']},features:{type:'array',items:string},trial_days:{type:'integer'},staff_seats:{type:'integer'},branch_limit:{type:'integer'},legal_terms_url:url,approval_note:string,explicit_price_approval:boolean},['code','action']),
 'POST /api/advertising':object({token:{type:'string',pattern:'^[a-f0-9]{64}$'},kind:en('impression','click')},['token','kind']),
 'POST /api/auth/phone':object({action:en('start','check','unlink'),phone:string,consent:boolean,code:string},['action']),
 'POST /api/billing/portal':object({subscription_id:string}),
 'POST /api/business/team':object({action:en('invite','revoke','remove','role','scope'),id:uuid,user_id:uuid,email:{type:'string',format:'email'},role:en('viewer','editor'),all_places:boolean,place_ids:uuids},['action']),
 'POST /api/business/team/accept':object({token:string},['token']),
 'POST /api/campaigns':object({action:en('create','submit','cancel'),id:uuid,title:string,copy_de:string,start_date:date,end_date:date,placement:string,place_id:uuid},['action']),
 'POST /api/categories':object({action:en('save','status'),slug:string,active:boolean,label_de:string,label_en:string,parent_slug:{type:['string','null']}},['action']),
 'POST /api/categories/places':object({categories:{type:'array',items:string,maxItems:6},place_id:uuid},['categories','place_id']),
 'POST /api/highlights':object({grant_id:uuid},['grant_id']),
 'POST /api/home-layout':object({modules:{type:'array',items:object({code:string,enabled:boolean},['code','enabled'])}},['modules']),
 'DELETE /api/me/push':object({all:boolean,endpoint:url}),
 'POST /api/me/verify-email/confirm':object({token:string},['token']),
 'DELETE /api/media/manage':object({id:uuid},['id']),
 'POST /api/media/moderation':object({id:uuid,type:en('story','highlight'),approve:boolean},['id','type','approve']),
 'POST /api/media/review':object({id:uuid,approve:boolean},['id','approve']),
 'POST /api/media/rights':object({action:en('grant','revoke'),id:uuid,business_id:uuid,media_id:uuid,expires_at:{type:'string',format:'date-time'}},['action']),
 'POST /api/stories':object({action:en('create','remove'),id:uuid,media_id:uuid,caption:{type:'string',maxLength:280},business_id:uuid,place_id:uuid},['action'])
};
