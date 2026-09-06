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
