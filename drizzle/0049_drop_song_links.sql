-- I tre link che una canzone poteva portarsi dietro.
--
-- Erano un campo nostro e non del formato: il cheat sheet ChordPro non ha un link, e questa
-- app li scriveva come `{link1:}`…`{link3:}`, direttive che nessun altro programma legge.
-- Tolti il 2026-09-20 per stare su quello che il formato prevede, e con loro se ne vanno le
-- grafie `{x_link1..3}` che leggevamo in entrata.
--
-- **Quanto costa, misurato prima di scrivere questa riga:** su 224 canzoni in produzione ne
-- usava un link una sola, e nessuna usava il secondo o il terzo. L'unico valore è stato
-- riportato a chi possiede l'archivio prima della rimozione, perché una colonna che si
-- lascia cadere non torna.
--
-- Il commento che queste colonne portavano spiegava perché fossero tre e non un array: un
-- buco fra la prima e la terza doveva restare un fatto su *quale* fosse vuota. Il
-- ragionamento era giusto e non è quello che è cambiato — è cambiato che il campo non c'è più.
ALTER TABLE "songs" DROP COLUMN IF EXISTS "link1";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "link2";
ALTER TABLE "songs" DROP COLUMN IF EXISTS "link3";
