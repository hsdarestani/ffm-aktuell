export type CalendarEvent={
 id:string;title:string;description_de:string;venue:string;starts_at:string;ends_at?:string|null;
};
function escapeText(value:string){
 return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
/** RFC 5545 lines are at most 75 octets; fold between Unicode code points. */
function foldLine(line:string){
 const encoder=new TextEncoder();let result='',part='',bytes=0;
 for(const character of line){
  const length=encoder.encode(character).length;
  if(bytes+length>75){result+=part+'\r\n';part=' ';bytes=1;}
  part+=character;bytes+=length;
 }
 return result+part;
}
export function confirmedEventEnd(event:CalendarEvent){
 if(!event.ends_at)return null;
 const start=Date.parse(event.starts_at),end=Date.parse(event.ends_at);
 return Number.isFinite(start)&&Number.isFinite(end)&&end>start?new Date(end):null;
}
export function eventCalendarContent(event:CalendarEvent,now=new Date()){
 const start=new Date(event.starts_at);
 if(!Number.isFinite(start.getTime())||!Number.isFinite(now.getTime()))return null;
 const confirmedEnd=confirmedEventEnd(event);
 const end=confirmedEnd??new Date(start.getTime()+60*60*1000);
 const stamp=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const description=(event.description_de||'')+(confirmedEnd?'':'\nEndzeit nicht bestätigt. Kalenderblock: 1 Stunde. Bitte beim Veranstalter prüfen.');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FFM Aktuell//Veranstaltung//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'BEGIN:VEVENT','UID:'+encodeURIComponent(event.id)+'@ffm-aktuell.smarbiz.sbs',
  'DTSTAMP:'+stamp(now),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),
  'SUMMARY:'+escapeText(event.title),'LOCATION:'+escapeText(event.venue),
  'DESCRIPTION:'+escapeText(description),
  'BEGIN:VALARM','TRIGGER:-PT60M','ACTION:DISPLAY','DESCRIPTION:'+escapeText('FFM Aktuell: '+event.title),'END:VALARM',
  'END:VEVENT','END:VCALENDAR',''].map(foldLine).join('\r\n');
}

/** Keep the selected date and visible calendar month in sync across month edges. */
export function calendarMonthSelection(current:string,by:number,today:string){
 const d=new Date(current.slice(0,7)+'-01T12:00:00Z');
 d.setUTCMonth(d.getUTCMonth()+by);
 const month=d.toISOString().slice(0,7)+'-01';
 return {month,selected:month.slice(0,7)===today.slice(0,7)?today:month};
}
export function eventCalendarDate(d:Date){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
 const part=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
