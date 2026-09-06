-- Il `DOWN` di `0041`: rimette le colonne nell'ordine fisico che avevano prima, cioè con le
-- chiavi numeriche di `0039` in coda. Stesso meccanismo del `UP` — non esiste altro modo di
-- spostare una colonna in Postgres che rifare la tabella — con l'unica differenza che l'ordine
-- di arrivo è quello vecchio invece di quello di `schema.ts`.
--
-- Non ricrea i buchi di attnum lasciati dalle colonne cancellate prima di `0041`, e non può:
-- quei buchi erano cicatrici, non struttura. Nient'altro cambia.

-- 1. Via ogni foreign key dello schema, una per una e per nome. Un `DROP TABLE ... CASCADE`
--    farebbe lo stesso lavoro in silenzio, e si porterebbe via anche quelle che non stiamo
--    ricostruendo — `sing_along_devices` punta a `sing_along_sessions("token")` e non è in
--    questa lista. Nominarle qui vuol dire che una dimenticanza diventa un errore.

ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_account_id_fk";
--> statement-breakpoint

ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_campaign_id_coupon_campaigns_id_fk";
--> statement-breakpoint

ALTER TABLE "newsletter_prefs" DROP CONSTRAINT "newsletter_prefs_account_id_fk";
--> statement-breakpoint

ALTER TABLE "paddle_events" DROP CONSTRAINT "paddle_events_account_id_fk";
--> statement-breakpoint

ALTER TABLE "sections" DROP CONSTRAINT "sections_songbook_id_fk";
--> statement-breakpoint

ALTER TABLE "sing_along_devices" DROP CONSTRAINT "sing_along_devices_token_sing_along_sessions_token_fk";
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_broadcast_account_id_fk";
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" DROP CONSTRAINT "sing_along_sessions_current_song_id_fk";
--> statement-breakpoint

ALTER TABLE "songbooks" DROP CONSTRAINT "songbooks_account_id_fk";
--> statement-breakpoint

ALTER TABLE "songs" DROP CONSTRAINT "songs_section_songbook_fk";
--> statement-breakpoint

ALTER TABLE "songs" DROP CONSTRAINT "songs_songbook_id_fk";
--> statement-breakpoint

ALTER TABLE "user_prefs" DROP CONSTRAINT "user_prefs_account_id_fk";
--> statement-breakpoint

ALTER TABLE "user_song_comments" DROP CONSTRAINT "user_song_comments_account_id_fk";
--> statement-breakpoint

ALTER TABLE "user_song_comments" DROP CONSTRAINT "user_song_comments_song_id_fk";
--> statement-breakpoint

ALTER TABLE "user_song_prefs" DROP CONSTRAINT "user_song_prefs_account_id_fk";
--> statement-breakpoint

ALTER TABLE "user_song_prefs" DROP CONSTRAINT "user_song_prefs_song_id_fk";
--> statement-breakpoint

-- 2. Le sequenze si sganciano dalle tabelle che stanno per sparire. Senza questo passo il
--    `DROP TABLE` se le porterebbe dietro, e la tabella nuova ripartirebbe da una sequenza
--    diversa, con un altro nome e da 1: il primo inserimento collide con una riga che c'è già.

ALTER SEQUENCE "accounts_id_seq" OWNED BY NONE;
--> statement-breakpoint

ALTER SEQUENCE "sections_id_seq" OWNED BY NONE;
--> statement-breakpoint

ALTER SEQUENCE "sing_along_sessions_id_seq" OWNED BY NONE;
--> statement-breakpoint

ALTER SEQUENCE "songbooks_id_seq" OWNED BY NONE;
--> statement-breakpoint

ALTER SEQUENCE "songs_id_seq" OWNED BY NONE;
--> statement-breakpoint

-- 3. Tabella per tabella: la nuova nell'ordine voluto, i dati, via la vecchia, il nome.
--    Le colonne nascono senza vincoli: primary key, unique, indici e foreign key tornano più
--    sotto con i loro nomi originali, invece di essere battezzati dal database.
--
--    A farsi da parte è la tabella **vecchia**, e la nuova nasce già con il nome definitivo.
--    Il contrario — costruire `accounts__new` e poi rinominarla — lascerebbe ogni NOT NULL
--    chiamato `accounts__new_id_not_null` per sempre, perché rinominare una tabella non
--    rinomina i suoi vincoli e da Postgres 17 anche i NOT NULL sono righe di `pg_constraint`.

CREATE TABLE "accounts__old" AS SELECT * FROM "accounts";
--> statement-breakpoint

DROP TABLE "accounts";
--> statement-breakpoint

CREATE TABLE "accounts" (
  "owner_email" text CONSTRAINT "accounts_owner_email_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "accounts_created_at_not_null" NOT NULL DEFAULT now(),
  "plan" text CONSTRAINT "accounts_plan_not_null" NOT NULL DEFAULT 'free'::text,
  "plan_status" text CONSTRAINT "accounts_plan_status_not_null" NOT NULL DEFAULT 'active'::text,
  "plan_expires_at" timestamp with time zone,
  "paddle_customer_id" text,
  "paddle_subscription_id" text,
  "granted_plan" text,
  "granted_until" timestamp with time zone,
  "granted_by" text,
  "granted_at" timestamp with time zone,
  "granted_note" text,
  "gclid" text,
  "sing_along_peak_devices" integer CONSTRAINT "accounts_sing_along_peak_devices_not_null" NOT NULL DEFAULT 0,
  "pending_plan" text,
  "pending_cycle" text,
  "plan_chosen_at" timestamp with time zone,
  "booklet_footer" text,
  "first_name" text,
  "last_name" text,
  "suspended_at" timestamp with time zone,
  "internal_note" text,
  "coupon_code" text,
  "coupon_percent" text,
  "discount_ends_at" timestamp with time zone,
  "id" integer CONSTRAINT "accounts_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "accounts" ("owner_email", "created_at", "plan", "plan_status", "plan_expires_at", "paddle_customer_id", "paddle_subscription_id", "granted_plan", "granted_until", "granted_by", "granted_at", "granted_note", "gclid", "sing_along_peak_devices", "pending_plan", "pending_cycle", "plan_chosen_at", "booklet_footer", "first_name", "last_name", "suspended_at", "internal_note", "coupon_code", "coupon_percent", "discount_ends_at", "id") SELECT "owner_email", "created_at", "plan", "plan_status", "plan_expires_at", "paddle_customer_id", "paddle_subscription_id", "granted_plan", "granted_until", "granted_by", "granted_at", "granted_note", "gclid", "sing_along_peak_devices", "pending_plan", "pending_cycle", "plan_chosen_at", "booklet_footer", "first_name", "last_name", "suspended_at", "internal_note", "coupon_code", "coupon_percent", "discount_ends_at", "id" FROM "accounts__old";
--> statement-breakpoint

DROP TABLE "accounts__old";
--> statement-breakpoint

CREATE TABLE "coupon_redemptions__old" AS SELECT * FROM "coupon_redemptions";
--> statement-breakpoint

DROP TABLE "coupon_redemptions";
--> statement-breakpoint

CREATE TABLE "coupon_redemptions" (
  "id" text CONSTRAINT "coupon_redemptions_id_not_null" NOT NULL,
  "campaign_id" text CONSTRAINT "coupon_redemptions_campaign_id_not_null" NOT NULL,
  "account_owner_email" text CONSTRAINT "coupon_redemptions_account_owner_email_not_null" NOT NULL,
  "code" text CONSTRAINT "coupon_redemptions_code_not_null" NOT NULL,
  "discount_percent" text CONSTRAINT "coupon_redemptions_discount_percent_not_null" NOT NULL,
  "plan" text CONSTRAINT "coupon_redemptions_plan_not_null" NOT NULL,
  "cycle" text,
  "full_amount" text CONSTRAINT "coupon_redemptions_full_amount_not_null" NOT NULL,
  "paid_amount" text CONSTRAINT "coupon_redemptions_paid_amount_not_null" NOT NULL,
  "discount_ends_at" timestamp with time zone,
  "redeemed_at" timestamp with time zone CONSTRAINT "coupon_redemptions_redeemed_at_not_null" NOT NULL DEFAULT now(),
  "account_id" integer
);
--> statement-breakpoint

INSERT INTO "coupon_redemptions" ("id", "campaign_id", "account_owner_email", "code", "discount_percent", "plan", "cycle", "full_amount", "paid_amount", "discount_ends_at", "redeemed_at", "account_id") SELECT "id", "campaign_id", "account_owner_email", "code", "discount_percent", "plan", "cycle", "full_amount", "paid_amount", "discount_ends_at", "redeemed_at", "account_id" FROM "coupon_redemptions__old";
--> statement-breakpoint

DROP TABLE "coupon_redemptions__old";
--> statement-breakpoint

CREATE TABLE "newsletter_prefs__old" AS SELECT * FROM "newsletter_prefs";
--> statement-breakpoint

DROP TABLE "newsletter_prefs";
--> statement-breakpoint

CREATE TABLE "newsletter_prefs" (
  "subscribed" boolean CONSTRAINT "newsletter_prefs_subscribed_not_null" NOT NULL DEFAULT false,
  "frequency" text CONSTRAINT "newsletter_prefs_frequency_not_null" NOT NULL DEFAULT 'monthly'::text,
  "subscribed_at" timestamp with time zone,
  "unsubscribed_at" timestamp with time zone,
  "updated_at" timestamp with time zone CONSTRAINT "newsletter_prefs_updated_at_not_null" NOT NULL DEFAULT now(),
  "account_id" integer CONSTRAINT "newsletter_prefs_account_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "newsletter_prefs" ("subscribed", "frequency", "subscribed_at", "unsubscribed_at", "updated_at", "account_id") SELECT "subscribed", "frequency", "subscribed_at", "unsubscribed_at", "updated_at", "account_id" FROM "newsletter_prefs__old";
--> statement-breakpoint

DROP TABLE "newsletter_prefs__old";
--> statement-breakpoint

CREATE TABLE "paddle_events__old" AS SELECT * FROM "paddle_events";
--> statement-breakpoint

DROP TABLE "paddle_events";
--> statement-breakpoint

CREATE TABLE "paddle_events" (
  "event_id" text CONSTRAINT "paddle_events_event_id_not_null" NOT NULL,
  "event_type" text CONSTRAINT "paddle_events_event_type_not_null" NOT NULL,
  "occurred_at" timestamp with time zone,
  "account_owner_email" text,
  "paddle_subscription_id" text,
  "payload" text CONSTRAINT "paddle_events_payload_not_null" NOT NULL,
  "received_at" timestamp with time zone CONSTRAINT "paddle_events_received_at_not_null" NOT NULL DEFAULT now(),
  "account_id" integer
);
--> statement-breakpoint

INSERT INTO "paddle_events" ("event_id", "event_type", "occurred_at", "account_owner_email", "paddle_subscription_id", "payload", "received_at", "account_id") SELECT "event_id", "event_type", "occurred_at", "account_owner_email", "paddle_subscription_id", "payload", "received_at", "account_id" FROM "paddle_events__old";
--> statement-breakpoint

DROP TABLE "paddle_events__old";
--> statement-breakpoint

CREATE TABLE "pending_registrations__old" AS SELECT * FROM "pending_registrations";
--> statement-breakpoint

DROP TABLE "pending_registrations";
--> statement-breakpoint

CREATE TABLE "pending_registrations" (
  "email" text CONSTRAINT "pending_registrations_email_not_null" NOT NULL,
  "password_hash" text CONSTRAINT "pending_registrations_password_hash_not_null" NOT NULL,
  "verification_token_hash" text CONSTRAINT "pending_registrations_verification_token_hash_not_null" NOT NULL,
  "expires_at" timestamp with time zone CONSTRAINT "pending_registrations_expires_at_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "pending_registrations_created_at_not_null" NOT NULL DEFAULT now(),
  "first_name" text,
  "last_name" text,
  "newsletter_opt_in" boolean CONSTRAINT "pending_registrations_newsletter_opt_in_not_null" NOT NULL DEFAULT false
);
--> statement-breakpoint

INSERT INTO "pending_registrations" ("email", "password_hash", "verification_token_hash", "expires_at", "created_at", "first_name", "last_name", "newsletter_opt_in") SELECT "email", "password_hash", "verification_token_hash", "expires_at", "created_at", "first_name", "last_name", "newsletter_opt_in" FROM "pending_registrations__old";
--> statement-breakpoint

DROP TABLE "pending_registrations__old";
--> statement-breakpoint

CREATE TABLE "sections__old" AS SELECT * FROM "sections";
--> statement-breakpoint

DROP TABLE "sections";
--> statement-breakpoint

CREATE TABLE "sections" (
  "id" integer CONSTRAINT "sections_id_not_null" NOT NULL,
  "name" text CONSTRAINT "sections_name_not_null" NOT NULL,
  "position" integer CONSTRAINT "sections_position_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "sections_created_at_not_null" NOT NULL DEFAULT now(),
  "songbook_id" integer CONSTRAINT "sections_songbook_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "sections" ("id", "name", "position", "created_at", "songbook_id") SELECT "id", "name", "position", "created_at", "songbook_id" FROM "sections__old";
--> statement-breakpoint

DROP TABLE "sections__old";
--> statement-breakpoint

CREATE TABLE "sing_along_sessions__old" AS SELECT * FROM "sing_along_sessions";
--> statement-breakpoint

DROP TABLE "sing_along_sessions";
--> statement-breakpoint

CREATE TABLE "sing_along_sessions" (
  "owner_email" text CONSTRAINT "sing_along_sessions_owner_email_not_null" NOT NULL,
  "token" text CONSTRAINT "sing_along_sessions_token_not_null" NOT NULL,
  "current_semitones" integer CONSTRAINT "sing_along_sessions_current_semitones_not_null" NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone CONSTRAINT "sing_along_sessions_created_at_not_null" NOT NULL DEFAULT now(),
  "last_active_at" timestamp with time zone CONSTRAINT "sing_along_sessions_last_active_at_not_null" NOT NULL DEFAULT now(),
  "id" integer CONSTRAINT "sing_along_sessions_id_not_null" NOT NULL,
  "broadcast_account_id" integer CONSTRAINT "sing_along_sessions_broadcast_account_id_not_null" NOT NULL,
  "current_song_id" integer
);
--> statement-breakpoint

INSERT INTO "sing_along_sessions" ("owner_email", "token", "current_semitones", "created_at", "last_active_at", "id", "broadcast_account_id", "current_song_id") SELECT "owner_email", "token", "current_semitones", "created_at", "last_active_at", "id", "broadcast_account_id", "current_song_id" FROM "sing_along_sessions__old";
--> statement-breakpoint

DROP TABLE "sing_along_sessions__old";
--> statement-breakpoint

CREATE TABLE "songbooks__old" AS SELECT * FROM "songbooks";
--> statement-breakpoint

DROP TABLE "songbooks";
--> statement-breakpoint

CREATE TABLE "songbooks" (
  "slug" text CONSTRAINT "canzonieri_slug_not_null" NOT NULL,
  "name" text CONSTRAINT "canzonieri_name_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "canzonieri_created_at_not_null" NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone CONSTRAINT "canzonieri_updated_at_not_null" NOT NULL DEFAULT now(),
  "is_example_template" boolean CONSTRAINT "songbooks_is_example_template_not_null" NOT NULL DEFAULT false,
  "position" integer CONSTRAINT "songbooks_position_not_null" NOT NULL,
  "id" integer CONSTRAINT "songbooks_id_not_null" NOT NULL,
  "account_id" integer CONSTRAINT "songbooks_account_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "songbooks" ("slug", "name", "created_at", "updated_at", "is_example_template", "position", "id", "account_id") SELECT "slug", "name", "created_at", "updated_at", "is_example_template", "position", "id", "account_id" FROM "songbooks__old";
--> statement-breakpoint

DROP TABLE "songbooks__old";
--> statement-breakpoint

CREATE TABLE "songs__old" AS SELECT * FROM "songs";
--> statement-breakpoint

DROP TABLE "songs";
--> statement-breakpoint

CREATE TABLE "songs" (
  "slug" text CONSTRAINT "songs_slug_not_null" NOT NULL,
  "title" text CONSTRAINT "songs_title_not_null" NOT NULL,
  "artist" text,
  "tags" text[] CONSTRAINT "songs_tags_not_null" NOT NULL DEFAULT '{}'::text[],
  "body" text CONSTRAINT "songs_body_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "songs_created_at_not_null" NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone CONSTRAINT "songs_updated_at_not_null" NOT NULL DEFAULT now(),
  "position" integer,
  "section_id" integer CONSTRAINT "songs_section_id_not_null" NOT NULL,
  "link1" text,
  "link2" text,
  "link3" text,
  "id" integer CONSTRAINT "songs_id_not_null" NOT NULL,
  "songbook_id" integer CONSTRAINT "songs_songbook_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "songs" ("slug", "title", "artist", "tags", "body", "created_at", "updated_at", "position", "section_id", "link1", "link2", "link3", "id", "songbook_id") SELECT "slug", "title", "artist", "tags", "body", "created_at", "updated_at", "position", "section_id", "link1", "link2", "link3", "id", "songbook_id" FROM "songs__old";
--> statement-breakpoint

DROP TABLE "songs__old";
--> statement-breakpoint

CREATE TABLE "user_prefs__old" AS SELECT * FROM "user_prefs";
--> statement-breakpoint

DROP TABLE "user_prefs";
--> statement-breakpoint

CREATE TABLE "user_prefs" (
  "zoom_step" integer CONSTRAINT "user_prefs_zoom_step_not_null" NOT NULL DEFAULT 2,
  "notation" text CONSTRAINT "user_prefs_notation_not_null" NOT NULL DEFAULT 'int'::text,
  "updated_at" timestamp with time zone CONSTRAINT "user_prefs_updated_at_not_null" NOT NULL DEFAULT now(),
  "instrument" text CONSTRAINT "user_prefs_instrument_not_null" NOT NULL DEFAULT 'chitarra'::text,
  "chord_display" text CONSTRAINT "user_prefs_chord_display_not_null" NOT NULL DEFAULT 'name'::text,
  "accidentals" text CONSTRAINT "user_prefs_accidentals_not_null" NOT NULL DEFAULT 'sharp'::text,
  "account_id" integer CONSTRAINT "user_prefs_account_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "user_prefs" ("zoom_step", "notation", "updated_at", "instrument", "chord_display", "accidentals", "account_id") SELECT "zoom_step", "notation", "updated_at", "instrument", "chord_display", "accidentals", "account_id" FROM "user_prefs__old";
--> statement-breakpoint

DROP TABLE "user_prefs__old";
--> statement-breakpoint

CREATE TABLE "user_song_comments__old" AS SELECT * FROM "user_song_comments";
--> statement-breakpoint

DROP TABLE "user_song_comments";
--> statement-breakpoint

CREATE TABLE "user_song_comments" (
  "id" text CONSTRAINT "user_song_comments_id_not_null" NOT NULL,
  "block_index" integer,
  "char_offset" integer,
  "target" text CONSTRAINT "user_song_comments_target_not_null" NOT NULL DEFAULT 'lyric'::text,
  "anchor_label" text CONSTRAINT "user_song_comments_anchor_label_not_null" NOT NULL DEFAULT ''::text,
  "body" text CONSTRAINT "user_song_comments_body_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "user_song_comments_created_at_not_null" NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone CONSTRAINT "user_song_comments_updated_at_not_null" NOT NULL DEFAULT now(),
  "account_id" integer CONSTRAINT "user_song_comments_account_id_not_null" NOT NULL,
  "song_id" integer CONSTRAINT "user_song_comments_song_id_not_null" NOT NULL
);
--> statement-breakpoint

INSERT INTO "user_song_comments" ("id", "block_index", "char_offset", "target", "anchor_label", "body", "created_at", "updated_at", "account_id", "song_id") SELECT "id", "block_index", "char_offset", "target", "anchor_label", "body", "created_at", "updated_at", "account_id", "song_id" FROM "user_song_comments__old";
--> statement-breakpoint

DROP TABLE "user_song_comments__old";
--> statement-breakpoint

CREATE TABLE "user_song_prefs__old" AS SELECT * FROM "user_song_prefs";
--> statement-breakpoint

DROP TABLE "user_song_prefs";
--> statement-breakpoint

CREATE TABLE "user_song_prefs" (
  "semitones" integer CONSTRAINT "user_song_prefs_semitones_not_null" NOT NULL DEFAULT 0,
  "scroll_speed" integer CONSTRAINT "user_song_prefs_scroll_speed_not_null" NOT NULL DEFAULT 3,
  "updated_at" timestamp with time zone CONSTRAINT "user_song_prefs_updated_at_not_null" NOT NULL DEFAULT now(),
  "capo" integer CONSTRAINT "user_song_prefs_capo_not_null" NOT NULL DEFAULT 0,
  "last_opened_at" timestamp with time zone,
  "chord_shapes" jsonb CONSTRAINT "user_song_prefs_chord_shapes_not_null" NOT NULL DEFAULT '{}'::jsonb,
  "favorite" boolean CONSTRAINT "user_song_prefs_favorite_not_null" NOT NULL DEFAULT false,
  "account_id" integer CONSTRAINT "user_song_prefs_account_id_not_null" NOT NULL,
  "song_id" integer CONSTRAINT "user_song_prefs_song_id_not_null" NOT NULL,
  "tabs_expanded" boolean CONSTRAINT "user_song_prefs_tabs_expanded_not_null" NOT NULL DEFAULT false
);
--> statement-breakpoint

INSERT INTO "user_song_prefs" ("semitones", "scroll_speed", "updated_at", "capo", "last_opened_at", "chord_shapes", "favorite", "account_id", "song_id", "tabs_expanded") SELECT "semitones", "scroll_speed", "updated_at", "capo", "last_opened_at", "chord_shapes", "favorite", "account_id", "song_id", "tabs_expanded" FROM "user_song_prefs__old";
--> statement-breakpoint

DROP TABLE "user_song_prefs__old";
--> statement-breakpoint

-- 4. Le sequenze tornano al loro posto, con il valore che avevano: mai azzerate, mai
--    ricreate. `OWNED BY` è ciò che le fa di nuovo cadere insieme alla tabella.

ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT nextval('accounts_id_seq'::regclass);
--> statement-breakpoint

ALTER SEQUENCE "accounts_id_seq" OWNED BY "accounts"."id";
--> statement-breakpoint

ALTER TABLE "sections" ALTER COLUMN "id" SET DEFAULT nextval('sections_id_seq'::regclass);
--> statement-breakpoint

ALTER SEQUENCE "sections_id_seq" OWNED BY "sections"."id";
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ALTER COLUMN "id" SET DEFAULT nextval('sing_along_sessions_id_seq'::regclass);
--> statement-breakpoint

ALTER SEQUENCE "sing_along_sessions_id_seq" OWNED BY "sing_along_sessions"."id";
--> statement-breakpoint

ALTER TABLE "songbooks" ALTER COLUMN "id" SET DEFAULT nextval('songbooks_id_seq'::regclass);
--> statement-breakpoint

ALTER SEQUENCE "songbooks_id_seq" OWNED BY "songbooks"."id";
--> statement-breakpoint

ALTER TABLE "songs" ALTER COLUMN "id" SET DEFAULT nextval('songs_id_seq'::regclass);
--> statement-breakpoint

ALTER SEQUENCE "songs_id_seq" OWNED BY "songs"."id";
--> statement-breakpoint

-- 5. Primary key e unique, con i nomi di prima. `sections_id_songbook` deve esistere prima
--    della composita del punto 7, che la riferisce.

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_email" UNIQUE (owner_email);
--> statement-breakpoint

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_paddle_subscription_id" UNIQUE (paddle_subscription_id);
--> statement-breakpoint

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_pkey" PRIMARY KEY (account_id);
--> statement-breakpoint

ALTER TABLE "paddle_events" ADD CONSTRAINT "paddle_events_pkey" PRIMARY KEY (event_id);
--> statement-breakpoint

ALTER TABLE "pending_registrations" ADD CONSTRAINT "pending_registrations_pkey" PRIMARY KEY (email);
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_id_songbook" UNIQUE (id, songbook_id);
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_name" UNIQUE (songbook_id, name);
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_owner" UNIQUE (owner_email);
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_token" UNIQUE (token);
--> statement-breakpoint

ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_slug" UNIQUE (slug);
--> statement-breakpoint

ALTER TABLE "songs" ADD CONSTRAINT "songs_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "songs" ADD CONSTRAINT "songs_slug" UNIQUE (slug);
--> statement-breakpoint

ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_pkey" PRIMARY KEY (account_id);
--> statement-breakpoint

ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_pkey" PRIMARY KEY (id);
--> statement-breakpoint

ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_pkey" PRIMARY KEY (account_id, song_id);
--> statement-breakpoint

-- 6. Gli indici che non nascono da un vincolo — i tre parziali compresi, con il loro
--    `WHERE` copiato alla lettera: senza, `coupon_campaigns_one_default` vieterebbe una
--    seconda campagna *non* di default, e non è quello che dice di fare.

CREATE INDEX coupon_redemptions_campaign ON public.coupon_redemptions USING btree (campaign_id);
--> statement-breakpoint

CREATE UNIQUE INDEX coupon_redemptions_once ON public.coupon_redemptions USING btree (campaign_id, account_id) WHERE (account_id IS NOT NULL);
--> statement-breakpoint

CREATE UNIQUE INDEX coupon_redemptions_once_email ON public.coupon_redemptions USING btree (campaign_id, account_owner_email);
--> statement-breakpoint

CREATE INDEX songbooks_account_id_idx ON public.songbooks USING btree (account_id);
--> statement-breakpoint

CREATE UNIQUE INDEX songbooks_one_example_template ON public.songbooks USING btree (is_example_template) WHERE is_example_template;
--> statement-breakpoint

CREATE INDEX songs_songbook_id_idx ON public.songs USING btree (songbook_id);
--> statement-breakpoint

CREATE INDEX user_song_comments_song_idx ON public.user_song_comments USING btree (account_id, song_id);
--> statement-breakpoint

-- 7. Le foreign key. `ON UPDATE CASCADE` su `songs_section_songbook_fk` sembra di troppo e
--    non lo è: spostare una sezione di canzoniere cambia `sections.songbook_id`, cioè proprio
--    la colonna riferita, e il vincolo è controllato per statement.

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_campaign_id_coupon_campaigns_id_fk" FOREIGN KEY (campaign_id) REFERENCES coupon_campaigns(id);
--> statement-breakpoint

ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "paddle_events" ADD CONSTRAINT "paddle_events_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_songbook_id_fk" FOREIGN KEY (songbook_id) REFERENCES songbooks(id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "sing_along_devices" ADD CONSTRAINT "sing_along_devices_token_sing_along_sessions_token_fk" FOREIGN KEY (token) REFERENCES sing_along_sessions(token) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_broadcast_account_id_fk" FOREIGN KEY (broadcast_account_id) REFERENCES accounts(id);
--> statement-breakpoint

ALTER TABLE "sing_along_sessions" ADD CONSTRAINT "sing_along_sessions_current_song_id_fk" FOREIGN KEY (current_song_id) REFERENCES songs(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "songbooks" ADD CONSTRAINT "songbooks_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id);
--> statement-breakpoint

ALTER TABLE "songs" ADD CONSTRAINT "songs_section_songbook_fk" FOREIGN KEY (section_id, songbook_id) REFERENCES sections(id, songbook_id) ON UPDATE CASCADE ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "songs" ADD CONSTRAINT "songs_songbook_id_fk" FOREIGN KEY (songbook_id) REFERENCES songbooks(id) ON DELETE RESTRICT;
--> statement-breakpoint

ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_song_id_fk" FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_account_id_fk" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "user_song_prefs" ADD CONSTRAINT "user_song_prefs_song_id_fk" FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE;
