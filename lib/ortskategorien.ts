// FFM Aktuell — einheitliche Entdeckungsrubriken und überprüfbare Empfehlungen.
export const KATEGORIEN=[
 {id:'Alle',label:'Alle',gruppe:'Alles',stichworte:[]},
 {id:'Apotheken',label:'Apotheken',gruppe:'Gesundheit',stichworte:['apotheke','pharmacy']},
 {id:'Apotheken Notdienst',label:'Apotheken-Notdienst',gruppe:'Gesundheit',stichworte:['apotheke','pharmacy']},
 {id:'Cafés',label:'Cafés',gruppe:'Essen & Trinken',stichworte:['café','cafe','coffee','kaffee']},
 {id:'Bars',label:'Bars',gruppe:'Essen & Trinken',stichworte:['bar','cocktail']},
 {id:'Clubs',label:'Nachtclubs',gruppe:'Nachtleben',stichworte:['nightclub','night club','club','disco','diskothek']},
 {id:'Shisha Bars',label:'Shishabars',gruppe:'Nachtleben',stichworte:['shisha','hookah','wasserpfeife']},
 {id:'Restaurants',label:'Restaurants',gruppe:'Essen & Trinken',stichworte:['restaurant','gastronomie','speiselokal']},
 {id:'Imbiss',label:'Imbiss & Schnellgerichte',gruppe:'Essen & Trinken',stichworte:['imbiss','snack','fast food','streetfood','döner','kebab']},
 {id:'Brunch',label:'Frühstück & Brunch',gruppe:'Essen & Trinken',stichworte:['brunch','frühstück','breakfast']},
 {id:'Museen',label:'Museen',gruppe:'Kultur',stichworte:['museum','museen','kunsthalle','galerie']},
 {id:'Kultur',label:'Kultur',gruppe:'Kultur',stichworte:['kultur','theater','oper','konzert','kunst']},
 {id:'Sehenswürdigkeiten',label:'Sehenswertes',gruppe:'Entdecken',stichworte:['sehenswürd','monument','attraktion','landmark']},
 {id:'Natur',label:'Parks & Natur',gruppe:'Entdecken',stichworte:['natur','park','garten','grün','wald']},
 {id:'Fußball',label:'Fußball',gruppe:'Sport & Bewegung',stichworte:['fußball','fussball','football','soccer']},
 {id:'Padel',label:'Padel',gruppe:'Sport & Bewegung',stichworte:['padel']},
 {id:'Sport',label:'Weitere Sportarten',gruppe:'Sport & Bewegung',stichworte:['sport','fitness','tennis','klettern','sportanlage']},
 {id:'Laufgruppen',label:'Laufgruppen',gruppe:'Gruppen & Gemeinschaft',stichworte:['laufclub','laufgruppe','running club','running group','run club','laufgemeinschaft']},
 {id:'Spaziergruppen',label:'Spaziergruppen',gruppe:'Gruppen & Gemeinschaft',stichworte:['spazierclub','spaziergruppe','walking club','wandern','wandergruppe']},
 {id:'Lesegruppen',label:'Lesegruppen',gruppe:'Gruppen & Gemeinschaft',stichworte:['leseclub','lesekreis','buchclub','book club','reading club']},
 {id:'Freizeit',label:'Freizeit',gruppe:'Entdecken',stichworte:['freizeit','aktivität','erlebnis']},
 {id:'Wellness',label:'Entspannung',gruppe:'Weitere',stichworte:['wellness','spa','sauna']},
 {id:'Shopping',label:'Einkaufen',gruppe:'Weitere',stichworte:['shopping','einkaufen','laden']},
 {id:'Familie',label:'Familie',gruppe:'Weitere',stichworte:['familie','kinder']},
 {id:'Kostenlos',label:'Kostenlos',gruppe:'Weitere',stichworte:['kostenlos','eintritt frei']}
] as const;
export type Ortsrubrik=typeof KATEGORIEN[number]['id'];
export type Betriebsstatus='unknown'|'operating'|'temporarily_closed'|'permanently_closed';
export type Quellenstatus='unverified'|'verified'|'disputed';
export type GepruefterOrt={
 category:string;name:string;description_de?:string|null;
 demo?:boolean;verification_status?:Quellenstatus|null;activity_status?:Betriebsstatus|null;
 verified_at?:string|null;verification_source?:string|null;editorial_rank?:number|null;
};
export function passendeRubrik(ort:GepruefterOrt,rubrik:string){
 if(rubrik==='Alle')return true;
 const item=KATEGORIEN.find(k=>k.id===rubrik);if(!item)return ort.category===rubrik;
 const text=[ort.category,ort.name,ort.description_de||''].join(' ').toLocaleLowerCase('de-DE');
 return ort.category===rubrik||item.stichworte.some(v=>text.includes(v));
}
export function frischBestaetigt(ort:GepruefterOrt,now=new Date()){
 if(ort.demo||ort.verification_status!=='verified'||ort.activity_status!=='operating'||!ort.verified_at)return false;
 const t=Date.parse(ort.verified_at),age=now.getTime()-t;
 return Number.isFinite(t)&&age>=0&&age<=30*86400000;
}
export function bestenauswahl(orte:GepruefterOrt[],now=new Date()){
 // Keine Bewertungen erfinden. Redaktionell gewählte Empfehlungen dürfen nur
 // einen in den letzten 30 Tagen überprüften, aktiven Betrieb enthalten.
 return orte.filter(p=>frischBestaetigt(p,now)&&(p.editorial_rank??0)>0)
  .sort((a,b)=>(b.editorial_rank??0)-(a.editorial_rank??0));
}
export function statusLabel(ort:GepruefterOrt,now=new Date()){
 if(ort.demo)return 'Musterort';
 if(ort.activity_status==='permanently_closed')return 'Dauerhaft geschlossen';
 if(ort.activity_status==='temporarily_closed')return 'Vorübergehend geschlossen';
 return frischBestaetigt(ort,now)?'Betrieb kürzlich überprüft':'Betriebsstatus nicht aktuell geprüft';
}
