CREATE TABLE "user_song_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_email" text NOT NULL,
	"song_slug" text NOT NULL,
	"block_index" integer,
	"char_offset" integer,
	"target" text DEFAULT 'lyric' NOT NULL,
	"anchor_label" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_user_email_accounts_owner_email_fk" FOREIGN KEY ("user_email") REFERENCES "public"."accounts"("owner_email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_song_comments" ADD CONSTRAINT "user_song_comments_song_slug_songs_slug_fk" FOREIGN KEY ("song_slug") REFERENCES "public"."songs"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_song_comments_song_idx" ON "user_song_comments" USING btree ("user_email","song_slug");
