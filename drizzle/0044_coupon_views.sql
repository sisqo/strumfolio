-- Who has *seen* a coupon, as opposed to who has redeemed one.
--
-- `coupon_redemptions` next door is the ledger of discounts actually given; this is the ledger
-- of discounts actually shown. Until now a coupon a reader landed with and did not buy on left
-- no trace anywhere but that reader's own browser: `applyCoupon`/`rememberUrlCoupon` write the
-- `songbook-coupon` cookie and nothing else, so nobody on this side could tell that an
-- advertisement had been clicked at all. This table is what makes «saw FOUNDER30 on the 3rd,
-- never used it» a sentence the Payments tab can print — and therefore a communication somebody
-- could decide to send.
--
-- Hand-written, not generated, same reason as 0028-0043's own notes: `db:generate` refuses to
-- run over the 0028-0030 snapshot collision.
--
-- Column order follows `schema.ts`'s field order, and `schema.ts` follows `coupon_redemptions`
-- field for field as far as the two tables agree — id, campaign, address, pointer, code — which
-- is what lets the two be read side by side in a SQL console. A `CREATE TABLE` is the one place
-- that order is free; an `ADD COLUMN` later appends, and Postgres cannot move a column back.
--
-- Three things a reader of this file from a SQL console should know:
--
-- 1. **One row per account per campaign, not one per page view.** `first_seen_at` is written
--    once and never touched again; `last_seen_at` moves on every later sighting. That is the
--    difference between a ledger an operator can read and a log that grows by a row every time
--    somebody reloads /pricing.
-- 2. **Whether it was redeemed is not a column here.** It is a left join against
--    `coupon_redemptions` computed at every read — the `campaignStatus`/`resolveSubscription`
--    rule this repo states in three places. A `redeemed` flag would need a reconciliation job
--    that has nowhere to live, and would be wrong from the first purchase that raced it.
-- 3. **Two account columns, and only one unique index.** `account_id` is the pointer, nullable
--    and ON DELETE SET NULL so an account stays deletable; `account_owner_email` is history,
--    written once and never updated, so a row still reads after the pointer is nulled. Unlike
--    `coupon_redemptions` and `outreach_actions` there is deliberately **no** unique index on
--    the address: those two hand something out and must not be farmable by deleting an account
--    and signing up again, whereas a row here grants nothing at all. Delete and recreate an
--    address and it may be recorded as having seen the same campaign twice, which is the truth.
--
-- No backfill and nothing to migrate: the table is born empty, and the coupons already seen
-- before this migration were never written down anywhere to recover them from.

CREATE TABLE "coupon_views" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL,
  "account_owner_email" text NOT NULL,
  "account_id" integer,
  "code" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- No ON DELETE at all, exactly as `coupon_redemptions` has none: campaigns are archived
-- (`archived_at`), never deleted, so this is the database refusing a deletion nobody performs
-- rather than a decision about what should happen to the rows.
ALTER TABLE "coupon_views" ADD CONSTRAINT "coupon_views_campaign_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "coupon_campaigns"("id");--> statement-breakpoint

-- SET NULL rather than CASCADE, for `outreach_actions`' reason: `deleteAccount` has to stay
-- possible, and the record that a campaign was shown to that address outlives the account.
ALTER TABLE "coupon_views" ADD CONSTRAINT "coupon_views_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL;--> statement-breakpoint

-- One row per live account per campaign, and the conflict target `recordCouponView`'s upsert
-- names. Partial, because a null pointer means «that account is gone» and two gone accounts
-- are not a collision — without the WHERE, a second deleted account's row would be refused.
-- The predicate is spelled here exactly as drizzle's `targetWhere` spells it, because Postgres
-- infers this index from that predicate: a difference of one character makes every upsert fail
-- with «no unique or exclusion constraint matching the ON CONFLICT specification».
CREATE UNIQUE INDEX "coupon_views_once"
  ON "coupon_views" ("campaign_id","account_id")
  WHERE "account_id" IS NOT NULL;--> statement-breakpoint

-- The account screen's own read: every coupon ever shown to one account.
CREATE INDEX "coupon_views_account" ON "coupon_views" ("account_id");
