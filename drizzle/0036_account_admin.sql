-- Admin fieldsets and actions (PLAN-account-admin.md). Two nullable columns on
-- `accounts`, nothing else — "Cambia email" needs no schema change, see the plan's
-- own "Fondamenta tecniche" section for why.
--
-- Written by hand, same reason as 0028 onward: `drizzle-kit generate` still refuses
-- to run against this schema's history.
ALTER TABLE "accounts" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "internal_note" text;
