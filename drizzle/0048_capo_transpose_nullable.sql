-- Il capotasto e la trasposizione che il *brano* dichiara, e quelli che il *lettore* sceglie.
--
-- `0043_metronome.sql` ha argomentato il contrario di questo, e allora aveva ragione: diceva
-- che `capo` poteva restare `NOT NULL DEFAULT 0` perché ogni riga già esistente rispondeva da
-- sé — nessuno aveva il capotasto messo — mentre un tempo no, perché zero non è un metronomo
-- lento. Quel ragionamento reggeva finché `{capo: 3}` veniva letto e buttato via.
--
-- Da quando il tracciato può dichiararlo non regge più. Con `DEFAULT 0` la colonna dice la
-- stessa cosa per due lettori diversi: «non ho il capotasto» e «non ho mai scelto». Se il file
-- dà il valore iniziale dove la colonna legge 0, lo mette a chi se l'era tolto apposta — cioè
-- proprio la cosa che il commento del 0043 diceva di voler evitare per il tempo, in direzione
-- opposta. Lo stesso vale per `semitones` e per `{transpose: 2}`.
--
-- Quindi NULL vuol dire «prendo quello del brano», esattamente come per `bpm`, e le due
-- colonne perdono anche il DEFAULT: una riga nuova deve nascere senza opinione, non con lo
-- zero di qualcun altro.
ALTER TABLE "user_song_prefs" ALTER COLUMN "capo" DROP NOT NULL;
ALTER TABLE "user_song_prefs" ALTER COLUMN "capo" DROP DEFAULT;
ALTER TABLE "user_song_prefs" ALTER COLUMN "semitones" DROP NOT NULL;
ALTER TABLE "user_song_prefs" ALTER COLUMN "semitones" DROP DEFAULT;

-- Il backfill, e il motivo per cui non può distruggere una scelta di nessuno: fino a oggi
-- `{capo:}` e `{transpose:}` venivano scartati, quindi non esiste un lettore che abbia scelto
-- lo zero *contro* un valore dichiarato dal brano. I due stati sono indistinguibili adesso, ed
-- è l'ultimo momento in cui lo sono: da qui in avanti uno zero è una scelta.
UPDATE "user_song_prefs" SET "capo" = NULL WHERE "capo" = 0;
UPDATE "user_song_prefs" SET "semitones" = NULL WHERE "semitones" = 0;
