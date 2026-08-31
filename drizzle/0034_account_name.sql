-- First and last name, on both the account itself and a still-pending registration
-- (PLAN-account-name.md). Both nullable on both tables — `accounts` because there is
-- no retroactive value for a row that predates these columns, and
-- `pending_registrations` because a `NOT NULL` column added here without a default
-- would fail against a row already pending at deploy time; `register()` is what
-- actually requires both non-empty before it writes there.
--
-- Snapshot warning (see 0031-0033's own notes, and PLAN.md Domande aperte #19):
-- `db:generate` still refuses to run, 0028/0029/0030 sharing one id and prevId. This
-- file and its journal entry were written by hand, the same way 0024-0033 were.
ALTER TABLE "accounts" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "pending_registrations" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "pending_registrations" ADD COLUMN "last_name" text;
