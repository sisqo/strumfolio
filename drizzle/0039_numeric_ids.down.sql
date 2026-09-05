-- Il `DOWN` di `0039_numeric_ids.sql`. Da incollare in una transazione, così com'è.
--
-- Non è la via di ritorno preferita: quella è un branch Neon preso subito prima di applicare la
-- `UP`, che costa un clic e ripristina anche i dati. Questo serve al caso in cui il branch non
-- ci sia, o si voglia tornare indietro senza perdere le scritture arrivate dopo.
--
-- **In che direzione ricostruisce.** Le email e gli slug delle tabelle figlie non esistono più
-- come colonne: vengono ricreate e ripopolate **risalendo da `account_id` / `song_id` /
-- `songbook_id`** a `accounts` / `songs` / `songbooks`, che conservano entrambe le chiavi. È
-- esattamente per questo che la `UP` non ha tolto né l'email né lo slug dalle tabelle padre.
--
-- `coupon_redemptions` è il caso più semplice di tutti, perché la `UP` non le toglie niente:
-- l'email resta al suo posto per tutto il tempo. Qui basta togliere `account_id` e il suo
-- indice parziale, e ridare all'indice sull'email il nome che aveva.
--
-- **Verificato**: `UP` e poi `DOWN` nella stessa transazione riportano lo schema di `public`
-- identico a com'era — colonne, vincoli e indici confrontati uno per uno — con una sola
-- differenza, e cosmetica: i due vincoli `NOT NULL` su `songbook_slug` rinascono chiamati
-- `sections_songbook_slug_not_null` e `songs_songbook_slug_not_null`, mentre in origine si
-- chiamavano `..._canzoniere_slug_not_null`, nome ereditato dal battesimo italiano di quella
-- colonna. Stesso vincolo, nome diverso: Postgres lo genera dalla colonna attuale e non c'è
-- modo di dettarglielo con `SET NOT NULL`. Niente da fare e niente di cui preoccuparsi.

-- ---------------------------------------------------------------------------------------------
-- 1. Le colonne vecchie tornano, ripopolate dagli id.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks" ADD COLUMN "account_owner_email" text;
UPDATE "songbooks" c SET "account_owner_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = c."account_id";

ALTER TABLE "user_prefs" ADD COLUMN "user_email" text;
UPDATE "user_prefs" p SET "user_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = p."account_id";

ALTER TABLE "newsletter_prefs" ADD COLUMN "owner_email" text;
UPDATE "newsletter_prefs" n SET "owner_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = n."account_id";

ALTER TABLE "user_song_prefs" ADD COLUMN "user_email" text;
ALTER TABLE "user_song_prefs" ADD COLUMN "song_slug" text;
UPDATE "user_song_prefs" p SET "user_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = p."account_id";
UPDATE "user_song_prefs" p SET "song_slug" = s."slug"
  FROM "songs" s WHERE s."id" = p."song_id";

ALTER TABLE "user_song_comments" ADD COLUMN "user_email" text;
ALTER TABLE "user_song_comments" ADD COLUMN "song_slug" text;
UPDATE "user_song_comments" c SET "user_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = c."account_id";
UPDATE "user_song_comments" c SET "song_slug" = s."slug"
  FROM "songs" s WHERE s."id" = c."song_id";

ALTER TABLE "sections" ADD COLUMN "songbook_slug" text;
UPDATE "sections" x SET "songbook_slug" = c."slug"
  FROM "songbooks" c WHERE c."id" = x."songbook_id";

ALTER TABLE "songs" ADD COLUMN "songbook_slug" text;
UPDATE "songs" s SET "songbook_slug" = c."slug"
  FROM "songbooks" c WHERE c."id" = s."songbook_id";

ALTER TABLE "sing_along_sessions" ADD COLUMN "broadcast_account_email" text;
ALTER TABLE "sing_along_sessions" ADD COLUMN "current_song_slug" text;
UPDATE "sing_along_sessions" t SET "broadcast_account_email" = a."owner_email"
  FROM "accounts" a WHERE a."id" = t."broadcast_account_id";
UPDATE "sing_along_sessions" t SET "current_song_slug" = s."slug"
  FROM "songs" s WHERE s."id" = t."current_song_id";

-- ---------------------------------------------------------------------------------------------
-- 2. Via i vincoli e gli indici nuovi.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songs"    DROP CONSTRAINT "songs_section_songbook_fk";
ALTER TABLE "sections" DROP CONSTRAINT "sections_id_songbook";
ALTER TABLE "sections" DROP CONSTRAINT "sections_songbook_name";

ALTER TABLE "songbooks"           DROP CONSTRAINT "songbooks_account_id_fk";
ALTER TABLE "user_prefs"          DROP CONSTRAINT "user_prefs_account_id_fk";
ALTER TABLE "newsletter_prefs"    DROP CONSTRAINT "newsletter_prefs_account_id_fk";
ALTER TABLE "user_song_prefs"     DROP CONSTRAINT "user_song_prefs_account_id_fk";
ALTER TABLE "user_song_prefs"     DROP CONSTRAINT "user_song_prefs_song_id_fk";
ALTER TABLE "user_song_comments"  DROP CONSTRAINT "user_song_comments_account_id_fk";
ALTER TABLE "user_song_comments"  DROP CONSTRAINT "user_song_comments_song_id_fk";
ALTER TABLE "sections"            DROP CONSTRAINT "sections_songbook_id_fk";
ALTER TABLE "songs"               DROP CONSTRAINT "songs_songbook_id_fk";
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_broadcast_account_id_fk";
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_current_song_id_fk";
ALTER TABLE "coupon_redemptions"  DROP CONSTRAINT "coupon_redemptions_account_id_fk";
ALTER TABLE "paddle_events"       DROP CONSTRAINT "paddle_events_account_id_fk";

DROP INDEX "songbooks_account_id_idx";
DROP INDEX "songs_songbook_id_idx";
DROP INDEX "user_song_comments_song_idx";
-- Il parziale su `account_id` se ne va; quello sull'email riprende il nome che aveva.
DROP INDEX "coupon_redemptions_once";
ALTER INDEX "coupon_redemptions_once_email" RENAME TO "coupon_redemptions_once";

-- ---------------------------------------------------------------------------------------------
-- 3. I vincoli NOT NULL come stavano.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks"           ALTER COLUMN "account_owner_email" SET NOT NULL;
ALTER TABLE "user_song_comments"  ALTER COLUMN "user_email" SET NOT NULL;
ALTER TABLE "user_song_comments"  ALTER COLUMN "song_slug"  SET NOT NULL;
ALTER TABLE "sections"            ALTER COLUMN "songbook_slug" SET NOT NULL;
ALTER TABLE "songs"               ALTER COLUMN "songbook_slug" SET NOT NULL;
ALTER TABLE "sing_along_sessions" ALTER COLUMN "broadcast_account_email" SET NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 4. Le primary key tornano sulle chiavi naturali, e via gli unici che la `UP` aveva aggiunto.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "accounts" DROP CONSTRAINT "accounts_pkey";
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_owner_email";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("owner_email");

ALTER TABLE "songbooks" DROP CONSTRAINT "songbooks_pkey";
ALTER TABLE "songbooks" DROP CONSTRAINT "songbooks_slug";
ALTER TABLE "songbooks" ADD CONSTRAINT "canzonieri_pkey" PRIMARY KEY ("slug");

ALTER TABLE "songs" DROP CONSTRAINT "songs_pkey";
ALTER TABLE "songs" DROP CONSTRAINT "songs_slug";
ALTER TABLE "songs" ADD CONSTRAINT "songs_pkey" PRIMARY KEY ("slug");

ALTER TABLE "user_prefs" DROP CONSTRAINT "user_prefs_pkey";
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_pkey" PRIMARY KEY ("user_email");

ALTER TABLE "newsletter_prefs" DROP CONSTRAINT "newsletter_prefs_pkey";
ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_pkey" PRIMARY KEY ("owner_email");

ALTER TABLE "user_song_prefs" DROP CONSTRAINT "user_song_prefs_pkey";
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_user_email_song_slug_pk"
  PRIMARY KEY ("user_email", "song_slug");

ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_pkey";
ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_owner";
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_pkey" PRIMARY KEY ("owner_email");

-- ---------------------------------------------------------------------------------------------
-- 5. Le foreign key vecchie, con i nomi che avevano — quello di `sing_along_sessions` incluso,
--    troncato a 63 caratteri da Postgres e da riscrivere così o non combacia.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_account_owner_email_accounts_owner_email_fk"
  FOREIGN KEY ("account_owner_email") REFERENCES "accounts"("owner_email");
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_email_accounts_owner_email_fk"
  FOREIGN KEY ("user_email") REFERENCES "accounts"("owner_email") ON DELETE CASCADE;
ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_owner_email_accounts_owner_email_fk"
  FOREIGN KEY ("owner_email") REFERENCES "accounts"("owner_email") ON DELETE CASCADE;
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_user_email_accounts_owner_email_fk"
  FOREIGN KEY ("user_email") REFERENCES "accounts"("owner_email") ON DELETE CASCADE;
ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_song_slug_songs_slug_fk"
  FOREIGN KEY ("song_slug") REFERENCES "songs"("slug") ON DELETE CASCADE;
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_user_email_accounts_owner_email_fk"
  FOREIGN KEY ("user_email") REFERENCES "accounts"("owner_email") ON DELETE CASCADE;
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_song_slug_songs_slug_fk"
  FOREIGN KEY ("song_slug") REFERENCES "songs"("slug") ON DELETE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_slug_songbooks_slug_fk"
  FOREIGN KEY ("songbook_slug") REFERENCES "songbooks"("slug") ON DELETE RESTRICT;
ALTER TABLE "songs" ADD CONSTRAINT "songs_songbook_slug_songbooks_slug_fk"
  FOREIGN KEY ("songbook_slug") REFERENCES "songbooks"("slug") ON DELETE RESTRICT;
ALTER TABLE "sing_along_sessions"
  ADD CONSTRAINT "sing_along_sessions_broadcast_account_email_accounts_owner_emai"
  FOREIGN KEY ("broadcast_account_email") REFERENCES "accounts"("owner_email");
ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_current_song_slug_songs_slug_fk"
  FOREIGN KEY ("current_song_slug") REFERENCES "songs"("slug") ON DELETE SET NULL;

ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_name" UNIQUE ("songbook_slug", "name");
ALTER TABLE "sections" ADD CONSTRAINT "sections_id_songbook"   UNIQUE ("id", "songbook_slug");
ALTER TABLE "songs" ADD CONSTRAINT "songs_section_songbook_fk"
  FOREIGN KEY ("section_id", "songbook_slug") REFERENCES "sections"("id", "songbook_slug")
  ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------------------------
-- 6. Gli indici vecchi.
-- ---------------------------------------------------------------------------------------------

CREATE INDEX "songbooks_account_owner_email_idx" ON "songbooks" ("account_owner_email");
CREATE INDEX "songs_songbook_slug_idx" ON "songs" ("songbook_slug");
CREATE INDEX "user_song_comments_song_idx" ON "user_song_comments" ("user_email", "song_slug");

-- ---------------------------------------------------------------------------------------------
-- 7. Via le colonne numeriche. Le sequenze dei `serial` se ne vanno con le colonne.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "songbooks"           DROP COLUMN "account_id";
ALTER TABLE "user_prefs"          DROP COLUMN "account_id";
ALTER TABLE "newsletter_prefs"    DROP COLUMN "account_id";
ALTER TABLE "user_song_prefs"     DROP COLUMN "account_id";
ALTER TABLE "user_song_prefs"     DROP COLUMN "song_id";
ALTER TABLE "user_song_comments"  DROP COLUMN "account_id";
ALTER TABLE "user_song_comments"  DROP COLUMN "song_id";
ALTER TABLE "sections"            DROP COLUMN "songbook_id";
ALTER TABLE "songs"               DROP COLUMN "songbook_id";
ALTER TABLE "sing_along_sessions" DROP COLUMN "broadcast_account_id";
ALTER TABLE "sing_along_sessions" DROP COLUMN "current_song_id";
ALTER TABLE "coupon_redemptions"  DROP COLUMN "account_id";
ALTER TABLE "paddle_events"       DROP COLUMN "account_id";

ALTER TABLE "accounts"            DROP COLUMN "id";
ALTER TABLE "songbooks"           DROP COLUMN "id";
ALTER TABLE "songs"               DROP COLUMN "id";
ALTER TABLE "sing_along_sessions" DROP COLUMN "id";
