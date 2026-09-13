# Plans, entitlements and the Paddle checkout (`src/lib/plans/`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- `types.ts` — `Plan`, `PLANS` (the limits table), `PLAN_RANK` (generosity order, not price).
- `prices.ts` — `PRICES`, `LIFETIME`; separate from `types.ts` because a price changes on a
  different clock than a limit does.
- `entitlements.ts` — `resolveSubscription`/`liveSubscription`: pure functions collapsing a
  scheduled downgrade or cancellation the instant `now` passes its date. Called at every read
  site instead of a cron job — there is no background job anywhere in this repo.
- `checkout.ts` (`'use server'`) — **six loaders and nothing else.** It writes no plan columns
  at all any more: `loadCheckoutStatus`, `loadPurchaseSummary`, `loadThanksPreview`,
  `loadMyPaymentHistory`, `loadFreezeState`, `activatePlanChoice`. The writers live beside it,
  one file per act — `paddleCheckout.ts` (buy), `paddlePlanChange.ts` (move),
  `paddleSubscription.ts` (cancel, keep) — and every one of them leaves the *columns* to
  `webhookApply.ts`, which is the single writer.
- `resolve.ts` — `plansEnforced()` (`SONGBOOK_PLANS=on`) gates enforcement, and
  `paddleCheckoutEnabled()` answers whether this deployment can take money. The second is not a
  flag: it is true when `PADDLE_API_KEY` and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` are both present,
  so **configuration is the switch** and there is no state where the environment says yes and the
  integration says no. One consequence worth knowing before it bites: `/pricing` reads it **once
  at module scope**, so it is baked into the build. Adding `PADDLE_API_KEY` to an environment
  with no code push leaves the buy buttons absent until a `vercel redeploy` — the env-var trap
  the root `CLAUDE.md` already describes, now applying to whether anything is on sale. `SONGBOOK_PLANS` is not a security boundary and never was.

## The mock is gone (2026-09-13)

`mockPurchase`, `mockCancel`, `clearPendingChange`, `forceExpireNow`, `loadMostRecentCycleFor`,
`CheckoutScreen.tsx`, `ForceExpireRow.tsx`, `forceExpireMessage.ts`, `testCard.ts`,
`mockCheckoutEnabled()` and `SONGBOOK_MOCK_CHECKOUT` — all deleted. It was a placeholder that was
never designed, so nothing about it was treated as a specification to preserve; what survives
survives because it is right for a real integration, not because the mock did it.

Three things about the demolition are worth knowing rather than rediscovering:

- **`/checkout/[plan]` has no fallback branch now, deliberately.** A checkout that cannot take
  money is not a lesser checkout, it is a screen that asks for a decision it cannot honour. An
  environment without Paddle configured says so in a sentence.
- **What the mock did that Paddle does not, and that now lives in the webhook**: the operator's
  Telegram line and the customer's confirmation email, both in `announcePayment`
  (`webhookApply.ts`), on `transaction.completed` only and only on a first delivery. Kept on
  their own merits, not for parity — Paddle is Merchant of Record and sends its own invoice,
  which names a price and a product; which *plan* you now have and until when is this app's
  sentence to write, and nobody else holds both facts.
- **What is simply gone**: `forceExpireNow`, the operator's «expire this plan now» row on
  `/accounts/[email]`. It had no Paddle counterpart — nothing can make Paddle believe a period
  ended early — so the freeze path is no longer exercisable without waiting out a real date, or
  writing the column by hand. That is a real loss of an operator capability, stated here rather
  than discovered.
- **`logMockEvent` is deleted but `fromMockPayload` (`history.ts`) is kept.** Nothing writes the
  mock's flat payload any more; rows in that shape are still in the development database, and a
  reader that stopped understanding them would render them as bare «Event» lines with no amount.
  The ledger's job is to have the event.
- `SONGBOOK_FORCE_PLAN` — a deliberately risky local-only escape hatch (forces every read to
  one plan); never meant to run in production.

## What the reader is told before the press, and the press after the press (2026-09-14)

`changeSummary.ts` builds it, `PaddleCheckout` renders it above the button, `PlanChangeConfirm`
renders **the same object** in a dialog. Three things are worth knowing rather than rediscovering:

- **The summary is one object rendered twice, deliberately.** A confirmation dialog written as a
  second description of the screen is a second copy of the copy, and the day one is edited it
  starts lying about the other. The dialog therefore writes no sentence of its own — and the
  headline is not written in `changeSummary` either, but chosen among `callOffLine`,
  `scheduledChangeLine` and `changeCostLine`, which already own those three sentences and the
  arguments for their wording.
- **The next charge was missing from the screen entirely, and it is the fact the reader is
  actually deciding about.** Every waiting change costs nothing today — true, and the least
  informative true sentence available, since it says the same thing about a move to Standard and
  a move to Plus. `nextChargeOf` is where the figure comes from, and it comes from **two**
  places: Paddle's own preview normally, and the listino when `pinBillingDate` is set. That
  second branch is not a shortcut — Paddle's preview there describes the period *restarted* by
  the first call, which the second call is about to move, so quoting it would tell a reader their
  next bill is up to a year later than it is. Confidently sourced and wrong is worse than absent.
- **The dialog does not re-price, and the guard is at the other end.** A second preview would put
  a spinner between the press and the question and could answer differently for reasons nobody
  can see. Instead `changePaddlePlan` decides again server-side at the moment of the press, and
  the sentence the reader is left with is built from **its** answer — so a change that lands
  differently from the quotation (a preview gone stale while they read, a renewal that fell due
  in between, the thirty-minute window Paddle refuses changes inside) reports what happened
  rather than what was promised.

Two smaller rules that are easy to undo by accident. `planWithCycle` names both sides of the
move in full — the opposite of `changeNames`, and right here: a row is read beside its neighbour
and must stand alone, where a sentence may say only what moves. And **the buy path gets no
dialog**: Paddle's own overlay shows the price before it takes anything and is itself the second
look, so a dialog in front of it would be a dialog in front of a dialog.

## Money going back: `adjustment.*`, and why it only ever touches the Lifetime (2026-09-14)

- **Paddle revokes for us on every subscription, and nobody had written that down.** It cancels a
  subscription itself when one of its transactions is charged back, and again when a customer
  exercises the EU right of withdrawal — its own subscription-history log records the two reasons
  as `chargeback` and `eu_withdrawal`. That cancellation arrives as `subscription.canceled`, which
  `statusOf` has always read as `expired`. So E8 and E9 were already covered for subscribers, by
  Paddle's behaviour rather than by design. **Documented, never observed** — say it that way until
  somebody drives a real refund in the sandbox, because four rows of `CASES.md` rest on it.
- **The hole was the Lifetime**, and it is the whole reason `adjustmentEffect` exists. A one-off
  purchase has no subscription for Paddle to cancel, so a refunded or charged-back Lifetime
  produced nothing this app acted on, and the account kept — for ever — a plan it had been given
  its money back for. Nothing later would ever have contradicted it.
- **The gate is `subscription_id` on the adjustment**: present means Paddle's business, absent
  means ours. Same rule `transactionEffect` already applies to renewals, pointed at the other
  event. Without it, a partial refund of one renewal — a goodwill gesture — would end a live
  subscription.
- **One column, not four.** Revoking writes `planStatus: 'expired'` and leaves `plan` alone: what
  somebody bought is a fact about the past, the other columns describe a subscription an
  adjustment says nothing about, and `plan` surviving is exactly what lets `chargeback_reverse`
  give it back by writing `active` over the top. The same reversibility argument as B9.
- **Two decisions, stated because they are not derivable.** Only a *wholly* full adjustment
  revokes — `type` is per item and there is no adjustment-level «full», so a partial refund that
  happens to add up to the whole price does not revoke, which is the safe side. And a refund is
  acted on only once `approved`: refunds are created `pending_approval` and may be rejected, so
  acting on `adjustment.created` alone would take a plan away over a request Paddle turns down.
  Chargebacks carry no such gate — Paddle creates them already applied.
- **The destination has to carry the events or none of this fires.** `adjustment.created` and
  `adjustment.updated` were added to the sandbox preview destination on 2026-09-14 (it had nine
  event types and neither of them); **the live destination does not exist yet and must be created
  with them**. This is the silent failure the root `CLAUDE.md` already warns about in general —
  a handler nothing ever calls, with no error anywhere to find.

## `CASES.md` is the index of the cases, and it is checked by the build

Beside this file. One row per case of `strumfolio-upgrade-downgrade-paddle.md` — all forty-one,
A1 to F6 — saying what we do, which test covers it, and whether anybody has ever seen it happen
against Paddle or in a browser. It is an index and not a second description: the reasoning stays
here and in the module comments, written once.

**It is not a PLAN file and `cases.test.ts` is what keeps it from becoming one.** That test runs
in `npm test`, insists every case id is present exactly once, and resolves every test name the
document cites against the file it names — so a renamed test breaks the build instead of leaving
a citation that reads like coverage and points at nothing. Same defence as
`lib/auth/gatedRoutes.test.ts`, aimed at a different kind of forgetting.

Two habits it is worth keeping: decide a case, and the row moves in the same commit; watch one
work for real, and the «Dal vivo» cell gets the date. The column is mostly `mai` today, and that
is the honest state rather than an omission.

## What Paddle already decides, and what it does not yet

The sandbox catalogue exists since 2026-09-12 — the ids, the tax argument and the three MCP
servers are in the root `CLAUDE.md`, because losing them costs more than a path lookup. Two
consequences land in *this* directory:

- **`paddleId` holds the *live* price id and only that** (decided 2026-09-12). One string
  cannot carry two environments, and the sandbox ids are the wrong half to keep: the
  verification script the field exists for would then interrogate the sandbox catalogue from
  production — the id-shaped-string-that-resolves-to-nothing failure the empty string was
  chosen over `'pri_TODO'` to prevent. All seven are still `''` because no live catalogue
  exists yet, and a *sandbox* checkout reads its ids from the environment rather than from
  here. What the decision costs is nothing on the verification side and one env lookup on the
  checkout side, which is the cheaper end of the trade.
- **`catalogue.ts` is that verification, and `scripts/verify-paddle-catalogue.ts` runs it.**
  The comparison is pure and tested (`catalogue.test.ts`), so the rules live somewhere `npm
  test` can reach them; the script is fetching and printing. It checks more than the amount,
  because the amount is not the only way a shown price and a charged price come apart — a
  price that stopped being tax-inclusive charges the listino *plus* VAT with every amount
  still matching, which is the case the tests single out. **Exit 2 means nothing was
  verified**, the state a live run is in today: an all-unwired run must not be reportable as
  agreement. Sandbox is matched on the `{plan, cycle}` stamped into each price's
  `custom_data`, so `--sandbox` needs no ids and no configuration — and since this repo holds
  no Paddle credential, the catalogue is fetched through the MCP server and handed over with
  `--from`.
- **Coupons have no counterpart in Paddle at all.** `discountedAmount` (`lib/coupons/`)
  reproduces all seven figures of the commercial deck's promo column, and not one of them is
  backed by a Paddle Discount object. That is the same shown-price-versus-charged-price
  invariant the listino itself now satisfies — measured, in the root section — left unsatisfied
  one level down: a live campaign changes what `/pricing` says and nothing whatsoever about
  what a real checkout would take. **No longer harmless**: the mock is gone and the Paddle
  checkout is the only one, so `startPaddleCheckout` and `changePaddlePlan` both refuse the sale
  outright (`coupon-unsupported`) while a campaign is redeemable, rather than charging the
  listino to somebody who has just been promised 30% off. That refusal is the gate that
  disappears when campaigns carry a `paddle_discount_id`.
  **It reads the cookie and nothing else, on purpose — so every screen that shows a coupon has to
  write the cookie.** `redeemableCouponFor` takes the code from the request's own jar because
  nothing client-side may reach a decision about money; the consequence is that a screen showing
  a coupon applied from a *URL* must also persist it, or the two halves read different sources.
  `/checkout/[plan]` did not until a review on 2026-09-14, so a reader arriving straight on
  `/checkout/plus?coupon=X` — never having passed through /pricing — was shown the discount and
  then sold at the listino. Both pages pass `persist` now.

## The webhook: what an event is allowed to conclude

`webhook.ts` is the mapping — pure, `node:test`-covered, reading Paddle's wire format —
and `webhookApply.ts` is the database half. The route and the two SDK traps behind it are in
the root `CLAUDE.md`. What belongs here is what the rules *decide*:

- **Every unreadable thing answers "changes nothing", never "free".** An unstamped or
  unrecognised price makes `planOfPrice` answer `null`, and an unknown Paddle status reads as
  `active`. Both are the asymmetry `readPlan` and `readPlanStatus` already argue for, pointed
  at a webhook: an unreadable plan must never grant, and an unreadable status must never
  revoke. `readPlan` is deliberately *not* used on a payload — its fallback to `'free'` would
  turn a renamed price into a silent cancellation.
- **`past_due` and `paused` both become `grace`.** A failing card is not a lapsed customer and
  a pause is not a cancellation, and `grace` ignores dates entirely — which `resolveSubscription`
  explains is exactly why it exists, since by the time a payment has failed the paid period is
  virtually always already over. There is no fourth `PlanStatus` for a pause, on purpose.
- **The expiry written is always `current_billing_period.ends_at`** — the end of the period
  *now paid for*. `liveSubscription` states the requirement this satisfies and it is
  unguessable from outside: a past `expiresAt` ends a subscription even while the status still
  says `active`, so a renewal recorded with anything later than period end downgrades a paying
  customer for that window.
- **The Lifetime arrives as `transaction.completed` and nowhere else**, and only when the
  transaction carries **no** `subscription_id` — every renewal completes a transaction too, and
  acting on both would have two writes racing over one row with the newer expiry possibly
  losing. Its `expiresAt` is `null`, meaning never.
- **The account contract, which the checkout has to satisfy**: `custom_data.account_id` (the
  numeric `accounts.id`), then `accounts.paddle_subscription_id`, then
  `accounts.paddle_customer_id`. Only the first works on a *first* purchase, when neither
  column has been written — so **the checkout must stamp the account id onto the transaction**.
  Numeric and not the email, per `db/CLAUDE.md`, and because an address in Paddle's records
  goes stale the day somebody changes theirs.
- **Idempotency is `paddle_events.event_id` being the primary key**, not a second ledger:
  Paddle re-sends the same id on every retry, so the insert is the dedup and a conflict means
  "already applied, answer 200". The insert and the account update share one transaction,
  because an event recorded by a delivery whose write then failed would be skipped by the retry
  and the account would never change at all.
- **`granted*` is never touched**, a standing decision older than this file: a gift
  lives in those columns and a renewal re-asserting `plan`/`planStatus` would erase it.
- **Paddle cannot schedule a downgrade**, and the next section says what was done about it.
  `scheduled_change` is only `cancel`, `pause` or `resume`, so a cancellation maps cleanly onto
  `pendingPlan: 'free'` and a move to a *cheaper paid plan* has nothing to map from — it is
  carried in a `custom_data` stamp instead. So `pendingPlan` has two sources on the Paddle path:
  `'free'` from a scheduled cancellation, and a plan from the stamp. When both are present the
  cancellation wins.

## Changing the plan on a subscription that exists (2026-09-13)

`planChange.ts` decides, `paddlePlanChange.ts` does the I/O, and the `subscribed` branch on
`/checkout/[plan]` is what routes a reader to one rather than the other. Everything below was
measured against the sandbox with `subscriptions.preview` and one reversible `cancel`/clear
round trip, not read off the documentation.

**Run end to end on 2026-09-13**: the sandbox subscription was moved premium/year →
standard/year by the same sequence this code performs, `current_billing_period` stayed on
2027-09-12, one item came back where one went in, and the `subscription.updated` that followed
was delivered to the preview webhook on the first attempt. What that run does **not** prove is
the screen: reaching `/checkout/[plan]` on preview needs a signed-in session, so the
`subscribed` branch and the «Switch to …» button have been type-checked and built but not yet
watched working by anybody.

- **CASO B2 — a downgrade of tier keeps the plan that was paid for until the period ends**, and
  the mechanism is worth knowing exactly, because nothing about it is what the API suggests.
  Paddle cannot schedule a change of plan (`scheduled_change` is `cancel`/`pause`/`resume`), so
  the items are moved **now** with `proration_billing_mode: do_not_bill` — no charge, no credit,
  `current_billing_period` untouched, and the next renewal billing the new lower price by
  itself. Measured with `previewUpdate` on 2026-09-13: `update_summary: null`, no immediate
  transaction, period unchanged, items after = the new plan — and the nested `downgrade` object
  came back **verbatim**, every key as it was sent. That last one is the mechanism's one real
  assumption and it is now measured rather than trusted: the SDK converts a request body to
  snake_case but leaves `customData` alone, and the stamp's keys are written snake_case anyway,
  so it survives either behaviour. **No cron, no renewal webhook, no
  scheduler** — which is what killed the alternative of holding the change app-side, since until
  such a scheduler ran Paddle would renew at the old, higher price.
  - What Paddle then has wrong is the *entitlement*: its items say Standard while the customer
    holds Premium. The missing half is a `downgrade` stamp merged into the subscription's
    `custom_data` — `{from_plan, from_cycle, at}`, written by `downgradeStamp` and read by
    `readDowngradeStamp` (`webhook.ts`, tested both ways round). `subscriptionEffect` turns it
    into `plan` = the paid plan, `expiresAt` = the stamp's date, `pendingPlan` = the items' plan,
    and `resolveSubscription` collapses that on the day by pure reading.
  - **Nothing ever clears a stamp**, so it is retired by the period's own `starts_at`: a renewal
    opens a period beginning where the paid one ended, and `starts_at >= at` means the downgrade
    has landed. No clock is read on either side, which is what keeps the webhook and the screen
    from disagreeing about the day. The renewal is the case nobody exercises by hand for a
    month, so it is the test that matters most in `webhook.test.ts`.
  - **`custom_data` is replaced wholesale by an update, never merged**, so every write goes
    through `customDataFor` (`paddleAccount.ts`): `account_id` rides in the same object and is
    the only way a *first* event finds its account. Dropping it produces `unmatched` events, not
    an error. `downgrade: null` is written on every other kind of change, so a stale stamp
    cannot outlive the move that ended it.
  - **B6 and B8 are the same rule with the cycle moving too**, and cost only the extra call B4
    already pays for. There is no branch for them: every drop in tier is `do_not_bill` and
    `period-end`, and `pinBillingDate` follows from whether the frequency moves.
- **CASO B7 — un aumento di Tier che accorcia il ciclo aspetta comunque** (decided 2026-09-14),
  and it is the case that turned four rules into one. Standard yearly → Premium monthly *raises*
  the tier, so it read as an upgrade and was billed on the spot — and what `prorated_immediately`
  does to the paid year on the way is credit whatever is left of it. **Paddle issues that as
  account credit, not as a refund to the card**, which is the one detail worth stating precisely:
  no money leaves the business that day, but it is money owed back, sitting against monthly
  invoices that would take the best part of a year to absorb and lost to the reader entirely if
  they leave before then. Either way it is the opposite of what the rest of this directory
  promises. So the rule is now stated by *direction of money*: **a change that would give money
  back waits for the period already paid for; only a change that takes money happens now.**
  - **It is the one waiting case where the reader is asking for more and is made to wait**, so
    the screen says so plainly before the press: you keep what you paid for until the day, and
    the bigger plan starts then, billed monthly. Every other waiting case is in the reader's
    favour; this one is not, and pretending otherwise in the copy would be the drift this file
    exists to stop.
  - **The alternative was weighed and not built**: grant the tier now at the *yearly* price,
    take the prorated difference, and turn the billing monthly at the renewal. That collects
    money instead of owing it and gives the reader what they asked for the same day — but it is
    three Paddle calls and a second kind of stamp, one carrying a cycle with no plan beside it.
  - **The failure mode is the safe one, unlike every other waiting case.** If the stamp is ever
    lost or unreadable the code «believes the items», which here means granting the *higher*
    tier early — features given away, where losing a downgrade's stamp takes away a plan
    somebody paid for.
  - **`pendingDowngrade` now sometimes holds a plan that ranks *above* the live one.** The name
    is the stamp's history, not a claim: `readDowngradeStamp` never compared ranks and
    `resolveSubscription` only swaps to `pendingPlan` on the date, so both carry a rise without
    a change. What does read the direction is `direction`, which stays honest (`upgrade`) while
    `when` is the field the screens branch on — do not use one as a proxy for the other.
- **Two proration modes are used and there is deliberately no third.**
  `prorated_next_billing_period` was used for downgrades and is gone: it repays in *money* on the
  next invoice where this product repays in *time*, and Paddle refuses every deferred mode on a
  change of billing frequency anyway, so the cases that most needed it could never have used it.
  What is left is one rule with two halves — **what the reader pays more for happens now and is
  billed now; what they pay less for happens at the end of the period already paid for, and
  bills nothing at all.**
- **CASO B8 was decided, not derived** (2026-09-13). Premium monthly → Standard yearly could be
  billed today, a whole year up front, and the analysis document proposed exactly that because
  the cash arrives sooner. Decided the other way: «a downgrade is never immediate» was already
  written down as a rule, and the single exception where the exception collects more money is
  the kind a customer notices. So B2, B4, B6, B7 and B8 are now one sentence rather than five
  cases — and B7 is what forced that sentence to be about money rather than about tiers.
- **CASO B4 — yearly to monthly keeps the whole paid year, and costs one extra call.** Same
  shape as B2 with one measured difference that decides everything: **`do_not_bill` preserves
  the billing period only while the frequency is unchanged.** Moving a subscription between the
  monthly and the yearly price *restarts* it even under `do_not_bill` — measured 2026-09-13, a
  monthly subscription with three weeks left came back with `next_billed_at` a year out. Applied
  to year→month that would bill the reader again next month and throw away the rest of a year
  they had paid for, which is the whole of the harm this case exists to prevent.
  - **`next_billed_at` is the repair, under two rules that are measured and not documented**: it
    is silently **ignored** when it travels with an items change, and **refused outright** when
    it travels alone («Invalid request») — it needs a `proration_billing_mode` beside it. So B4
    is two calls: items with `do_not_bill` and the stamp, then `next_billed_at` with
    `do_not_bill` and nothing else. Both bill nothing.
  - **Measured end state**, which is exactly the promise: `billing_cycle` monthly,
    `current_billing_period` still ending on the paid year's last day, and `next_transaction` a
    **one-month** period starting that day. Paddle renews monthly from there with nothing having
    to run in between.
  - **The pin works in both directions, and B8 needs the backward one.** B4 moves the date
    *forward* (a monthly subscription pinned a year out); B8 moves it *back* — after its first
    call the items are yearly and the period has restarted a year out, and the date has to come
    back to the end of the month the reader actually paid for. Measured on 2026-09-13 by staging
    the real first call in the sandbox and previewing the second: accepted, nothing billed, the
    period ends on the paid date, and `next_transaction` is a **full year** of the new plan
    beginning that day. So the rule is one sentence — **`next_billed_at` says when the next
    cycle starts, and Paddle then bills one whole cycle of whatever items the subscription
    carries** — and it is independent of which way the date moves and of the item's own cycle.
  - **The middle state is the dangerous one**, so `applyItemChange` (`paddleApply.ts`) owns the
    sequence for both writers: it retries the date once, and if it still cannot be set it puts
    the items back and pins again. The rollback goes back to what Paddle *had*, never forward —
    a reader left on the plan they already bought is a failure nobody is charged for, and an
    early charge is not. **It also sends the operator a Telegram**, which it did not until a
    review on 2026-09-14 noticed that the cheapest failure on the Paddle path alerted and the
    only one that costs a customer money did not.
  - **Whether the date landed is `pinLanded`, with a minute of tolerance, and not equality.**
    That value makes a round trip through Paddle, and exact equality fails in the expensive
    direction: a pin that *worked* would read as failed, and the rollback would undo a change
    that had gone through while telling the reader it had not. What the check detects is a date
    that never moved, and an unpinned date is a whole cycle away — a month or a year — so the
    tolerance is enormous against the noise and still leaves the real failure no room. Pure and
    tested for that reason; everything else in that file is I/O.
  - **Both writers re-read the period from the call that clears a scheduled cancellation.**
    `changePaddlePlan` has done so since `22aac13`; `keepPaddleSubscription` did not until the
    same review, and it is reachable — a reader who arranged a change of cycle *and* cancelled
    has both undos run on one press, and the second was pinning to a day read before Paddle had
    touched the row twice.
  - **The period is re-read from the call that clears a scheduled cancellation**, never from the
    snapshot taken before it. Everything downstream pins a date — the stamp promises the reader a
    day and `pinBillingDate` writes that day into Paddle — so believing a snapshot over Paddle's
    own answer would end the paid year on the wrong day for anybody who cancelled and then
    changed cycle. Paddle answers every update with the updated subscription, which removes the
    question instead of settling it by measurement.
  - **`pinBillingDate` is measured against the cycle Paddle's items carry, not the paid cycle.**
    A tier change made on top of an already-arranged change of cycle moves the frequency back,
    and reading `from.cycle` there would lose the paid period at the second press, silently.
  - **A change that bills nothing may replace what is already arranged; a priced one may not.**
    That is the line between B4 (allowed over a pending change, last one wins — C2) and B3
    (refused, because its figure would be computed against items that have already moved).
  - **A cycle change has to be named by its cycle.** `changeNames` (`subscriptionCopy.ts`) is
    that rule: with the tier unchanged, «you keep Premium until 13 September 2027 and move to
    Premium that day» is a false sentence, not merely a clumsy one. `SubscriptionState` gained
    `pendingCycle` so /billing can say «then billed monthly» for the same reason.
- **While a downgrade is arranged, `livePaddleSubscription` reports the plan that was *paid
  for*, not the items** — with `pendingDowngrade` carrying the other one. Comparing a further
  move against the items would read «back to Premium» as an upgrade and charge for a period
  already paid in full (case C1). Off that one rule hang: a return to the paid plan is a
  `revert` (`do_not_bill`, nothing owed either way, stamp cleared); a different, also-lower plan
  restamps from the paid plan, so the last one asked for wins and nothing compounds (C2);
  pressing the same downgrade twice is `already-scheduled` and **deliberately not `same`** —
  «that is the plan you are already on» is false while the paid period is still running, and it
  would be said on the checkout of the plan they are leaving *for*; and **everything else is
  refused**
  (`pending-downgrade`) until the reader calls it off. That refusal is a decision, not a gap:
  Paddle would price such a move against the cheaper items while the sequence that would
  actually run credits the dearer plan that was paid for, so quoting it would reopen the
  shown-price/charged-price gap this directory exists to close. Calling it off is one press —
  «Keep Premium» on /billing, which `keepPaddleSubscription` now understands as two different
  undos.
- **A cancellation beats an arranged downgrade** (C4): `pendingPlan` becomes `'free'`, because
  that is where the subscription is actually going, while the stamp still decides which plan is
  held until the date.
- **Direction is plan rank first, cycle only as the tiebreak.** Comparing amounts instead reads
  premium/month → standard/year as a *rise* — €9.99 becomes €34.99 — and would charge on the
  spot for a move made to spend less. With the plan unchanged, yearly is the upgrade.
- **CASO A — an upgrade inside one cycle costs the prorated difference, and Paddle does the
  netting itself.** Measured clean on 2026-09-13, Standard monthly €3.49 → Plus monthly €6.99
  mid-period: `credit −3.49`, `charge +6.99`, `result: charge 3.50`, with both lines on the
  immediate transaction. `prorated_immediately` is the right mode and the arithmetic matches the
  analysis document exactly. **An earlier reading of this was wrong** and is recorded because it
  cost a wrong answer to the user: a same-cycle upgrade observed *two minutes after a cycle
  change*, with a €99.85 credit already queued, charged the new plan gross and deferred the old
  plan's credit. That is the polluted case, not the rule.
- **The amount is shown before the press, and the button is refused until it is known.**
  `previewPaddlePlanChange` sends the identical body to `subscriptions.previewUpdate` that the
  write sends to `update`, so the figure on the screen is the figure on the card rather than a
  second implementation of Paddle's arithmetic. Two numbers are read and they answer different
  questions: `update_summary.result` is what the change *costs*, and the immediate transaction's
  `grand_total` is what leaves the *card*, which is smaller when the account already holds Paddle
  credit. Saying only one of them is how somebody concludes they were billed twice.
- **The subscription is read once, not twice.** `livePaddleSubscription` carries back whether a
  cancellation is already scheduled — plus the stamp, the period end and the `custom_data` —
  from the same fetch that read the status. A second
  `subscriptions.get` in the action would be a second snapshot, and a cancellation landing
  between the two is invisible to precisely the clear-first step below that exists to handle it.
- **`scheduled_change: null` cannot travel with anything else**: «you cannot combine updating
  schedule_change with other fields». So clearing a pending cancellation is a call of its own,
  and it must come **first** — a subscription carrying a scheduled change refuses the deferred
  proration modes outright, so a downgrade attempted before the clear fails for every reader
  who cancelled and changed their mind. Cancelling also nulls `next_billed_at`; clearing
  restores it.
- **Two calls are two `subscription.updated` events, and nothing here enforces their order** —
  stated as an accepted limitation rather than left to be found. `webhookApply.ts` writes
  whichever arrives last: no `occurred_at` comparison, no version column. The first of the pair
  carries the *old* items and the old stamp, so a reversed delivery leaves the account on the
  state before the change. It was true of the items alone before B2 and is worth more now,
  because the stale state includes an entitlement claim with a date on it. Paddle delivers in
  order in practice and both events are seconds apart; the fix, if it is ever wanted, is a
  comparison against the last applied `occurred_at` for the same subscription.
- **A change of plan within one cycle leaves `current_billing_period` alone; a change of
  *cycle* restarts it.** premium/year → premium/month moved the period end from 2027 to one
  month out, with the credit funding the renewals from there. The webhook writes whatever
  Paddle reports either way, so nothing special-cases it — but a date that jumps on /billing is
  this, not a bug.
- **Items are replaced, not appended** — one item in, one item out, so `planOfItems` reading
  the first is safe here. The action still refuses a subscription carrying more than one active
  item rather than rewriting it down to one.
- **CASO B9 — a subscriber can buy Lifetime, and the subscription is ended for them**
  (decided 2026-09-13, having been a dead end until then). It is not a plan *change*:
  `subscriptions.update` takes recurring items only, so Lifetime is sold as its own transaction
  and `planChangeEffect` still answers `lifetime-target` — which now means «not through this
  path» rather than «not at all».
  - **The subscription is ended from the webhook, after the money has arrived**
    (`endSubscriptionBoughtOut`). That order is the only safe one: cancelling first and then
    failing to take the payment leaves somebody with neither. It cannot fail the delivery and
    cannot retry, so a failure tells the operator on Telegram with both ids in the message —
    the remedy is one click in Paddle, and the cost of nobody knowing is a subscription
    renewing for ever beside a Lifetime. **The account is named by its number and never by its
    address**: outside the registration line the Privacy Policy states in two places that these
    notifications carry no personal data, and the root `CLAUDE.md` settles which half gives way
    — stop sending the field, do not soften the sentence. It shipped carrying the email on
    2026-09-14 and was corrected the same day.
  - **`next_billing_period`, not `immediately`, and only one thing decides it: reversibility.**
    Paddle refunds nothing either way — a cancellation stops billing and returns no money,
    whichever date it lands on, which is the documented behaviour and not the «prorated refund»
    the Paddle skill claims. So the customer loses nothing by keeping the period they paid for,
    and Lifetime outranks it meanwhile. What differs is the fourteen-day withdrawal right this
    app publishes on `/` and in the Terms: «You can't reinstate a canceled subscription», so an
    immediate cancel would leave a reader who withdraws from the Lifetime with no plan at all.
  - **Nothing is refunded or credited for the overlap**, and that is the same rule as every
    other case here: the remaining days are not lost, they are simply outranked.
  - **Every status but `canceled` is cancelled, and `paused` is why that is not a check for
    `active`.** A paused subscription is not a dead one — it resumes and bills — so a guard
    reading `status !== 'active'` would skip precisely the case this function exists to prevent
    and, being an early return rather than a throw, would tell nobody. `past_due` is the same
    argument: dunning that succeeds is a charge. The only two silent returns left are a
    subscription that is already `canceled` and one already scheduled to cancel.
  - **A paid plan with no `paddle_subscription_id` sends the operator a line rather than
    returning quietly.** Almost every Lifetime sale reaches that branch with nothing to do, so
    it cannot alert on all of them; the stored plan tells the two apart. An account this app
    believed was billing and cannot name is worth a person looking, and nothing in code can act
    on it.
  - **`mayWritePlan` is what keeps the Lifetime once it is granted.** The cancellation lands
    *after* it — `subscription.updated` carrying the schedule, then `subscription.canceled` at
    the period end — each naming the subscription's own plan, and the second reading as
    `expired`. Without the guard the largest single payment this app takes would be wiped by an
    event that arrives a month later. It matches the whole `subscription.` family rather than
    the two names known to arrive today.
  - **The Lifetime checkout sells in every mode, `stalled` included.** That branch exists to
    stop a *second subscription*; Lifetime is not one. A reader whose card is failing is, if
    anything, the one most helped by buying their way out.
  - **A Lifetime transaction used to null `paddle_subscription_id`** — writing `null` over the
    pointer to the subscription still running beside it, in the same statement that granted the
    Lifetime. Neither id column is ever nulled once it has a value now; that was a pre-existing
    defect, and it also cost every later event the second of the three ways to find an account.
- **The live plan and cycle are read from Paddle, never from this database.** `accounts` has
  no column for the live *cycle* and never has, so the direction of a move cannot be decided
  without asking — and asking Paddle compares against what is actually being billed.
- **Without the branch on `/checkout/[plan]`, an existing subscriber pressing «Pay» opened a
  second checkout** — and a second completed checkout is a second subscription, both billing,
  with the webhook overwriting `paddle_subscription_id` so only the newer one stays cancellable.
  That shipped on 2026-09-12 and was live until this change. The mock could not do it: it wrote
  columns and had nothing left running.
  - **The screen decides what is offered and the action decides what is done**, so
    `startPaddleCheckout` reads the subscription again (2026-09-14). The branch above is a page
    *render*; the press is a different event, and a reader can hold a stale «Pay» in one tab
    while completing a purchase in another. `changePaddlePlan` has always re-read for the mirror
    image of this and says why.
  - **The rule is `wouldBeSecondSubscription`, and it is deliberately not `checkoutMode`.** Only
    `ok: true` refuses: `stalled` gathers an unreadable shape and Paddle not answering, which is
    the cautious answer a *screen* gets for free and the wrong one for an action, where it would
    turn a blip at Paddle into a refused first purchase from somebody who has never subscribed —
    caution paid for in the one direction where money arrives. **Lifetime is exempt**, the same
    exemption the screen already makes, and it does not even pay the Paddle call.
  - **What it does not close**, stated because nothing shows it: `livePaddleSubscription` reads
    `paddle_subscription_id`, which the *webhook* writes, so two presses seconds apart both find
    an empty column. The stale tab is the reachable case; the race inside the webhook's own
    delivery window is not closed here.
- **`paddle_subscription_id` means «has had a subscription», not «has one».** The webhook writes
  it on *every* subscription event, `subscription.canceled` included, and nothing ever nulls it —
  so a reader who cancelled and lapsed back to free still carries the id of what they left.
  Branching on the column offers that reader «Switch to Standard», which then refuses: a
  returning customer with no way to pay. `checkoutMode` is the rule instead, over
  `livePaddleSubscription`, which asks Paddle. Three outcomes, and the third is the one that is
  easy to leave out: **sell** only when nothing has ever run or it has *ended*; **change** a live
  one; and **stalled** — say something, offer nothing — for a failing card, a hold, an unreadable
  shape or Paddle not answering, because each of those may still be billing. It is pure and
  tested, including that a reason invented later falls to `stalled` rather than to `sell`.
- **The cycle toggle opens on what the link asked for, then on the live cycle, then monthly** —
  and the middle step is what was missing. A bare link carries no `?cycle=`, which collapsed to
  `month` for everybody, so a premium/year subscriber arriving from a typed or bookmarked link
  met «Switch to Premium» sitting on Monthly — and pressing it is a year→month move, which
  restarts the billing period and trades the rest of their year for a credit. Legitimate when
  chosen, not when defaulted into. **An explicit `?cycle=` still wins**, and must: every CTA on
  /pricing carries one and «Change billing cycle» is a link whose whole purpose is to set it, so
  letting the live cycle override it would leave that link opening on the cycle it was pressed
  to leave. Hence `initialCycle` is `BillingPeriod | null` on the Paddle branch and flattened
  only for `CheckoutScreen`, which has `loadMostRecentCycleFor` to correct itself. The screen
  also names what they are on, since «you are changing a plan you already pay for» does not say
  *which*.
- **`/pricing`'s «Change billing cycle» tooltip** says a scheduled *cancellation* gets called
  off, which is true and is all it claims. Against a scheduled *downgrade* the answer depends on
  direction, and the line is the same one everywhere: moving to monthly bills nothing and simply
  replaces what was arranged, moving to yearly is billed now and is refused until the reader
  calls that change off on /billing.
