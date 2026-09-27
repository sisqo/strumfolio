-- Accesso AI via MCP: i token personali, la versione di ogni canzone e la cronologia di ciò
-- che un'AI ha cambiato. Decisione del proprietario, 2026-09-27.
--
-- `songs.version` è il numero che l'AI rimanda con «l'ho letta così»: un intero e non
-- `updated_at`, che Postgres tiene al microsecondo e un `Date` di JavaScript riporta al
-- millisecondo, così che un confronto di uguaglianza non tornerebbe mai. Parte da 1 per ogni
-- riga esistente e cresce a ogni riscrittura del testo, da chiunque arrivi.
--
-- `songs.ai_written_at` non è nullo quando l'ultima riscrittura è stata di un'AI: è il segno
-- «modificata dall'AI» e ciò che fa conservare quel testo quando l'app lo sovrascrive.
--
-- Tutto additivo: nessuna colonna esistente cambia, nessuna riga viene riscritta.
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "ai_written_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_hash" UNIQUE("hash"),
	CONSTRAINT "api_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS "api_tokens_account_id_idx" ON "api_tokens" ("account_id");
--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "ai_token_id" integer;
ALTER TABLE "songs" ADD CONSTRAINT "songs_ai_token_id_api_tokens_id_fk" FOREIGN KEY ("ai_token_id") REFERENCES "api_tokens"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "song_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"song_id" integer NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"body" text NOT NULL,
	"written_by" text NOT NULL,
	"token_id" integer,
	"written_at" timestamp with time zone NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_revisions_written_by" CHECK ("written_by" IN ('app', 'ai')),
	CONSTRAINT "song_revisions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE cascade,
	CONSTRAINT "song_revisions_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "api_tokens"("id") ON DELETE set null
);
CREATE INDEX IF NOT EXISTS "song_revisions_song_idx" ON "song_revisions" ("song_id", "id");
