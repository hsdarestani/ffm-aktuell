import type {PoolClient} from 'pg';
/** Caller holds the customer row lock. Cards retain their agreed reward/rules across later edits. */
export async function allocateLoyaltyVisits(tx:Pick<PoolClient,'query'>,userId:string,businessId:string){
 const program=(await tx.query("SELECT * FROM loyalty_programs WHERE business_id=$1 FOR SHARE",[businessId])).rows[0];if(!program)return null;
 let card=(await tx.query('SELECT * FROM loyalty_cards WHERE user_id=$1 AND program_id=$2 AND redeemed_at IS NULL FOR UPDATE',[userId,program.id])).rows[0];
 if(!card&&program.status!=='published')return null;
 if(!card)card=(await tx.query('INSERT INTO loyalty_cards(program_id,user_id,goal,minimum_hours,reward,terms_url) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[program.id,userId,program.goal,program.minimum_hours,program.reward,program.terms_url])).rows[0];
 const used=Number((await tx.query('SELECT count(*)::int AS n FROM loyalty_card_visits WHERE card_id=$1',[card.id])).rows[0].n);
 const remaining=card.goal-used;if(remaining>0)await tx.query(`INSERT INTO loyalty_card_visits(card_id,visit_id)
 SELECT $1,v.id FROM confirmed_visits v WHERE v.user_id=$2 AND v.business_id=$3 AND v.confirmed_at>=$4
 AND NOT EXISTS(SELECT 1 FROM loyalty_card_visits cv WHERE cv.visit_id=v.id)
 ORDER BY v.confirmed_at,v.id LIMIT $5 ON CONFLICT DO NOTHING`,[card.id,userId,businessId,program.first_active_at,remaining]);
 return card.id as string;
}
