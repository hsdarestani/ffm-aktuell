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
