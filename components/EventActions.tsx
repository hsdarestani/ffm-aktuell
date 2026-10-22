'use client';
import {useUiText} from '@/lib/ui-locale';
import {Bookmark,BookmarkCheck,CalendarPlus,ExternalLink} from 'lucide-react';

import {eventCalendarContent,confirmedEventEnd} from '@/lib/event-calendar';
export {eventCalendarContent} from '@/lib/event-calendar';
type Event={id:string;title:string;description_de:string;venue:string;starts_at:string;ends_at?:string|null;ticket_url:string|null;demo?:boolean};
type Props={event:Event;saved:boolean;loggedIn:boolean;onLogin:()=>void;onSaved:(id:string,active:boolean)=>Promise<void>;onNotice:(message:string)=>void};
export default function EventActions({event,saved,loggedIn,onLogin,onSaved,onNotice}:Props){
 const ui=useUiText();
 const calendar=()=>{
  if(event.demo)return;
  const text=eventCalendarContent(event);
  if(!text){onNotice(ui("Datum für diesen Termin fehlt."));return}
  const blob=new Blob([text],{type:'text/calendar;charset=utf-8'});
  const href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download='ffm-veranstaltung.ics';document.body.appendChild(a);
  a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(href),2000);
  onNotice(confirmedEventEnd(event)?ui("Kalendereintrag mit Erinnerung 1 Stunde vorher erstellt."):ui("Kalendereintrag mit Erinnerung erstellt. Endzeit unbekannt, Kalenderblock: 1 Stunde."));
 };
 if(event.demo)return null;
 let safeTicket:string|null=null;
 try{const parsed=new URL(event.ticket_url||'');if(['https:','http:'].includes(parsed.protocol))safeTicket=parsed.toString()}catch{}
 return <div className="ffm-event-actions">
  <button type="button" onClick={()=>loggedIn?void onSaved(event.id,!saved):onLogin()} aria-pressed={saved} aria-label={(saved?ui("Gemerkt"):ui("Merken"))+" · "+(saved?ui("Veranstaltung nicht mehr merken"):ui("Veranstaltung merken"))}>
   {saved?<BookmarkCheck size={16}/>:<Bookmark size={16}/>}<span>{saved?ui("Gemerkt"):ui("Merken")}</span></button>
  <button type="button" onClick={calendar}><CalendarPlus size={16}/><span>{ui("Kalender")}</span></button>
  {safeTicket&&<a href={safeTicket} target="_blank" rel="noopener noreferrer"><span>{ui("Infos")}</span><ExternalLink size={13}/></a>}
 </div>;
}

