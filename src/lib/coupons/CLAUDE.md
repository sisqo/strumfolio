# Coupons (`src/lib/coupons/`) — and what a coupon is *not* allowed to decide

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

Percentage-off campaigns, native to Strumfolio. **This repo decides *whether* a discount is
owed and Paddle applies it** — a campaign row here is translated into two or three Paddle
Discount entities (`paddleDiscount.ts`), and it is those that take the money off. The
load-bearing parts:

- `types.ts` — the vocabulary and every parser, with **no `@/lib/db` import** so client
  components can value-import it. `CAMPAIGN_FAILURE_MESSAGE` lives here for the sibling-module
  reason the root `CLAUDE.md` gives: a `'use server'` module may only export async functions.
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
- **The write path reads the cookie itself and re-validates.** The coupon is never an
  argument: `PaddleCheckout` is `'use client'`, and a code travelling as a parameter is a
  self-service discount of any size. The screen's `coupon` prop decides what is *printed*;
  `redeemableCouponFor` (a plain sibling of `checkout.ts`, for the reason above) decides what
  is charged — and what it hands Paddle is a `dsc_…` id, never a code. `enabled_for_checkout:
  false` means Paddle generates none, so there is nothing to type and nothing a parameter could
  carry.
- **The refusal is narrowed, not lifted** (2026-09-14). It used to be «a redeemable coupon
  exists → refuse the sale»; it is now «this plan and cycle have no `dsc_…` → refuse the sale»,
  and every failure mode in the feature lands on it: a sync that never ran, one that failed, a
  campaign that covers no Lifetime, a cycle whose three prices could not all be named. **A
  coupon never causes a sale at the listino**, which is the single invariant the whole design is
  arranged around — the shown-price/charged-price gap inverted into the direction that takes
  *more* money than was advertised is the one version of it nobody can be asked to accept.
  `changePaddlePlan` still refuses outright, and for a stated reason: a recurring discount
  survives a plan change on its own, so what is left is a code never redeemed, and the two
  sentences that say what a change costs (`changeCostLine`, `scheduledChangeLine`) know nothing
  about discounts.
- **Two entities per campaign, three when it covers the Lifetime — all from one row.**
  `maximum_recurring_intervals` counts billing periods and `discount_months` is months, so one
  entity cannot hold both numbers — `discountCycles` derives each. That is the reference document's `ABC`/`ABC-Y`/`ABC-LT` terna,
  reappearing as three columns on one row rather than three rows to keep in step. **Measured
  2026-09-14**: a 30% discount restricted to Standard monthly turned €3.49 into €2.44, the
  cent-for-cent figure `discountedAmount` computes; and three intervals on a monthly
  subscription came back `starts_at 2026-10-13` / `ends_at 2027-01-13`, which is `discountEnd`'s
  own arithmetic. That second measurement is why `accounts.discount_ends_at` is **computed at
  redemption and never read back from Paddle**.
- **`restrict_to` is all-or-nothing per kind.** A monthly discount restricted to two of the
  three monthly prices attaches to the third's transaction happily, matches no item, and charges
  the listino — with no error anywhere, because from Paddle's side nothing went wrong. So a kind
  whose every price cannot be named is not created at all.
- **`coupon_redemptions` has its writer back** (2026-09-14, `recordCouponRedemption` in
  `plans/webhookApply.ts`) — the condition this file used to state, that the insert «has to come
  back in the same commit that lets a coupon be sold, or every campaign ceiling is silently
  uncapped». **The insert is also the clock**: Paddle carries a transaction's `custom_data` onto
  the subscription it opens, so the campaign stamp arrives on every renewal, and what separates
  the first payment from the ninetieth is `coupon_redemptions_once` taking a row once. The three
  `accounts.coupon*` columns are written only when it did — and *cleared* by a purchase carrying
  no coupon, never by a renewal (`isNewPurchase`, which reads Paddle's `origin`). Measured on
  fifteen delivered sandbox notifications, 2026-09-14: `origin` is on every one, a purchase
  through this checkout is `api`, a change of plan is `subscription_update` — and that one's
  `custom_data` carried `downgrade` beside `account_id`, i.e. the *subscription's* object, which
  is the travel this whole arrangement is built against.
- **Every campaign that existed before 2026-09-14 has no discounts and refuses every sale until
  somebody presses «Sync».** That is by design and looks exactly like a bug: nothing errors,
  nothing overcharges, the code simply never applies. `/coupons` marks each such row, and
  `resyncCampaign` is the only path that builds them — the write path only syncs a campaign it
  is saving. Worth doing deliberately after a deploy rather than discovering from a conversion
  rate.
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
- **Nothing is advertised to a reader who is carrying nothing** (since 2026-09-11).
  `advertisableCampaign()` is **gone**: it returned any live campaign whose `entry` allowed a
  typed code, and the overlay drew it for every visitor on `/`, `/pricing` and `/checkout`, with
  no parameter in the URL. A campaign is now shown only to somebody who arrived with its link —
  `activeCoupon` on `/` for the overlay, `CouponBar` on the other two — and to that same browser
  afterwards for as long as the campaign runs, which is a session that *did* arrive with it and
  not an exception. **"As long as the campaign runs", not thirty days**: see the bullet below.
  - **Do not re-derive advertising from `entry`.** That was the design this replaced, and it
    conflated two questions: `entry` says how a coupon may be *entered*, not whether it should be
    *promoted*. `HAPPYSONG` is `entry: 'both'` precisely so a reader who noted the code down can
    type it, and setting it to `'url'` to silence the overlay would have taken that away. If
    per-campaign advertising is ever wanted again it needs a column of its own, not a fourth
    `entry` value.
  - **The public home cannot read its own query string**, and this is the only place that matters.
    `Landing` is drawn by `app/(home)/layout.tsx`, and a layout is never given `searchParams`, so
    `/?promo=1` — where campaign links point — is invisible to it. `LandingOffer` reads the
    parameter on the client and calls `rememberUrlOffer`, which resolves it through the same
    `activeCoupon` and writes the cookie; the next render draws the overlay. It refreshes only
    when the stored code differs from the one the server already rendered from, or the refresh
    loops.
- **The cookie is not the memory** (since 2026-09-11). `songbook-coupon` lives for
  `min(COUPON_COOKIE_MAX_DAYS, what is left of the campaign)`, and the thirty days are Google
  Ads' *attribution* window — chosen so the cookie and the conversion figure describe the same
  period, which is a reporting decision and never was a judgement about how long an offer should
  keep being shown. So on day thirty-one a reader who had clicked an advertisement was served the
  full listino with the campaign still live. `CouponMemory` is the half that outlives it: it keeps
  the code in `localStorage` and hands it back to `rememberUrlCoupon`, which writes the cookie
  again. **The asymmetry is deliberate — do not "fix" one to match the other.**
  - **Only a campaign a link could bring back is remembered**, which is `restorableCode` and the
    reason it is a function rather than an expression on each of the three pages. The restore
    re-enters by `rememberUrlCoupon`, `entryAllowsUrl` check included, so it can never grant more
    than the original link did — which matters, because unlike the cookie this value is writable
    by anything running on the page. A typed-code-only campaign stored here would be refused on
    every restore and never work.
  - **One attempt per browsing session**, marked in `sessionStorage`. `rememberUrlCoupon` answers
    a bare boolean and cannot tell a campaign archived yesterday from one opening tomorrow, so
    forgetting the memory on a refusal would throw the second away — and never forgetting, with no
    marker, would spend a round trip on a dead code at every page load for ever. The memory is
    therefore kept indefinitely and only «Remove» deletes it (`forgetOffer`, from `CouponBar`).
    **That call is load-bearing**: without it «Remove» works until the reader's next visit, which
    is the «Remove» bug `withoutCouponParams` already exists for, on a longer timer.
  - **`songs:coupon` is the third `DEVICE_KEYS` exemption** in `lib/storage/scope.ts`, after
    `songs:theme` and `songs:scope`, and the only one whose entire audience has no account to be
    scoped to — `keyFor` answers `null` with no session, and somebody who has just clicked an
    advertisement has none. The argument for it is written out there; the short form is that a
    publicly advertised code describes the browser and not the person, and authorises nothing.
    It survives sign-out for the same reason.
  - **Safari caps script-writable storage at seven days** without user interaction, so this is
    *additive* to the httpOnly cookie and not a replacement for it. Keep both.

- **Struck prices appear only while a coupon is applied.** That conditionality is the legal
  argument, not a styling choice: the deck rejects a reference price never charged, and what
  answers it is that the listino is genuinely what a reader without a coupon pays. The
  guardrail nothing enforces: `expires_at` is nullable by decision, so `/coupons` marks every
  active campaign that has none and counts the days the `?promo=1` one has been running.
- The Lifetime's own promo mechanism is **gone** — `LIFETIME` lost `originalAmount`,
  `closesOn` and `closesOnLabel`. Whether it is in the catalogue is the `lifetime.on_sale`
  row in `app_settings`, flipped from `/app-settings`.
