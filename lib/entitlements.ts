import {query} from '@/lib/db';
export async function entitlements(userId:string,businessId?:string){
 const scope=(businessId?'business:':'user:')+(businessId||userId);
 const r=await query("SELECT snapshot FROM billing_subscriptions WHERE scope_key=$1 AND status IN ('active','trialing') AND current_period_end>now()",[scope]);
 const snapshots=r.rows.map(row=>row.snapshot);
 return {features:[...new Set(snapshots.flatMap(s=>Array.isArray(s.features)?s.features as string[]:[]))],staff_seats:Math.max(0,...snapshots.map(s=>Array.isArray(s.features)&&s.features.includes('additional_staff')?Number(s.staff_seats)||0:0)),branch_limit:Math.max(1,...snapshots.map(s=>Number(s.branch_limit)||1)),active:snapshots.length>0};
}
