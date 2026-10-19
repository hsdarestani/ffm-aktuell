'use client';
import {Bookmark,BookmarkCheck,CalendarPlus,ExternalLink} from 'lucide-react';

type Event={id:string;title:string;description_de:string;venue:string;starts_at:string;ticket_url:string|null;demo?:boolean};
type Props={event:Event;saved:boolean;loggedIn:boolean;onLogin:()=>void;onSaved:(id:string,active:boolean)=>Promise<void>;onNotice:(message:string)=>void};
function icsEscape(value:string){return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
export function eventCalendarContent(event:Event){
 const start=new Date(event.starts_at);
 if(Number.isNaN(start.getTime()))return null;
 // The event source specifies only the start. One hour is a calendar block
 // placeholder, NOT a claimed organizer-provided end time.
 const end=new Date(start.getTime()+60*60*1000);
 const stamp=(d:Date)=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FFM Aktuell//Veranstaltung//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'BEGIN:VEVENT','UID:'+encodeURIComponent(event.id)+'@ffm-aktuell.smarbiz.sbs',
  'DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),
  'SUMMARY:'+icsEscape(event.title),'LOCATION:'+icsEscape(event.venue),
  'DESCRIPTION:'+icsEscape(event.description_de||'')+'\\nEndzeit nicht bestätigt. Bitte beim Veranstalter prüfen.',
  'BEGIN:VALARM','TRIGGER:-PT60M','ACTION:DISPLAY','DESCRIPTION:'+icsEscape('FFM Aktuell: '+event.title),'END:VALARM',
  'END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
export default function EventActions({event,saved,loggedIn,onLogin,onSaved,onNotice}:Props){
 const calendar=()=>{
  if(event.demo)return;
  const text=eventCalendarContent(event);
  if(!text){onNotice('Datum für diesen Termin fehlt.');return}
  const blob=new Blob([text],{type:'text/calendar;charset=utf-8'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download='ffm-veranstaltung.ics';document.body.appendChild(a);
  a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(href),2000);
  onNotice('Kalendereintrag mit Erinnerung 1 Stunde vorher erstellt. Endzeit beim Anbieter prüfen.');
 };
 if(event.demo)return null;
 let safeTicket:string|null=null;
 try{const parsed=new URL(event.ticket_url||'');if(['https:','http:'].includes(parsed.protocol))safeTicket=parsed.toString()}catch{}
 return <div className="ffm-event-actions">
  <button type="button" onClick={()=>loggedIn?void onSaved(event.id,!saved):onLogin()} aria-pressed={saved} aria-label={saved?'Veranstaltung nicht mehr merken':'Veranstaltung merken'}>
   {saved?<BookmarkCheck size={16}/>:<Bookmark size={16}/>}<span>{saved?'Gemerkt':'Merken'}</span></button>
  <button type="button" onClick={calendar}><CalendarPlus size={16}/><span>Kalender</span></button>
  {safeTicket&&<a href={safeTicket} target="_blank" rel="noopener noreferrer"><span>Infos</span><ExternalLink size={13}/></a>}
 </div>;
}
