# Coupons (`src/lib/coupons/`) — and what a coupon is *not* allowed to decide

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Percentage-off campaigns, native to Strumfolio: no Paddle client exists, so this repo is the
source of truth until one does. The load-bearing parts:

- `types.ts` — the vocabulary and every parser, with **no `@/lib/db` import** so client
  components can value-import it. `CAMPAIGN_FAILURE_MESSAGE` lives here for the `testCard.ts`
  reason: a `'use server'` module may only export async functions.
- `discount.ts` — pure, `node:test`-covered. `discountedAmount` works in **integer cents,
  never floats**, and its test holds the commercial deck's own 30% promo table as a fixture:
  all seven figures agree, so a rounding change names the row of the deck that stopped being
  true. `campaignStatus` is computed at every read — no `status` column, no sync job, the
  same precedent as `resolveSubscription`.
- **`discountCycles` vs `discountedMonths`** — adjacent names, different consumers, silent if
  swapped. Cycles feed the **copy** («the first year»); months feed **`discount_ends_at`**. A
  campaign of `3` months says "the first year" on a yearly card and stores a date twelve
  months out. The yearly cycle always rounds **up** to whole years, which is why
  `coupon_campaigns` has no `applies_to_monthly`/`applies_to_annual`: every campaign covers
  both cycles by construction.
- **`durationCopy` vs `termCopy`** — the second adjacent pair, and the same hazard as the one
  above: both word the same discount over the same `spanCopy`, and they differ in one thing.
  `durationCopy` **opens with the discounted amount** («€2.44 for the first 12 months, then
  €3.49.») and is for the three screens with no price above it — /checkout, the stored receipt,
  `planChangeEmail`. `termCopy` does not, because on a /pricing card that number is the line
  directly above the caption. Swap them and nothing fails: one screen says the price twice, the
  other stops saying it at all.
- **`liveDiscount` is the only way to read
  `accounts.coupon_code`/`coupon_percent`/`discount_ends_at`.** That date passes with no
  request there to observe it, exactly like `planExpiresAt`, so `subscriptionColumnsOf` never
  lets the raw columns out — it returns `{ subscription, discount }` already resolved.
- **`mockPurchase` reads the cookie itself and re-validates.** The coupon is never an
  argument: `CheckoutScreen` is `'use client'`, and a code travelling as a parameter is a
  self-service discount of any size while the mock checkout is live. The screen's `coupon`
  prop decides what is *printed*; `redeemableCouponFor` decides what is charged.
- **The cookie carries a code and nothing else.** Every read re-derives state, window, both
  ceilings and `entry` from the table (`read.ts`' header). Written by `rememberUrlCoupon`
  from an effect in `CouponBar` — not by the middleware, which runs on the edge where the
  database is unreachable, and not during a render, which Next.js forbids.
- **`coupon_views` records what was *shown*, `coupon_redemptions` what was *given*** — two
  ledgers, and the first exists because a coupon somebody landed with and did not buy on used
  to leave no trace outside their own browser. `views.ts` owns both ends of it: one row per
  account per campaign, `first_seen_at` written once and `last_seen_at` moved by a single
  upsert, so a reader reloading `/pricing` leaves a ledger and not a log. Whether it was
  redeemed is a **left join** computed at every read — never a column, the `campaignStatus`
  rule. Read on `/accounts/[email]`'s Payments tab (`CouponsSeenCard`), where `viewStanding`
  collapses the five campaign states into the only question being asked: redeemed, still open,
  or missed.
- **Three seams write a view, and each covers a hole the others leave.** `noteCouponView` from
  `CouponBar`'s effect on every mount — gated *on the server*, because `/pricing` is a public
  page and asking an anonymous visitor's session costs a round trip for the answer «nobody».
  `attachCouponViewFromCookie` from `auth.ts`'s `signIn` callback, since the ordinary way a
  coupon is seen is an advertisement clicked while signed out and the cookie outlives the
  sign-in. And the same function from `verifyEmail`, which never runs through that callback at
  all — it issues its own cookie. Drop the third and every email/password sign-up is recorded
  as having seen nothing.
- **Never resolve the account with `accountIdOf` when writing a view.** `coupon_views.account_id`
  is nullable (`ON DELETE SET NULL`) and `coupon_views_once` is partial on `WHERE account_id IS
  NOT NULL`, so a subquery yielding NULL for an unknown address writes an unreachable row that
  the index cannot see — the upsert silently becomes an insert and grows a row per page view.
  `ids.ts` says this of itself; it was still found by running the function against dev, not by
  reading it. Select the row and look at it.
- `coupon_redemptions_once` (unique on campaign + account) makes `usage_limit` a ceiling that
  can be *verified*: `times_used` is a `COUNT(*)`, not a mirrored number.
  `coupon_campaigns_one_default` is a **partial** unique index — confirm the `WHERE
  (is_default AND archived_at IS NULL)` predicate survives any regeneration, because without
  it that index forbids a second *non-default* campaign.
- **Struck prices appear only while a coupon is applied.** That conditionality is the legal
  argument, not a styling choice: the deck rejects a reference price never charged, and what
  answers it is that the listino is genuinely what a reader without a coupon pays. The
  guardrail nothing enforces: `expires_at` is nullable by decision, so `/coupons` marks every
  active campaign that has none and counts the days the `?promo=1` one has been running.
- The Lifetime's own promo mechanism is **gone** — `LIFETIME` lost `originalAmount`,
  `closesOn` and `closesOnLabel`. Whether it is in the catalogue is the `lifetime.on_sale`
  row in `app_settings`, flipped from `/app-settings`.
