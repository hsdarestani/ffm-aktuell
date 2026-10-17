# FFM Aktuell — Datengrundlage, geprüfte Orte & realistische Karte

## Was aktuell wirklich in der App steht
- Der ursprüngliche redaktionelle DB-Bestand umfasst nur vier Sehenswürdigkeiten (Römerberg, Städel, MAIN TOWER, Palmengarten), mit Quellenlinks. Ein Quellenlink ist **keine** aktuelle Betriebs- oder Öffnungsbestätigung.
- Der vorige V3-Vorschaukatalog in \`lib/vorschau.ts\` enthält ausdrücklich **Musterinhalte** und Stimmungsbilder. Diese dürfen nie als geprüfte Empfehlung erscheinen und werden nicht als echte geographische Pins verwendet.
- Neu: Die öffentliche Oberfläche unterscheidet **„Betriebsstatus nicht aktuell geprüft“**, „Betrieb kürzlich überprüft“, vorübergehend/dauerhaft geschlossen, und Musterort.

## Kategorien
Cafés; Bars; Nachtclubs; Shishabars; Restaurants; Imbiss; Frühstück & Brunch; Museen und Kunst; Sehenswürdigkeiten; Natur und Parks; Fußball; Padel; weitere Sportarten; Laufgruppen; Spaziergruppen; Lesegruppen; Freizeit; Entspannung; Einkaufen; Familie; Kostenlos.

Ein **Club oder Verein** ist nicht notwendig ein festes POI: eine Lauf- oder Lesegruppe bekommt zukünftig ein eigenes Profil, Organisator, Treffpunkt, Rhythmus und Quellnachweis. Die vier derzeitigen Gruppenbeispiele sind ausdrücklich fiktiv.

## Daten-Pipeline (rechtlich und qualitativ sauber)
1. **Kandidaten finden:** OpenStreetMap / Overpass für Orte, Sportplätze, Gastronomie und Museen. \`node scripts/osm-kandidaten.mjs\` erzeugt eine JSON-Datei mit OSM-Verweisen, Tags, Öffnungszeiten und ggf. \`check_date\`. Adressen bleiben Kandidaten. Der Import schreibt ausdrücklich **keine** Zeilen in die Produkt-DB.
2. **Laufend Betrieb überprüfen:** eigene Betreiberwebsite und Kontakt / offizieller Veranstaltungskalender, bei Bedarf manuelle Nachfrage. \`check_date\` und \`opening_hours\` aus OSM sind Hinweise und allein keine Bestätigung. Lebenszyklus-Tags wie \`shop=vacant\`, \`disused:*\` und \`opening_hours=closed\` werden bereits beim Kandidatenimport aussortiert.
3. **Redaktionelle Freigabe:** ein Admin wählt einen veröffentlichten Ort, setzt \`activity_status\` und eine obligatorische offizielle \`verification_source\` (HTTPS), bestätigt die Prüfung und speichert \`verified_at\`. \`POST /api/admin/verify-place\`. Unklare Fälle können über \`/api/admin/dispute-place\` als zweifelhaft markiert werden; Auditlog bleibt erhalten.
4. **„Nur aktuell geprüfte Betriebe“:** nur Veröffentlichungen mit \`verification_status=verified\`, \`activity_status=operating\`, \`verified_at\` nicht älter als 30 Tage und ohne \`demo\`. Nach 30 Tagen fällt ein Betrieb automatisch zurück in die nicht-aktuell-geprüfte Ansicht, ohne die ursprüngliche Bestandsinformation zu löschen.
5. **Empfehlungen:** \`GET /api/places?mode=top\` fordert zusätzlich redaktionelle Priorität >0. Ohne überprüfte aktive Kandidaten liefert diese Liste **0** Ergebnisse statt erfundener „Bester“-Rankings. Ein eigenes Ratingsystem muss vor Produktstart dokumentiert und mit echten quantitativen Daten betrieben werden.
6. **„Jetzt geöffnet“:** nicht automatisch anzeigen! Betrieb dauerhaft aktiv ≠ aktuell geöffnet. Für echtes „jetzt“ benötigt FFM aktuelle Öffnungszeiten einschließlich Feiertagsausnahmen und entsprechende regelmäßige Überprüfung/Vertragsquelle. Eine gespeicherte Zeile mit Öffnungszeiten-Text ist keine Live-Bestätigung.

### Google Places und MapLibre
Google Places New hat \`businessStatus\`, \`currentOpeningHours.openNow\`, \`rating\`, \`userRatingCount\`, jedoch **verbieten die Google Maps Platform Terms die Verwendung gewöhnlicher Places-API-Inhalte auf Nicht-Google-Karten**, auch wenn die API ohne Karte einsetzbar ist. Google Places UI Kit hat speziell definierte Ausnahmen, ist aber keine generelle Erlaubnis zum Import der Places-Daten als unsere MapLibre-Pins. Deshalb wurde keine Google-Places-Datenbankkopie, kein verstecktes Crawling und keine Google-Bewertung eingebaut.
Quellen: https://cloud.google.com/maps-platform/terms/maps-service-terms, https://developers.google.com/maps/documentation/places/web-service/policies, https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places

## Realistische Karte
- Neu: Zwischen **„Stadtplan“ und „Luftbild“** wechseln. „Luftbild“ nutzt ein amtliches Luftbild von Hessen (ATKIS DOP20, ca. 20 cm Bodenauflösung), WMS \`he_dop_rgb\` von Hessischer Verwaltung für Bodenmanagement und Geoinformation. Lizenz: **Datenlizenz Deutschland Zero 2.0**, kommerziell verwendbar, behördliche Quellenangabe bleibt im Kartenrand.
- Quelle: https://opendata.hessen.de/de/dataset/atkis-dop-20, WMS: https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows?language=ger&SERVICE=WMS&REQUEST=GetCapabilities
- Das Luftbild ist echte Fotografie aus der Luft, jedoch keine aktuelle Live-Aufnahme, und ist **2D**. Eine wirklich fototexturierte interaktive 3D-Welt erfordert 3D-Meshes, kompatiblen Renderer, Lizenz / Nutzungsbudget und mobile GPU-Tests. Die jetzigen 3D-Bauklötze sind weiterhin OSM-Extrusionen.
- Bei WMS-Fehlern zurück zum vorhandenen Stadtplan; vor breiter Skalierung Nutzungsfrequenz, CORS, WMS-Verfügbarkeit und Browser-QA prüfen.

## Was vom Frankfurtleben-Ansatz nützlich ist
Laut App Store beschreibt Frankfurtleben eine persönliche Café-/Bar-/Nightlife-Auswahl, Tages- und Monatsveranstaltungen sowie Live-Eventkarte, eine Anzeige von nächtlichen Veranstaltungen bis 5 Uhr und einen Frage-basierten Empfehlungsfinder (Matcher). Für FFM geeignet:
- ein verständlicher „Was möchtest du heute machen?“-Dialog ohne lange Texte;
- echte Abend-/Nachtfenster (Betriebszeiten und tatsächliche Event-Endzeit statt Datumssprung um Mitternacht);
- persönliche, nachvollziehbar begründete Empfehlungen;
- Treff- und Interessengruppen mit verantwortlichem Betreiber / Veranstalter, Quelle und regelmäßiger Überprüfung.

Der App-Store-Eintrag belegt Selbstdarstellung, keine vollständige Funktionsprüfung oder Datenqualität. Nicht einfach Quellcode, Texte, Designs oder Daten der Konkurrenz übernehmen.
https://apps.apple.com/de/app/frankfurtleben/id6761617157

## Betrieb und Kosten
- Das separate PostgreSQL-Deploy führt \`db/schema.sql\` idempotent erneut aus, dadurch werden die neuen Prüffelder auf STRATO ohne Löschen vorhandener Daten ergänzt.
- Keine externe Places-Bezahlschnittstelle oder gekaufter Satellitendienst erforderlich. Der WMS-Abruf ist öffentlich; dennoch Monitor für Erreichbarkeit und CDN/WMS-Limits einplanen.
- Für die spätere automatisierte Revalidierung offizielle Datenpartnerschaften und ein angemessenes Abrufintervall vereinbaren. Kein „Live“-Label für alte OSM-Angaben.
