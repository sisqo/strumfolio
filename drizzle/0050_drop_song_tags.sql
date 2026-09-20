-- Le etichette tornano a casa nel tracciato.
--
-- `{tag:}` è un campo del formato — singolare e ripetibile, una riga per etichetta — e
-- quest'app ne teneva una seconda copia in colonna. Due case per un valore sono due case che
-- possono dire cose diverse, ed è la stessa ragione per cui il tempo, il capotasto e la
-- tonalità vivono solo nel corpo. Da qui in poi le legge `parseChordPro`, come loro.
--
-- **Il riempimento viene prima della caduta, e senza di lui questa migrazione cancella dei
-- dati.** Su 224 canzoni in produzione 111 hanno etichette: 108 le hanno già scritte nel
-- corpo, 3 soltanto in colonna. Quelle 3 sono state importate mentre `{tag:}` assegnava
-- invece di accumulare, quindi la riga è finita in colonna e tolta dal testo; senza questa
-- UPDATE la colonna se le porterebbe via.
--
-- In testa e non in coda: un'etichetta è intestazione, e il corpo di una canzone comincia
-- con le sue direttive.
UPDATE "songs"
SET "body" = (
      SELECT string_agg('{tag: ' || t || '}', E'\n')
      FROM unnest("tags") AS t
    ) || E'\n' || "body"
WHERE array_length("tags", 1) > 0
  AND "body" !~ '\{\s*tags?\s*[:}]';

ALTER TABLE "songs" DROP COLUMN IF EXISTS "tags";
