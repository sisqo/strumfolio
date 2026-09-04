-- Coupon campaigns (PLAN-coupons.md). Two tables, three nullable columns on `accounts`.
--
-- Written by hand, same reason as 0028 onward: `drizzle-kit generate` still refuses to
-- run against this schema's history. That also disposes of the one risk the plan flagged
-- for this migration — a generated partial unique index silently losing its `WHERE`, which
-- would turn `coupon_campaigns_one_default` into a unique index on `is_default` outright
-- and forbid a second *non-default* campaign. The predicate below is the intended one.

CREATE TABLE "coupon_campaigns" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "channel" text NOT NULL,
  "notes" text,
  "discount_percent" text NOT NULL,
  "discount_months" integer,
  "applies_to_lifetime" boolean DEFAULT false NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "usage_limit_subscription" integer,
  "usage_limit_lifetime" integer,
  "entry" text DEFAULT 'both' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "paddle_discount_id_monthly" text,
  "paddle_discount_id_annual" text,
  "paddle_discount_id_lifetime" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text,
  CONSTRAINT "coupon_campaigns_code" UNIQUE("code")
);--> statement-breakpoint

-- At most one live default campaign, as a database fact rather than a convention in the
-- action that sets it. Every row the predicate admits has `is_default` true, so uniqueness
-- on that single column admits exactly one; `archived_at IS NULL` is what makes it possible
-- to archive the current default and flag another.
CREATE UNIQUE INDEX "coupon_campaigns_one_default"
  ON "coupon_campaigns" ("is_default")
  WHERE "is_default" AND "archived_at" IS NULL;--> statement-breakpoint

CREATE TABLE "coupon_redemptions" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL,
  "account_owner_email" text NOT NULL,
  "code" text NOT NULL,
  "discount_percent" text NOT NULL,
  "plan" text NOT NULL,
  "cycle" text,
  "full_amount" text NOT NULL,
  "paid_amount" text NOT NULL,
  "discount_ends_at" timestamp with time zone,
  "redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- A foreign key on the campaign because a campaign is never deleted, only archived.
-- Deliberately **none** on `account_owner_email`, for the reason `paddle_events` has none:
-- `deleteAccount` has to stay possible, and a key here would either cascade away the record
-- of what somebody paid or make a paid account undeletable.
ALTER TABLE "coupon_redemptions"
  ADD CONSTRAINT "coupon_redemptions_campaign_id_coupon_campaigns_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "public"."coupon_campaigns"("id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- The load-bearing index of the whole feature: one redemption per account per campaign is
-- what makes `usage_limit_subscription` a ceiling that can be verified rather than
-- estimated — `times_used` becomes a COUNT(*) instead of a mirrored number — and it is the
-- only thing between a ceiling of 500 and one account burning all of it, which with
-- SONGBOOK_MOCK_CHECKOUT switched on costs that account nothing at all.
CREATE UNIQUE INDEX "coupon_redemptions_once"
  ON "coupon_redemptions" ("campaign_id","account_owner_email");--> statement-breakpoint
CREATE INDEX "coupon_redemptions_campaign" ON "coupon_redemptions" ("campaign_id");--> statement-breakpoint

-- The live answer to "what will this account pay next", as opposed to `coupon_redemptions`,
-- which is the ledger of what it already paid. Read only through `liveDiscount`, never in
-- the clear: `discount_ends_at` is a date that passes on its own, with no request there to
-- observe it, so a screen reading the raw column would go on promising a lapsed discount.
ALTER TABLE "accounts" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "coupon_percent" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "discount_ends_at" timestamp with time zone;
