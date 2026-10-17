# FFM Aktuell: Betreiberprüfung und Datenfreigabe

## Was bereits vorhanden ist
- Georeferenzierte OpenStreetMap Kandidaten (3.967 aus dem ersten Extrakt, später 185 Apotheken aus der hessischen Geofabrik Quelle). Die Zahl ist ein **Quellbestand**, keine Zahl bestätigter laufender Betriebe und nicht unbedingt die derzeitige Zahl der Produktionsdatenbank.
- In `discovery_candidates` bleiben Herkunft, OSM ID und bereits bekannte Öffnungszeiten sichtbar. Keine der Angaben wird automatisch als „aktuell geöffnet“ gewertet.
- Die eigenständigen kuratierten `places` sind für redaktionelle Empfehlungen zuständig.
- Neue geschützte Redaktion in „Redaktion & Moderation“ mit Kandidatenliste, Originalquellen, Rückfragen und dokumentierter Freigabe.

## Pflichtprüfung je Betrieb vor Freigabe
1. Originalen OSM Eintrag ansehen: Name, Koordinaten, Standort, Kategorie und ggf. Doppelbelegung.
2. **Unabhängigen aktuellen Nachweis** prüfen, bevorzugt Betreiberwebseite, direkte Betreiberkommunikation oder eine aktuelle behördliche Veröffentlichung. OSM, ein Suchtreffer, Bewertungen und bloße Existenz einer URL reichen nicht.
3. Name, Standort, Adresse und den **tatsächlichen aktuellen Betrieb** als drei getrennte Ja Entscheidungen bestätigen. Ggf. Betreiber vor Ort oder telefonisch kontaktieren.
4. Einen HTTPS Link zur primären Belegquelle und ein aussagekräftiges Prüfprotokoll (Prüfdatum, Kontaktart, Erkenntnis, mögliche Unsicherheit) speichern. Bei rein telefonischer Rücksprache muss ein zusätzlicher überprüfbarer Link zur Organisation vorhanden sein.
5. Optional die **vom Betreiber bestätigten** regulären Öffnungszeiten eintragen, ohne diese als Echtzeit zu kennzeichnen. Saisonzeiten und Feiertage sind nicht abgedeckt.
6. Dubletten über OSM ID und Namens plus Koordinatennähe blockieren. Bei Konflikt bestehenden Ort prüfen, nicht denselben Betrieb nochmals veröffentlichen.
7. Erst danach redaktionellen Rang setzen. Das ist eine redaktionelle Auswahl, keine erfundene Google Bewertung.

## Regeln des Systems
- `POST /api/admin/review-candidate` veröffentlicht einen Kandidaten nur nach einem positiven, signierten Admin Review mit dem unabhängigen Beleg und drei expliziten Bestätigungen. Die Aktion läuft in einer PostgreSQL Transaktion, protokolliert den Vorgang und blendet den rohen OSM Kandidaten aus.
- `GET /api/admin/candidates` hat eine seitenweise Liste mit getrenntem Status `unverified` / `needs_review`.
- `GET /api/admin/validation` zeigt Anzahl von offenen Prüfungen und bereits überfälligen Bestandsorten.
- `POST /api/admin/verify-place` verlangt ebenso Prüfprotokoll, Prüfmethode und Bestätigung.
- Eine Betriebsprüfung gilt **30 Tage** für den Filter „aktuell geprüft“. Danach fällt ein Ort automatisch aus „Nur geprüfte“ und „Beste“ heraus, bleibt aber als historischer Ort auffindbar.
- Kein „jetzt offen“ ohne explizit bestätigten Betriebskalender inklusive Feiertagen und kurzfristiger Ausnahmen. Die Apotheken Notdienst Suche ist separat und verweist auf die offizielle aponet Suche.

## Was noch extern beschafft werden muss
- Redaktionelle Primärnachweise für jeden zu bestätigenden Betrieb. Keine bezahlte API ist zwingend, aber für 4.000+ Einträge ist ein menschlicher Review Aufwand erheblich.
- Aktive Kooperationen mit Betreibern oder eine lizenzkonforme strukturierte Öffnungszeiten Quelle, inklusive Aktualisierungen und Sonderöffnungszeiten.
- Für Gruppen und Vereine: Organisator, erreichbare Originalseite, reales Treffen, Treffpunkt, Rhythmus, aktuelle Kontaktmöglichkeit und Datum der letzten Bestätigung.
- Für eine echte „jetzt offen“ Kennzeichnung: normierte Öffnungszeiten je Ort, lokale Zeitzone, Feiertagskalender Hessen, einzelne Ausnahmen und eine definierte Aktualitätsgrenze mit revalidierter Quelle.
- Vor breitem Release: produktive Postgres Migration auf STRATO, Admin Zugang, E2E und Lasttest, GPU Screenshot der LoD2 Geometrie, dokumentierte OpenStreetMap / Landesdaten Attribution und Datenschutzprüfung.

## Start und Rollout
Deployment zuerst über CI prüfen: `npm test`, `npm run typecheck`, `npm run build`.
Vor Produktivübernahme `db/schema.sql` ausführen und sicherstellen, dass die Quelle `data/osm-discovery.sql` und die Geofabrik Apothekenimporte schon angewandt wurden. Datenschutz und Backups vorher prüfen.
Nach Deployment mit Admin anmelden, Menü Redaktion öffnen. OSM Orte manuell mit Quellen freigeben. Unter `/api/admin/validation` ist der Rückstand einsehbar. Keine automatische Massenfreigabe.
