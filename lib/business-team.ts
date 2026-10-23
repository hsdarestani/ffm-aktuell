import {query} from '@/lib/db';
import type {User} from '@/lib/auth';
/** Explicit business-level access; viewers never have content-write rights. */
export async function resolveBusinessEditor(user:User,placeId:string){
 const r=await query<{id:string,status:string}>(
 "SELECT b.id,b.status FROM businesses b JOIN places p ON p.business_id=b.id LEFT JOIN business_team_members tm ON tm.business_id=b.id AND tm.user_id=$1 WHERE p.id=$2 AND (b.owner_id=$1 OR (tm.role='editor' AND business_staff_allowed(b.id,$1) AND (tm.all_places OR p.id=ANY(tm.place_ids)))) LIMIT 1",
 [user.id,placeId]);
 return r.rows[0]||null;
}

