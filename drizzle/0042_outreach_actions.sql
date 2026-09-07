-- What the platform has done *to* a reader, and the record that it has already been done:
-- birthday greetings, an upgrade offer carrying a voucher, whatever joins them.
--
-- Hand-written, not generated, same reason as 0028-0041's own notes: `db:generate` refuses to
-- run over the 0028-0030 snapshot collision.
--
-- Column order follows `schema.ts`'s field order — id first, then the foreign key — which is
-- the convention 0041 established for every table. A `CREATE TABLE` is the one place that is
-- free; an `ADD COLUMN` later will append, and Postgres has no way to move a column back.
--
-- Three things a reader of this file from a SQL console should know:
--
-- 1. **The row is the claim.** It is inserted *before* anything is sent, so the two unique
--    indexes below are what makes "never twice" a fact of this database rather than a rule in
--    some code path. A second run finds its insert refused and stops.
-- 2. **Only `status = 'done'` is terminal.** `failed`, `suppressed` and a `pending` row left
--    behind by a process that died are all retried in place, on the same row, by an operator.
--    So the guarantee is exactly "a completed action is never completed twice" — which is the
--    one that matters, since a delivery that failed has to stay retryable or one bad afternoon
--    cancels that occurrence forever.
-- 3. **Two account columns, and both indexes are needed.** `account_id` is the pointer,
--    nullable and ON DELETE SET NULL so an account stays deletable; `account_owner_email` is
--    history, written once and never updated. An action that hands out a voucher must not be
--    farmable by deleting an account and signing up again — that is what the email index
--    closes, and the pointer's index cannot, because deletion nulls it.
--
-- No backfill and nothing to migrate: the table is born empty, and an installation that never
-- runs an action keeps it empty.

CREATE TABLE "outreach_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer,
  "account_owner_email" text NOT NULL,
  "kind" text NOT NULL,
  "occurrence_key" text NOT NULL,
  "status" text NOT NULL,
  "channel" text NOT NULL,
  "detail" text,
  "reason" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "triggered_by" text
);--> statement-breakpoint

-- SET NULL rather than CASCADE: deleting an account must not erase the record that a voucher
-- was handed to that address, which is the whole point of the email index below. Same shape as
-- `paddle_events` and `coupon_redemptions`, and for the same reason — `deleteAccount` stays
-- possible throughout, which is what ruled out NOT NULL with either a cascade or a restrict.
ALTER TABLE "outreach_actions" ADD CONSTRAINT "outreach_actions_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;--> statement-breakpoint

-- One occurrence per live account. Partial, because a null pointer means «that account is
-- gone» and two gone accounts are not a collision — without the WHERE, a second deleted
-- account's row would be refused.
CREATE UNIQUE INDEX "outreach_actions_once"
  ON "outreach_actions" ("kind","occurrence_key","account_id")
  WHERE "account_id" IS NOT NULL;--> statement-breakpoint

-- And one per address ever, which is what a delete-and-recreate cannot get past. Unconditional
-- on purpose: this one has to hold for rows whose pointer is already null.
CREATE UNIQUE INDEX "outreach_actions_once_email"
  ON "outreach_actions" ("kind","occurrence_key","account_owner_email");--> statement-breakpoint

-- The account screen's own read: everything ever aimed at one account.
CREATE INDEX "outreach_actions_account" ON "outreach_actions" ("account_id");
