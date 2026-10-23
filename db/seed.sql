-- Editorial catalogue: permanent public attractions, not live business availability.
-- Sources: official Frankfurt tourism and the museum's official contact page.
INSERT INTO places (name,category,district,description_de,description_en,address,latitude,longitude,website,source_url,status)
SELECT * FROM (VALUES
 ('Römerberg','Sehenswürdigkeiten','Altstadt','Historischer Platz im Herzen Frankfurts.','Historic square in the heart of Frankfurt.','Römerberg 23, 60311 Frankfurt am Main',50.1106,8.6822,'https://www.visitfrankfurt.travel/','https://www.visitfrankfurt.travel/en/experience/discover/architecture','published'),
 ('Städel Museum','Kultur','Sachsenhausen','Museum mit einer bedeutenden Sammlung europäischer Kunst.','Art museum with an important European collection.','Schaumainkai 63, 60596 Frankfurt am Main',50.1034,8.6734,'https://www.staedelmuseum.de/','https://www.staedelmuseum.de/en/contact','published'),
 ('MAIN TOWER','Sehenswürdigkeiten','Innenstadt','Aussicht über die Frankfurter Skyline.','Views across the Frankfurt skyline.','Neue Mainzer Straße 52-58, 60311 Frankfurt am Main',50.1145,8.6723,'https://www.maintower.de/','https://www.visitfrankfurt.travel/en/experience/attractions','published'),
 ('Palmengarten','Natur','Westend','Botanischer Garten und grüne Oase in der Stadt.','Botanical gardens and a green oasis in the city.','Siesmayerstraße 61, 60323 Frankfurt am Main',50.1232,8.6577,'https://www.palmengarten.de/','https://www.visitfrankfurt.travel/en/experience/discover/All','published')
) AS s(name,category,district,description_de,description_en,address,latitude,longitude,website,source_url,status)
WHERE NOT EXISTS(SELECT 1 FROM places p WHERE p.name=s.name);

-- Hand-checked factual starter set, 20 Oct 2026. Never override an editor's
-- existing hours. 'Published' is not 'operating' or 'freshly verified'.
-- Sources are official operators and Frankfurt's tourism authority.
UPDATE places SET opening_hours_text='Di, Mi, Fr–So 10–18 Uhr; Do 10–21 Uhr; Mo geschlossen. Feiertage und Sonderöffnungen siehe Website.',
 source_url='https://www.staedelmuseum.de/de/besuch',updated_at=now()
 WHERE name='Städel Museum' AND business_id IS NULL AND website LIKE '%staedelmuseum.de%'
 AND status='published' AND nullif(btrim(coalesce(opening_hours_text,'')),'') IS NULL;
UPDATE places SET opening_hours_text='März–Oktober täglich 9–19 Uhr; November–Februar täglich 9–16 Uhr. Geschlossen 24.12. und 31.12.; Wetteränderungen möglich.',
 source_url='https://www.palmengarten.de/de/ihr-besuch/palmengarten.html',updated_at=now()
 WHERE name='Palmengarten' AND business_id IS NULL AND website LIKE '%palmengarten.de%'
 AND status='published' AND nullif(btrim(coalesce(opening_hours_text,'')),'') IS NULL;
UPDATE places SET opening_hours_text='Aussichtsplattform: Sommer So–Do 10–21, Fr/Sa 10–23 Uhr; Winter So–Do 10–19, Fr/Sa 10–21 Uhr. Wetterbedingt Änderungen; letzte Auffahrt 45 Min. vor Schließung.',
 source_url='https://www.maintower.de/eintrittspreise-oeffnungszeiten/',updated_at=now()
 WHERE name='MAIN TOWER' AND business_id IS NULL AND website LIKE '%maintower.de%'
 AND status='published' AND nullif(btrim(coalesce(opening_hours_text,'')),'') IS NULL;
-- Römerberg is a public square, not a venue with substantiated business hours.
-- A tourist-office schedule must never be misattributed to the square itself.
INSERT INTO place_field_evidence(place_id,field,source_url,source_type,checked_at,statement)
SELECT id,'identity','https://www.visitfrankfurt.travel/poi/roemerberg-mit-ostzeile',
 'tourism_office','2026-10-20T09:00:00Z','Historic public square in Frankfurt Altstadt; no business opening hours inferred.'
FROM places WHERE name='Römerberg' AND business_id IS NULL AND status='published'
ON CONFLICT(place_id,field) DO NOTHING;
INSERT INTO place_field_evidence(place_id,field,source_url,source_type,checked_at,statement)
SELECT id,'opening_hours','https://www.staedelmuseum.de/de/besuch',
 'official','2026-10-20T09:00:00Z','Regular museum opening hours. Official holiday exceptions must be checked before visiting.'
FROM places WHERE name='Städel Museum' AND business_id IS NULL AND status='published'
ON CONFLICT(place_id,field) DO NOTHING;
INSERT INTO place_field_evidence(place_id,field,source_url,source_type,checked_at,statement)
SELECT id,'opening_hours','https://www.palmengarten.de/de/ihr-besuch/palmengarten.html',
 'official','2026-10-20T09:00:00Z','Seasonal garden ticket-office schedule; exceptions or closures are not live checked.'
FROM places WHERE name='Palmengarten' AND business_id IS NULL AND status='published'
ON CONFLICT(place_id,field) DO NOTHING;
INSERT INTO place_field_evidence(place_id,field,source_url,source_type,checked_at,statement)
SELECT id,'opening_hours','https://www.maintower.de/eintrittspreise-oeffnungszeiten/',
 'official','2026-10-20T09:00:00Z','Seasonal observation-platform opening hours; closure possible during severe weather.'
FROM places WHERE name='MAIN TOWER' AND business_id IS NULL AND status='published'
ON CONFLICT(place_id,field) DO NOTHING;
