-- Newsletter subscription preference (PLAN-newsletter.md). `pending_registrations`
-- gets a plain boolean, DEFAULT false NOT NULL — unlike first_name/last_name in 0034
-- a boolean always has a safe default, so no risk to a row already pending at deploy
-- time. `newsletter_prefs` is a new table, one row per account, cascading on
-- `accounts.owner_email` like `user_prefs`. Existing accounts are backfilled to
-- subscribed = true in the same migration (decided in interview) — new accounts get
-- their row from `provisionAccount` instead, never from this backfill.
--
-- Snapshot warning (see 0031-0034's own notes, and PLAN.md Domande aperte #19):
-- `db:generate` still refuses to run, 0028/0029/0030 sharing one id and prevId. This
-- file and its journal entry were written by hand, the same way 0024-0034 were.
ALTER TABLE "pending_registrations" ADD COLUMN "newsletter_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "newsletter_prefs" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"subscribed" boolean DEFAULT false NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"subscribed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "newsletter_prefs" ADD CONSTRAINT "newsletter_prefs_owner_email_accounts_owner_email_fk" FOREIGN KEY ("owner_email") REFERENCES "public"."accounts"("owner_email") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "newsletter_prefs" ("owner_email", "subscribed", "frequency", "subscribed_at")
SELECT "owner_email", true, 'monthly', now() FROM "accounts";
