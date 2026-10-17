/**
 * Öffentlich sichtbare, ausdrücklich als Beispiele markierte Vorschau-Inhalte.
 * Keine erfundenen Termine, Rabatte oder Beiträge werden in der Datenbank veröffentlicht.
 * Alle Beispiele erscheinen mit "MUSTER" und sind kein Kauf- oder Reservierungsangebot.
 * Die bekannten Ortsnamen sind real; Musterbilder kennzeichnen Stimmung, nicht das Gebäude.
 */
export const VORSCHAU_HINWEIS='Vorschau mit Musterinhalten. Termine, Angebote und Beiträge sind Beispiele, nicht buchbar.';
export const BILD_HINWEIS='Stimmungsbild';

// Jede URL verweist auf ein atmosphärisches Motiv. Nicht als Abbildung des Orts ausgeben.
export const bilder={
 skyline:'https://images.unsplash.com/photo-1775127493662-2e0fb1138b9c?auto=format&fit=crop&w=1100&q=80',
 frankfurt:'https://images.unsplash.com/photo-1661503847943-c6bb6a0101aa?auto=format&fit=crop&w=1100&q=80',
 museum:'https://www.staedelmuseum.de/files/images/_trans/03-Ueber-das-Staedel/03.3-Garten/_image_hd/2022_StaedelGarten_Aussenansicht_13.jpg',
 natur:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1100&q=80',
 speisen:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1100&q=80',
 kaffe:'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1100&q=80',
 veranstaltung:'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1100&q=80',
 kultur:'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1100&q=80',
 sonne:'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1100&q=80',
 markt:'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1100&q=80'
};
export type VorschauOrt={
 id:string;name:string;category:string;district:string;address:string;
 latitude:number|null;longitude:number|null;description_de:string;description_en:string;
 website:string|null;source_url:string|null;image_url:string|null;demo:true
};
export const vorschauOrte:VorschauOrt[]=[
 {id:'muster-alte-oper',name:'Alte Oper',category:'Kultur',district:'Innenstadt',address:'Opernplatz, Frankfurt am Main',latitude:null,longitude:null,description_de:'Ein Abend voller Musik, Architektur und besonderer Stadtkulisse.',description_en:'',website:null,source_url:null,image_url:bilder.kultur,demo:true},
 {id:'muster-kleinmarkthalle',name:'Kleinmarkthalle',category:'Shopping',district:'Innenstadt',address:'Hasengasse 5–7, Frankfurt am Main',latitude:null,longitude:null,description_de:'Kleine Entdeckungen, frische Aromen und Genuss mitten in der Stadt.',description_en:'',website:null,source_url:null,image_url:bilder.markt,demo:true},
 {id:'muster-eiserner-steg',name:'Eiserner Steg',category:'Sehenswürdigkeiten',district:'Altstadt',address:'Eiserner Steg, Frankfurt am Main',latitude:null,longitude:null,description_de:'Ein Perspektivwechsel zwischen Fluss, Altstadt und Skyline.',description_en:'',website:null,source_url:null,image_url:bilder.frankfurt,demo:true},
 {id:'muster-grueneburgpark',name:'Grüneburgpark',category:'Natur',district:'Westend',address:'August-Siebert-Straße, Frankfurt am Main',latitude:null,longitude:null,description_de:'Durchatmen unter alten Bäumen. Ein stiller Moment im Grünen.',description_en:'',website:null,source_url:null,image_url:bilder.natur,demo:true},
 {id:'muster-berger-strasse',name:'Berger Straße',category:'Cafés',district:'Bornheim',address:'Berger Straße, Frankfurt am Main',latitude:null,longitude:null,description_de:'Bummeln, Kaffee trinken und das Viertel ganz entspannt erleben.',description_en:'',website:null,source_url:null,image_url:bilder.kaffe,demo:true},
 {id:'muster-museumsufer',name:'Museumsufer',category:'Kultur',district:'Sachsenhausen',address:'Schaumainkai, Frankfurt am Main',latitude:null,longitude:null,description_de:'Kunst, Spaziergänge und die Stadt aus einem neuen Blickwinkel.',description_en:'',website:null,source_url:null,image_url:bilder.museum,demo:true},
 {id:'muster-goetheturm',name:'Goetheturm',category:'Natur',district:'Sachsenhausen',address:'Sachsenhäuser Landwehrweg, Frankfurt am Main',latitude:null,longitude:null,description_de:'Waldluft, weite Blicke und ein kleines Abenteuer vor der Haustür.',description_en:'',website:null,source_url:null,image_url:bilder.sonne,demo:true},
 {id:'muster-bethmannpark',name:'Bethmannpark',category:'Freizeit',district:'Nordend',address:'Friedberger Anlage, Frankfurt am Main',latitude:null,longitude:null,description_de:'Eine ruhige grüne Ecke für einen Spaziergang oder eine Pause.',description_en:'',website:null,source_url:null,image_url:bilder.natur,demo:true}
];
const REAL_IMAGES:Record<string,string>={
 'Römerberg':bilder.frankfurt,'Städel Museum':bilder.museum,'MAIN TOWER':bilder.skyline,'Palmengarten':bilder.natur,
 'Alte Oper':bilder.kultur,'Kleinmarkthalle':bilder.markt,'Eiserner Steg':bilder.frankfurt,
 'Grüneburgpark':bilder.natur,'Berger Straße':bilder.kaffe,'Museumsufer':bilder.museum,
 'Goetheturm':bilder.sonne,'Bethmannpark':bilder.natur
};
export function ortsbild(name:string,url?:string|null){return url||REAL_IMAGES[name]||bilder.frankfurt;}
export type VorschauVeranstaltung={
 id:string;title:string;venue:string;starts_at:string;description_de:string;description_en:string;
 ticket_url:string|null;image_url:string;demo:true
};
// Bezeichnungen und Daten sind rein illustrativ, keine tatsächlichen Termine.
export const vorschauVeranstaltungen:VorschauVeranstaltung[]=[
 {id:'muster-v1',title:'Kinoabend am Main',venue:'Am Mainufer · Beispielort',starts_at:'2026-10-23T19:30:00+02:00',description_de:'Ein Filmabend mit Blick auf den Fluss, draußen unter freiem Himmel.',description_en:'',ticket_url:null,image_url:bilder.sonne,demo:true},
 {id:'muster-v2',title:'Musik im Nordend',venue:'Nordend · Beispielort',starts_at:'2026-10-25T18:00:00+01:00',description_de:'Ein gemütlicher Abend mit Musik und guten Gesprächen.',description_en:'',ticket_url:null,image_url:bilder.kultur,demo:true},
 {id:'muster-v3',title:'Kunst und Kaffee',venue:'Sachsenhausen · Beispielort',starts_at:'2026-10-29T15:00:00+01:00',description_de:'Ein Spaziergang durch Kunst, kleine Galerien und Lieblingscafés.',description_en:'',ticket_url:null,image_url:bilder.museum,demo:true},
 {id:'muster-v4',title:'Herbstmarkt im Viertel',venue:'Bornheim · Beispielort',starts_at:'2026-11-01T11:00:00+01:00',description_de:'Regionale Köstlichkeiten und herbstliche Inspirationen.',description_en:'',ticket_url:null,image_url:bilder.markt,demo:true}
];
export type VorschauBeitrag={id:string;title:string;body_de:string;body_en:string;source_url:string|null;published_at:string;image_url:string;demo:true};
export const vorschauBeitraege:VorschauBeitrag[]=[
 {id:'muster-n1',title:'Frankfurt, wenn die Lichter angehen',body_de:'Drei Stadtspaziergänge für die goldene Stunde – von der Altstadt bis ans Wasser.',body_en:'',source_url:null,published_at:'2026-10-16T13:00:00+02:00',image_url:bilder.skyline,demo:true},
 {id:'muster-n2',title:'Ein Sonntag ohne Eile',body_de:'Ruhige Wege, grüne Ecken und Orte für eine kleine Auszeit.',body_en:'',source_url:null,published_at:'2026-10-15T12:00:00+02:00',image_url:bilder.natur,demo:true},
 {id:'muster-n3',title:'Ein Streifzug durch Bornheim',body_de:'Ein Viertel voller kleiner Cafés, alter Fassaden und neuer Perspektiven.',body_en:'',source_url:null,published_at:'2026-10-14T11:00:00+02:00',image_url:bilder.kaffe,demo:true},
 {id:'muster-n4',title:'Kultur am Fluss',body_de:'Am Museumsufer gibt es immer wieder etwas zu entdecken.',body_en:'',source_url:null,published_at:'2026-10-13T10:00:00+02:00',image_url:bilder.museum,demo:true}
];
export type VorschauPost={id:string;body:string;created_at:string;display_name:string;place_name:string|null;image_url:string;demo:true};
export const vorschauPosts:VorschauPost[]=[
 {id:'muster-p1',body:'Mein liebster Feierabendmoment: einfach an den Main setzen und die Stadt beobachten. Was ist euer Lieblingsplatz?',created_at:'2026-10-16T18:00:00+02:00',display_name:'Mara B. · Musterprofil',place_name:'Mainufer',image_url:bilder.skyline,demo:true},
 {id:'muster-p2',body:'Kaffee, ein gutes Buch und ein langer Spaziergang durch Bornheim. Mehr braucht ein Sonntag manchmal nicht.',created_at:'2026-10-15T11:00:00+02:00',display_name:'Jonas K. · Musterprofil',place_name:'Bornheim',image_url:bilder.kaffe,demo:true},
 {id:'muster-p3',body:'Heute mal bewusst einen anderen Weg genommen. So viele schöne Ecken entdeckt!',created_at:'2026-10-14T16:00:00+02:00',display_name:'Lea M. · Musterprofil',place_name:'Nordend',image_url:bilder.frankfurt,demo:true},
 {id:'muster-p4',body:'Ein Nachmittag im Grünen macht die Woche gleich ein bisschen leichter.',created_at:'2026-10-13T14:00:00+02:00',display_name:'Nina R. · Musterprofil',place_name:'Grüneburgpark',image_url:bilder.natur,demo:true}
];
export type VorschauAngebot={id:string;title:string;details:string;business_name:string;image_url:string;demo:true};
export const vorschauAngebote:VorschauAngebot[]=[
 {id:'muster-a1',title:'Kaffee und Gebäck zum Kennenlernpreis',details:'Nur ein Beispiel für eine mögliche lokale Aktion. Nicht erhältlich.',business_name:'Beispielcafé im Nordend',image_url:bilder.kaffe,demo:true},
 {id:'muster-a2',title:'Eine kleine Auszeit im Viertel',details:'Musterangebot für eine Wohlfühlaktion. Kein echter Rabatt.',business_name:'Beispielbetrieb in Bornheim',image_url:bilder.natur,demo:true},
 {id:'muster-a3',title:'Genuss zu zweit',details:'So könnten kulinarische Angebote dargestellt werden. Keine Einlösung möglich.',business_name:'Beispielrestaurant in Sachsenhausen',image_url:bilder.speisen,demo:true}
];
