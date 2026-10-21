import {canAdmin} from '@/lib/admin-permissions';
import {NextRequest,NextResponse} from 'next/server';
import {sessionUser,trustedOrigin} from '@/lib/auth';
import {pool} from '@/lib/db';
export const runtime='nodejs';
const codes=['user_premium','business_premium_1','business_premium_2'] as const;
const features=['extended_profile','stories','analytics','campaign_tools','additional_staff','exclusive_deals','personalized_discovery','saved_tours','priority_support'];
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function POST(req:NextRequest){
 if(!trustedOrigin(req))return fail('Ungültige Herkunft',403);
 const u=await sessionUser(req);if(!u||!canAdmin(u,'finance'))return fail('Admin erforderlich',403);
 const d=await req.json().catch(()=>null);
 if(!d||!codes.includes(d.code)||!['save','approve','withdraw'].includes(d.action))return fail('Planaktion ungültig');
 const tx=await pool.connect();
 try{
  await tx.query('BEGIN');
  const old=await tx.query("SELECT * FROM subscription_plans WHERE code=$1 FOR UPDATE",[d.code]);
  if(!old.rowCount){await tx.query('ROLLBACK');return fail('Plan nicht gefunden',404)}
  if(d.action==='save'){
   const titleDe=typeof d.title_de==='string'?d.title_de.trim():'',titleEn=typeof d.title_en==='string'?d.title_en.trim():'';
   const validPrice=(x:unknown)=>x===null||(typeof x==='number'&&Number.isSafeInteger(x)&&x>0&&x<=10000000);
   if(titleDe.length<2||titleDe.length>100||titleEn.length<2||titleEn.length>100||
      !validPrice(d.monthly_price_cents)||!validPrice(d.annual_price_cents)||
      !Array.isArray(d.features)||d.features.length>features.length||d.features.some((v:unknown)=>typeof v!=='string'||!features.includes(v))||
      new Set(d.features).size!==d.features.length||!Number.isInteger(d.trial_days)||d.trial_days<0||d.trial_days>30){
    await tx.query('ROLLBACK');return fail('Preise, Vorteile oder Probezeit ungültig');
   }
   const terms=typeof d.legal_terms_url==='string'?d.legal_terms_url.trim():'';
   if(terms&&(!terms.startsWith('https://')||terms.length>1000)){await tx.query('ROLLBACK');return fail('Nur HTTPS Vertragsbedingungen erlaubt')}
   await tx.query("UPDATE subscription_plans SET title_de=$2,title_en=$3,features=$4,monthly_price_cents=$5,annual_price_cents=$6,trial_days=$7,legal_terms_url=$8,status='draft',approval_note=NULL,approved_by=NULL,approved_at=NULL,updated_at=now() WHERE code=$1",
    [d.code,titleDe,titleEn,d.features,d.monthly_price_cents,d.annual_price_cents,d.trial_days,terms||null]);
  }else if(d.action==='approve'){
   const note=typeof d.approval_note==='string'?d.approval_note.trim():'';
   if(d.explicit_price_approval!==true||note.length<25||note.length>1000){await tx.query('ROLLBACK');return fail('Offizielle Tarifentscheidung mit Quelle und mindestens 25 Zeichen erforderlich')}
   const row=old.rows[0];
   if(!row.monthly_price_cents||!row.legal_terms_url||!row.legal_terms_url.startsWith('https://')){
    await tx.query('ROLLBACK');return fail('Noch kein bestätigter monatlicher Preis oder gültige AGB hinterlegt');
   }
   await tx.query("UPDATE subscription_plans SET status='approved_for_display',approval_note=$2,approved_by=$3,approved_at=now(),updated_at=now() WHERE code=$1",[d.code,note,u.id]);
  }else{
   await tx.query("UPDATE subscription_plans SET status='draft',approved_by=NULL,approved_at=NULL,approval_note=NULL,updated_at=now() WHERE code=$1",[d.code]);
  }
  await tx.query("INSERT INTO audit_log(actor_id,action,target_type,target_id) VALUES($1,$2,'subscription_plan',$3)",[u.id,'plan:'+d.action,d.code]);
  await tx.query('COMMIT');
  return NextResponse.json({success:true,code:d.code,status:d.action==='approve'?'approved_for_display':'draft',checkout_available:false});
 }catch(e){await tx.query('ROLLBACK');console.error('Admin subscription plans',e);return fail('Tarif konnte nicht gespeichert werden',500)}finally{tx.release()}
}

