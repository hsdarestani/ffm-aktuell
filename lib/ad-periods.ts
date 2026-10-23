/** Inclusive calendar days; UTC arithmetic avoids DST changing the booked day count. */
export function adPeriodEnd(start:string,days:1|7|30):string{
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(start))return '';
 const date=new Date(start+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==start)return '';
 date.setUTCDate(date.getUTCDate()+days-1);return date.toISOString().slice(0,10);
}
export function nextBerlinDay():string{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);
}
