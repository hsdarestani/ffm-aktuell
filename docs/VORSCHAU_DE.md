# FFM Aktuell – Bildstarke deutsche Vorschau

## Ziel
Die vorliegende Version zeigt den Produktumfang auf Deutsch, mit glaubwürdigen, sorgfältig komponierten Oberflächen statt leerer Bereiche.

## Vorgaben und Verhalten
- Alle öffentlich sichtbaren Menüs, Rubriküberschriften, Handlungsaufforderungen und Systemfehlermeldungen erscheinen auf Deutsch. Die Sprachumschaltung ist vorläufig ausgeblendet. Markennamen wie FFM Aktuell und OpenStreetMap bleiben unverändert.
- **Die Redaktion veröffentlicht keine erfundenen Informationen.** Die Datei `lib/vorschau.ts` enthält ausschließlich clientseitig dargestellte Illustrationsdaten, die nicht mit PostgreSQL oder den bestehenden API-Daten vermischt und nicht in Tabellen gespeichert werden.
- Eine globale Kennzeichnung „VORSCHAU“ und örtliche Kennzeichnungen wie „Musterort“, „Musterveranstaltung – nicht buchbar“, „Musterbeitrag – erfundenes Profil“ oder „Musterangebot – nicht einlösbar“ machen das kenntlich.
- Für bekannte tatsächliche Frankfurter Orte existiert ein teilweise verifizierter Basisbestand aus der Datenbank. Einträge aus der Beispieldatei stellen **nicht** zusätzliche geprüfte Veröffentlichungen dar und erscheinen nicht als Pins in der 3D-Karte (Koordinaten im Musterkatalog sind null).
- Bei Bildern, die nicht die dargestellte Immobilie oder Veranstaltung abbilden, steht sichtbar „Stimmungsbild“. Sie sind keine Bestätigung des dargestellten Orts. Beispielbilder stammen überwiegend von Unsplash und werden bis zur Freigabe der Bildrechte nicht als offizielle Ortsfotografie präsentiert.
- Keine Anmeldung oder Zahlungsfähigkeit wird für Beispielveranstaltungen und Musterangebote behauptet. Musterorte lassen sich nicht als echte Favoriten in die Datenbank schreiben.
- Tatsächlich redaktionell freigegebene Daten aus dem API werden weiterhin normal angezeigt, einschließlich Kartenpins.

## Neu gestaltete Ansichten
1. **Startseite:** 3D-Atlas bleibt erhalten, darunter bebilderte Stadtentdeckungen, deutsche Stadtnotizen und Veranstaltungen, sowie lokaler Austausch.
2. **Entdecken:** große, atmosphärische Bildkarten mit Ort, Stadtteil, kurzer Beschreibung, Quellen-/Demokennzeichnung.
3. **Veranstaltungen:** bebilderte Termine, Redaktionsgeschichten und Beispielangebote.
4. **Miteinander:** eigenständiges soziales Layout mit Musterprofilen, Bildern, Beiträgen sowie echter Moderationsfunktion für angemeldete Nutzer.
5. **Für Unternehmen:** bestehendes Echt-Business-Formular bleibt bestehen; ergänzend drei optisch gestaltete, als Muster markierte Angebotskarten.
6. **Karte:** behält den echten MapLibre-3D-Atlas mit quellengebundenen veröffentlichten Pins und deutschem Bedienkonzept.

## Dateien
- `lib/vorschau.ts` – deutsche Beispieldatensätze und atmosphärische Bildreferenzen
- `app/page.tsx` – deutscher Produktfluss, echte API-Daten mit klar markierten Vorschauinhalten für reine Lesebereiche
- `components/AtlasHome.tsx` – Fotokarten und Redaktionsbereich
- `app/vorschau.css` – bildorientierte visuelle Identität, Mobile-Layout und Animationen
- `app/atlas/page.tsx` – eigenständiger Stadtatlas auf Deutsch
- `tests/vorschau.test.mjs` – Test für Kennzeichnung, Deutschsprachigkeit und Datenintegrität

## Grenzen
Vor der öffentlichen Vermarktung benötigen Termine, Angebote und Community-Inhalte eine echte redaktionelle Freigabe. Der Vorschau-Layer muss dann entfernt oder gezielt auf einem Demo-System gehalten werden. Für Bildmaterial soll vor Produktionsfreigabe eine finale lizenzrechtliche Prüfung und gegebenenfalls eigenes Fotoarchiv etabliert werden. Der API-Backend-Fehlerkanal wird im deutschen Besucher-Frontend verständlich übersetzt, verändert jedoch keine internen API-Antworten.
