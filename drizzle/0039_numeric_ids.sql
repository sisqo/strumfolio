-- Chiavi surrogate numeriche, e foreign key che le usano.
--
-- Una migrazione, una transazione. Trasforma diciannove tabelle da «identificate da un'email o
-- da uno slug» a «identificate da un intero», **senza togliere né l'email né lo slug**: quelli
-- restano come chiave naturale unica, perché l'email è come si accede e lo slug è nell'URL — e
-- perché un `.chopro` letto da `content/` non ha altro che il suo slug (vedi `data/files.ts`).
--
-- Il piano completo, con le ragioni, è in `PLAN-numeric-ids.md`. Qui restano solo le tre cose
-- che servono a chi legge questo file da un console SQL:
--
-- 1. È **una** transazione. Se qualcosa fallisce non cambia niente, e il `SET NOT NULL` su ogni
--    colonna nuova è il controllo: una riga figlia che riferisce un'email inesistente lascia un
--    NULL e fa fallire tutto, che è il modo giusto di scoprirlo.
-- 2. Il `DOWN` è il file accanto, `0039_numeric_ids.down.sql`: scritto, e da incollare così
--    com'è. Ricostruisce le email **da `account_id`**, cosa che funziona solo perché `accounts`
--    conserva entrambe le chiavi — se l'email fosse sparita da lì, questa sarebbe di sola andata.
-- 3. Quattro tabelle restano chiavate a email e non è una dimenticanza: `credentials`,
--    `password_reset_tokens`, `sign_ins`, `pending_registrations`. La ragione è una sola per
--    tutte e quattro — **un global owner non ha una riga in `accounts`** (v3.1), e `sign_ins`
--    viene scritta da `signIn` in `auth.ts` *prima* che `provisionAccount` crei quella riga. Una
--    foreign key lì romperebbe l'accesso, non lo irrobustirebbe.

-- ---------------------------------------------------------------------------------------------
-- 1. Le chiavi surrogate sulle tabelle padre.
--    `serial` riempie da sé le righe che ci sono già; nessun backfill da scrivere.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "accounts" ADD COLUMN "id" serial;
--> statement-breakpoint
ALTER TABLE "songbooks" ADD COLUMN "id" serial;
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "id" serial;
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD COLUMN "id" serial;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 2. Le colonne nuove sulle tabelle figlie, e il backfill per join.
--    Tutte nullable in questo passo: il vincolo arriva al punto 5, dopo il riempimento.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks" ADD COLUMN "account_id" integer;
--> statement-breakpoint
UPDATE "songbooks" c SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = c."account_owner_email";
--> statement-breakpoint

ALTER TABLE "user_prefs" ADD COLUMN "account_id" integer;
--> statement-breakpoint
UPDATE "user_prefs" p SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = p."user_email";
--> statement-breakpoint

ALTER TABLE "newsletter_prefs" ADD COLUMN "account_id" integer;
--> statement-breakpoint
UPDATE "newsletter_prefs" n SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = n."owner_email";
--> statement-breakpoint

ALTER TABLE "user_song_prefs" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD COLUMN "song_id" integer;
--> statement-breakpoint
UPDATE "user_song_prefs" p SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = p."user_email";
--> statement-breakpoint
UPDATE "user_song_prefs" p SET "song_id" = s."id"
  FROM "songs" s WHERE s."slug" = p."song_slug";
--> statement-breakpoint

ALTER TABLE "user_song_comments" ADD COLUMN "account_id" integer;
--> statement-breakpoint
ALTER TABLE "user_song_comments" ADD COLUMN "song_id" integer;
--> statement-breakpoint
UPDATE "user_song_comments" c SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = c."user_email";
--> statement-breakpoint
UPDATE "user_song_comments" c SET "song_id" = s."id"
  FROM "songs" s WHERE s."slug" = c."song_slug";
--> statement-breakpoint

ALTER TABLE "sections" ADD COLUMN "songbook_id" integer;
--> statement-breakpoint
UPDATE "sections" x SET "songbook_id" = c."id"
  FROM "songbooks" c WHERE c."slug" = x."songbook_slug";
--> statement-breakpoint

ALTER TABLE "songs" ADD COLUMN "songbook_id" integer;
--> statement-breakpoint
UPDATE "songs" s SET "songbook_id" = c."id"
  FROM "songbooks" c WHERE c."slug" = s."songbook_slug";
--> statement-breakpoint

-- `broadcast_account_id` dice *di chi* è il repertorio in onda; `owner_email` resta testo perché
-- chi trasmette può essere un global owner senza riga in `accounts` (vedi l'intestazione).
ALTER TABLE "sing_along_sessions" ADD COLUMN "broadcast_account_id" integer;
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD COLUMN "current_song_id" integer;
--> statement-breakpoint
UPDATE "sing_along_sessions" t SET "broadcast_account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = t."broadcast_account_email";
--> statement-breakpoint
UPDATE "sing_along_sessions" t SET "current_song_id" = s."id"
  FROM "songs" s WHERE s."slug" = t."current_song_slug";
--> statement-breakpoint

-- Le due tabelle che finora non avevano nessuna foreign key. Nature diverse, trattamenti
-- diversi: vedi il punto 5.
ALTER TABLE "paddle_events" ADD COLUMN "account_id" integer;
--> statement-breakpoint
UPDATE "paddle_events" e SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = e."account_owner_email";
--> statement-breakpoint

ALTER TABLE "coupon_redemptions" ADD COLUMN "account_id" integer;
--> statement-breakpoint
UPDATE "coupon_redemptions" r SET "account_id" = a."id"
  FROM "accounts" a WHERE a."owner_email" = r."account_owner_email";
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 3. Via le foreign key vecchie, prima delle chiavi su cui poggiano.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks"          DROP CONSTRAINT "songbooks_account_owner_email_accounts_owner_email_fk";
--> statement-breakpoint
ALTER TABLE "user_prefs"         DROP CONSTRAINT "user_prefs_user_email_accounts_owner_email_fk";
--> statement-breakpoint
ALTER TABLE "newsletter_prefs"   DROP CONSTRAINT "newsletter_prefs_owner_email_accounts_owner_email_fk";
--> statement-breakpoint
ALTER TABLE "user_song_prefs"    DROP CONSTRAINT "user_song_prefs_user_email_accounts_owner_email_fk";
--> statement-breakpoint
ALTER TABLE "user_song_comments" DROP CONSTRAINT "user_song_comments_user_email_accounts_owner_email_fk";
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_broadcast_account_email_accounts_owner_emai";
--> statement-breakpoint

ALTER TABLE "user_song_prefs"    DROP CONSTRAINT "user_song_prefs_song_slug_songs_slug_fk";
--> statement-breakpoint
ALTER TABLE "user_song_comments" DROP CONSTRAINT "user_song_comments_song_slug_songs_slug_fk";
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_current_song_slug_songs_slug_fk";
--> statement-breakpoint

ALTER TABLE "sections" DROP CONSTRAINT "sections_songbook_slug_songbooks_slug_fk";
--> statement-breakpoint
ALTER TABLE "songs"    DROP CONSTRAINT "songs_songbook_slug_songbooks_slug_fk";
--> statement-breakpoint

-- La composita, e l'unico vincolo che esisteva solo per essere riferito da lei.
ALTER TABLE "songs"    DROP CONSTRAINT "songs_section_songbook_fk";
--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT "sections_id_songbook";
--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT "sections_songbook_name";
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 4. Le primary key cambiano posto. L'email e lo slug restano, come chiave naturale unica.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey";
--> statement-breakpoint
ALTER TABLE "accounts" ADD PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_email" UNIQUE ("owner_email");
--> statement-breakpoint

-- `canzonieri_pkey`: il nome è del battesimo italiano della tabella, non un errore.
ALTER TABLE "songbooks" DROP CONSTRAINT "canzonieri_pkey";
--> statement-breakpoint
ALTER TABLE "songbooks" ADD PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_slug" UNIQUE ("slug");
--> statement-breakpoint

ALTER TABLE "songs" DROP CONSTRAINT "songs_pkey";
--> statement-breakpoint
ALTER TABLE "songs" ADD PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_slug" UNIQUE ("slug");
--> statement-breakpoint

ALTER TABLE "user_prefs" DROP CONSTRAINT "user_prefs_pkey";
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD PRIMARY KEY ("account_id");
--> statement-breakpoint

ALTER TABLE "newsletter_prefs" DROP CONSTRAINT "newsletter_prefs_pkey";
--> statement-breakpoint
ALTER TABLE "newsletter_prefs" ADD PRIMARY KEY ("account_id");
--> statement-breakpoint

ALTER TABLE "user_song_prefs" DROP CONSTRAINT "user_song_prefs_user_email_song_slug_pk";
--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD PRIMARY KEY ("account_id", "song_id");
--> statement-breakpoint

-- Una trasmissione per persona: era implicito nella primary key, ora è un vincolo che si legge.
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_pkey";
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_owner" UNIQUE ("owner_email");
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 5. I vincoli sulle colonne nuove. Il `SET NOT NULL` è la bonifica: se il backfill ha lasciato
--    un NULL, la riga era orfana e la transazione si ferma qui senza aver cambiato niente.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks"          ALTER COLUMN "account_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_song_comments" ALTER COLUMN "account_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_song_comments" ALTER COLUMN "song_id"    SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sections"           ALTER COLUMN "songbook_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "songs"              ALTER COLUMN "songbook_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ALTER COLUMN "broadcast_account_id" SET NOT NULL;
--> statement-breakpoint


ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id");
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_song_id_fk"
  FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_song_id_fk"
  FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_id_fk"
  FOREIGN KEY ("songbook_id") REFERENCES "songbooks"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_songbook_id_fk"
  FOREIGN KEY ("songbook_id") REFERENCES "songbooks"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_broadcast_account_id_fk"
  FOREIGN KEY ("broadcast_account_id") REFERENCES "accounts"("id");
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_current_song_id_fk"
  FOREIGN KEY ("current_song_id") REFERENCES "songs"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Nullable e SET NULL come `paddle_events`, e non NOT NULL con un CASCADE: il commento di
-- `coupon_redemptions` in `schema.ts` dice perché, e vale la pena ripeterlo qui perché è
-- controintuitivo. Un cascade cancellerebbe la riscossione insieme all'account, riaprendo il
-- giro «cancello e rifaccio l'account, e riscuoto di nuovo» che oggi è chiuso proprio perché
-- questa riga sopravvive. L'email accanto è ciò che continua a chiuderlo; l'id è ciò che rende
-- la riga immune a un cambio d'indirizzo. Servono entrambe le colonne, e servono i due indici.
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- `paddle_events` è l'eccezione, ed è il ledger: nullable e SET NULL. Un evento arrivato per un
-- indirizzo il cui account è stato poi cancellato resta un fatto avvenuto, e va conservato.
ALTER TABLE "paddle_events" ADD CONSTRAINT "paddle_events_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 6. I due vincoli unici delle sezioni, e la composita, rifatti sull'`id` del canzoniere.
--    L'ordine conta: la composita riferisce `sections_id_songbook`, che deve esistere prima.
--
--    `ON UPDATE CASCADE` **resta necessario**, e la ragione è quella che `schema.ts` ha
--    misurato: spostare una sezione in un altro canzoniere cambia `sections.songbook_id`, cioè
--    proprio la colonna riferita, e il vincolo è controllato per statement e non per
--    transazione. Che gli id siano stabili è vero della colonna sbagliata.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_name" UNIQUE ("songbook_id", "name");
--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_id_songbook"   UNIQUE ("id", "songbook_id");
--> statement-breakpoint

ALTER TABLE "songs" ADD CONSTRAINT "songs_section_songbook_fk"
  FOREIGN KEY ("section_id", "songbook_id") REFERENCES "sections"("id", "songbook_id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 7. Gli indici che nominavano un'email o uno slug.
-- ---------------------------------------------------------------------------------------------

DROP INDEX "songbooks_account_owner_email_idx";
--> statement-breakpoint
CREATE INDEX "songbooks_account_id_idx" ON "songbooks" ("account_id");
--> statement-breakpoint

DROP INDEX "songs_songbook_slug_idx";
--> statement-breakpoint
CREATE INDEX "songs_songbook_id_idx" ON "songs" ("songbook_id");
--> statement-breakpoint

DROP INDEX "user_song_comments_song_idx";
--> statement-breakpoint
CREATE INDEX "user_song_comments_song_idx" ON "user_song_comments" ("account_id", "song_id");
--> statement-breakpoint

-- L'indice che c'era prende il nome che descrive quello che fa — una riscossione per indirizzo,
-- per sempre — e resta esattamente com'è: è lui a chiudere il giro cancella-e-rifai.
ALTER INDEX "coupon_redemptions_once" RENAME TO "coupon_redemptions_once_email";
--> statement-breakpoint
-- E quello nuovo chiude l'altro giro: una riscossione per account vivo, immune alle rinomine.
-- Parziale, perché un puntatore nullo vuol dire «quell'account non c'è più» e due account
-- spariti non sono una collisione — senza il WHERE, la seconda riga orfana verrebbe rifiutata.
CREATE UNIQUE INDEX "coupon_redemptions_once" ON "coupon_redemptions" ("campaign_id", "account_id")
  WHERE "account_id" IS NOT NULL;
--> statement-breakpoint

-- ---------------------------------------------------------------------------------------------
-- 8. Via le colonne vecchie.
--
--    `paddle_events.account_owner_email` **non** è qui: quella tabella conserva l'indirizzo a
--    cui l'evento è arrivato, che è un fatto storico e non un puntatore.
--
--    `coupon_redemptions.account_owner_email` **nemmeno**, e per una ragione che merita di
--    stare qui e non solo in `schema.ts`. Il difetto era vero: `changeAccountEmail` sposta le
--    righe a mano tabella per tabella, quella lista non conteneva questa tabella, e quindi
--    cambiare indirizzo orfanava la riscossione e la stessa campagna si poteva riscuotere una
--    seconda volta. Lo chiude `account_id`, che non è in nessuna lista.
--    Ma l'email lì fa un secondo lavoro, che il commento della tabella dichiarava già come
--    scelta accettata: sopravvivere alla cancellazione dell'account, e chiudere così il giro
--    «cancello e rifaccio». Toglierla per simmetria l'avrebbe riaperto in silenzio.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks"           DROP COLUMN "account_owner_email";
--> statement-breakpoint
ALTER TABLE "user_prefs"          DROP COLUMN "user_email";
--> statement-breakpoint
ALTER TABLE "newsletter_prefs"    DROP COLUMN "owner_email";
--> statement-breakpoint
ALTER TABLE "user_song_prefs"     DROP COLUMN "user_email";
--> statement-breakpoint
ALTER TABLE "user_song_prefs"     DROP COLUMN "song_slug";
--> statement-breakpoint
ALTER TABLE "user_song_comments"  DROP COLUMN "user_email";
--> statement-breakpoint
ALTER TABLE "user_song_comments"  DROP COLUMN "song_slug";
--> statement-breakpoint
ALTER TABLE "sections"            DROP COLUMN "songbook_slug";
--> statement-breakpoint
ALTER TABLE "songs"               DROP COLUMN "songbook_slug";
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" DROP COLUMN "broadcast_account_email";
--> statement-breakpoint
ALTER TABLE "sing_along_sessions" DROP COLUMN "current_song_slug";
--> statement-breakpoint
-- (`coupon_redemptions.account_owner_email` resta: vedi sopra.)
