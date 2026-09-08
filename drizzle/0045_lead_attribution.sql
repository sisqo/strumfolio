-- Where a lead came from: the campaign parameters, click id, referring host and landing page of
-- the arrival that discovered somebody, and of the one that closed.
--
-- Until now nothing on this side could tell an account that arrived from an advertisement from
-- one that arrived from a search: `sw.ts` was the only file in the repo that mentioned `utm_`
-- at all, and only to ignore those parameters when matching its cache. So «which channel brings
-- musicians here» had no answer, and neither did «this campaign brought forty registrations and
-- eleven of them paid».
--
-- Hand-written, not generated, same reason as 0024-0044's own notes: `db:generate` refuses to
-- run over the 0028-0030 snapshot collision.
--
-- Column order follows `schema.ts`'s field order — id, address, pointer, the two state columns,
-- then the first touch and the last, each in the same order as the other. A `CREATE TABLE` is
-- the one place that order is free; an `ADD COLUMN` later appends and Postgres cannot move a
-- column back, which is what `0041` had to rebuild tables to fix.
--
-- Four things a reader of this file from a SQL console should know:
--
-- 1. **This is the only table here about a person who has no account yet.** A row is born when
--    an address is first given — a registration submitted, or a first Google sign-in — with
--    `account_id` still null, and the pointer is filled when the account is actually created.
--    An anonymous visitor gets no row at all: what they carry is a cookie, which is what stops
--    this growing by a row per page view.
-- 2. **`email` is history and is never updated; `account_id` is what every read asks by.** So
--    `changeAccountEmail` has nothing to do with this table, by construction rather than by
--    somebody remembering. See the schema comment for the full argument.
-- 3. **`ON DELETE CASCADE`, unlike `coupon_views` and `outreach_actions` next door.** Their SET
--    NULL guards against a voucher being farmed by deleting an account and signing up again;
--    nothing here hands anything out, so there is nothing to guard. The knowing cost: a
--    campaign's historical total shrinks as the people it brought close their accounts. On a
--    nullable foreign key the cascade never touches the null rows, which is how «a lead with no
--    account survives» and «an account takes its row with it» hold at the same time.
-- 4. **`last_*` is entirely null when it would repeat `first_*`.** One arrival is the ordinary
--    case, so `last_touch_at IS NULL` is how «one provenance» is told from «two», and the reads
--    say COALESCE(last_…, first_…) wherever they mean «most recently».
--
-- No backfill and nothing to migrate: the table is born empty, and where the existing accounts
-- came from was never written down anywhere to recover it from. `/leads` counts them in a line
-- of its own rather than letting a GROUP BY drop them in silence.

CREATE TABLE "lead_attribution" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "account_id" integer,
  "frozen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "first_source" text,
  "first_medium" text,
  "first_campaign" text,
  "first_term" text,
  "first_content" text,
  "first_click_id_kind" text,
  "first_click_id" text,
  "first_referer_host" text,
  "first_landing_path" text,
  "first_touch_at" timestamp with time zone,
  "last_source" text,
  "last_medium" text,
  "last_campaign" text,
  "last_term" text,
  "last_content" text,
  "last_click_id_kind" text,
  "last_click_id" text,
  "last_referer_host" text,
  "last_landing_path" text,
  "last_touch_at" timestamp with time zone
);--> statement-breakpoint

-- CASCADE, deliberately — see note 3 in the header. `deleteAccount` stays possible either way;
-- what differs is whether the marketing record outlives the person, and here it does not.
ALTER TABLE "lead_attribution" ADD CONSTRAINT "lead_attribution_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint

-- One *open* lead per address, and the conflict target both writing seams name.
--
-- Partial, and this is the constraint that makes the whole shape safe rather than merely tidy: a
-- frozen row (one with an account) is invisible here, so a new registration on an address that
-- some other account used to own — freed by `changeAccountEmail` — gets a row of its own instead
-- of overwriting an existing customer's attribution. A plain UNIQUE("email") would have let the
-- upsert mutate that customer's row, in silence.
--
-- Nothing in the app repeats this predicate: `recordLeadAttribution` inserts with a bare ON
-- CONFLICT DO NOTHING, which any constraint satisfies, so this WHERE exists in one place only
-- and cannot drift from a copy of itself — the hazard `coupon_views_once` next door has to live
-- with, where a one-character difference makes every write fail on a path that only logs.
CREATE UNIQUE INDEX "lead_attribution_open"
  ON "lead_attribution" ("email")
  WHERE "account_id" IS NULL;--> statement-breakpoint

-- And one row per account once there is one. Partial for the same reason the index above is:
-- Postgres treats nulls as distinct anyway, and saying so keeps the two indexes symmetrical.
CREATE UNIQUE INDEX "lead_attribution_account"
  ON "lead_attribution" ("account_id")
  WHERE "account_id" IS NOT NULL;--> statement-breakpoint

-- `/leads`' own read: every acquisition grouped by the campaign that discovered it.
CREATE INDEX "lead_attribution_first_campaign"
  ON "lead_attribution" ("first_source","first_medium","first_campaign");
