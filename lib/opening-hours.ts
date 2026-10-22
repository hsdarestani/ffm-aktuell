/** Published daily plans avoid guessing holiday exceptions or parsing unverified OSM text. */
export function openNowSQL(alias='places',clock='now()'){
 const local=`(${clock} AT TIME ZONE 'Europe/Berlin')`;
 return `(${alias}.verification_status='verified' AND ${alias}.activity_status='operating' AND ${alias}.verified_at BETWEEN ${clock}-interval '30 days' AND ${clock}
 AND EXISTS(SELECT 1 FROM place_opening_days h WHERE h.place_id=${alias}.id AND h.day=${local}::date AND h.state='open'
 AND h.checked_at BETWEEN ${clock}-interval '30 days' AND ${clock} AND EXISTS(SELECT 1 FROM jsonb_array_elements(h.periods) AS slot WHERE
 (EXTRACT(hour FROM ${local})*60+EXTRACT(minute FROM ${local})) >= (slot->>'start')::int AND
 (EXTRACT(hour FROM ${local})*60+EXTRACT(minute FROM ${local})) < (slot->>'end')::int)))`;
}
export function validPeriods(periods:unknown,state:string):periods is {start:number;end:number}[]{
 if(!Array.isArray(periods)||periods.length>6||(state==='open'&&!periods.length)||(state==='closed'&&periods.length))return false;
 let last=-1;for(const p of periods){if(!p||!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.start<0||p.end>1440||p.start>=p.end||p.start<last)return false;last=p.end}return true;
}
