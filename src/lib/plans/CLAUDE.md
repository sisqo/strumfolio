# Plans, entitlements and the mock checkout (`src/lib/plans/`)

Loaded when Claude works under this directory. Repo-wide rules — the push check, deploys,
production migrations, the two Neon databases — stay in the root `CLAUDE.md`.

- `types.ts` — `Plan`, `PLANS` (the limits table), `PLAN_RANK` (generosity order, not price).
- `prices.ts` — `PRICES`, `LIFETIME`; separate from `types.ts` because a price changes on a
  different clock than a limit does.
- `entitlements.ts` — `resolveSubscription`/`liveSubscription`: pure functions collapsing a
  scheduled downgrade or cancellation the instant `now` passes its date. Called at every read
  site instead of a cron job — there is no background job anywhere in this repo.
- `checkout.ts` (`'use server'`) — the mock checkout: `mockPurchase`, `mockCancel`,
  `clearPendingChange`, `forceExpireNow` (test-only). Writes the same
  `plan`/`planStatus`/`planExpiresAt`/`pendingPlan`/`pendingCycle` columns a real Paddle
  webhook will write, and logs every mutation to `paddle_events` (`history.ts`) under an
  `eventType` prefixed `mock.` — the table and reading code a real integration will reuse.
- `resolve.ts` — two env flags read fresh at call time: `plansEnforced()` (`SONGBOOK_PLANS=on`)
  gates enforcement, `mockCheckoutEnabled()` (`SONGBOOK_MOCK_CHECKOUT=on`) gates `/checkout`
  and the "Choose <plan>" buttons on `/pricing`. **Neither is a security boundary** — while the mock
  checkout is on, any signed-in reader can give their account any plan for free. **`SONGBOOK_PLANS` is `on` in production and
  `SONGBOOK_MOCK_CHECKOUT` is not set there at all** — measured 2026-09-12 against the full
  list of sixteen production variables, not inferred. Both flags are a strict `=== 'on'`, so an
  absent variable is `false`: the mock checkout is **off** in production, which is worth saying
  plainly because this file claimed the opposite for weeks. The consequence is that production
  today has no way to buy anything — `/checkout` and `/pricing`'s "Choose" buttons are both
  behind that flag — so the real Paddle checkout will be the first purchase path there rather
  than the second, and there is no window in which both exist.
- `testCard.ts` — the mock's "processor": `isAcceptedTestCard` accepts only
  `4111 1111 1111 1111` (digits compared, formatting ignored); everything else declines
  client-side in `CheckoutScreen.tsx`, before `mockPurchase` is called.
- `SONGBOOK_FORCE_PLAN` — a deliberately risky local-only escape hatch (forces every read to
  one plan); never meant to run in production.

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
  what a real checkout would take. Harmless only while the mock checkout is the only checkout,
  and the first thing to settle after the catalogue, before any Paddle checkout goes in front
  of a reader.

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
- **`granted*` is never touched**, the same standing decision `mockPurchase` records: a gift
  lives in those columns and a renewal re-asserting `plan`/`planStatus` would erase it.
- **Paddle cannot schedule a downgrade**, and the next section says what was done about it.
  `scheduled_change` is only `cancel`, `pause` or `resume`, so a cancellation maps cleanly onto
  `pendingPlan: 'free'` and a move to a *cheaper paid plan* has nothing to map from. On the
  Paddle path `pendingPlan` therefore carries `'free'` and nothing else.

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

- **A downgrade now applies at once and is repaid in money, not in time — a real change from
  what the mock promised.** `mockPurchase` kept the reader on the plan they had paid for until
  its last day and scheduled the smaller one behind it. Paddle has no way to express that:
  `subscriptions.update` replaces the items immediately and only the *billing* can be deferred,
  through `proration_billing_mode`. So this follows Paddle's own customer portal — upgrade
  `prorated_immediately`, downgrade `prorated_next_billing_period`. Holding the change
  app-side instead was rejected rather than postponed: with no scheduler, Paddle would renew at
  the **old, higher** price, which is the shown-price/charged-price gap in the direction that
  takes more money than was agreed.
- **Direction is plan rank first, cycle only as the tiebreak.** Comparing amounts instead reads
  premium/month → standard/year as a *rise* — €9.99 becomes €34.99 — and would charge on the
  spot for a move made to spend less. With the plan unchanged, yearly is the upgrade.
- **`scheduled_change: null` cannot travel with anything else**: «you cannot combine updating
  schedule_change with other fields». So clearing a pending cancellation is a call of its own,
  and it must come **first** — a subscription carrying a scheduled change refuses the deferred
  proration modes outright, so a downgrade attempted before the clear fails for every reader
  who cancelled and changed their mind. Cancelling also nulls `next_billed_at`; clearing
  restores it.
- **A change of plan within one cycle leaves `current_billing_period` alone; a change of
  *cycle* restarts it.** premium/year → premium/month moved the period end from 2027 to one
  month out, with the credit funding the renewals from there. The webhook writes whatever
  Paddle reports either way, so nothing special-cases it — but a date that jumps on /billing is
  this, not a bug.
- **Items are replaced, not appended** — one item in, one item out, so `planOfItems` reading
  the first is safe here. The action still refuses a subscription carrying more than one active
  item rather than rewriting it down to one.
- **Lifetime is refused on both sides.** It is a one-time price and `subscriptions.update`
  takes recurring items only, so there is no way to move a subscription onto it; selling it
  through a fresh transaction would leave the subscription billing beside a plan bought for
  ever. `/checkout/lifetime` says so to a subscriber instead of offering the button. **This is
  the one plan change a paying reader cannot make in one step**, and it is an open question
  rather than a finished answer.
- **The live plan and cycle are read from Paddle, never from this database.** `accounts` has
  no column for the live *cycle* and never has, so the direction of a move cannot be decided
  without asking — and asking Paddle compares against what is actually being billed.
- **Without the branch on `/checkout/[plan]`, an existing subscriber pressing «Pay» opened a
  second checkout** — and a second completed checkout is a second subscription, both billing,
  with the webhook overwriting `paddle_subscription_id` so only the newer one stays cancellable.
  That shipped on 2026-09-12 and was live until this change. The mock could not do it: it wrote
  columns and had nothing left running.
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
- **What is still the mock's story: `/pricing`'s «Change billing cycle» tooltip**, which says a
  scheduled *downgrade* gets cancelled. A scheduled cancellation is real on both paths and is
  cleared; a scheduled downgrade exists only on the mock's. Left as it is deliberately while
  both paths are live — it is true of one of them — and it belongs with the demolition, where
  the mock's copy comes out everywhere at once.
