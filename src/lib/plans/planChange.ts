/**
 * Changing the plan on a subscription that already exists — the pure half.
 *
 * **Paddle cannot schedule a change of plan, and that single fact decides this whole file.**
 * `scheduled_change` models exactly three actions — `cancel`, `pause`, `resume` — so there is
 * no way to tell Paddle «move this subscription to Standard on the day the year runs out».
 * `subscriptions.update` replaces the items *now*; the only thing that can be deferred is the
 * *billing*, through `proration_billing_mode`. Measured against the sandbox on 2026-09-13 with
 * `subscriptions.preview`, which is how the two facts below are known rather than assumed.
 *
 * So this app follows what Paddle's own customer portal does, and it is a real change from
 * what `mockPurchase` promised:
 *
 * - **An upgrade applies now and is billed now** (`prorated_immediately`): the unused part of
 *   the old plan is credited against the charge, and the reader has the bigger plan before the
 *   page has finished reloading.
 * - **A downgrade also applies now, and is credited on the next invoice**
 *   (`prorated_next_billing_period`). The mock kept the reader on the plan they had paid for
 *   until its last day and scheduled the smaller one behind it; Paddle repays the difference in
 *   *money* instead of in *time*. The alternative — holding the change in `pendingPlan` and
 *   applying it at the renewal — cannot be built without a scheduler, and until that scheduler
 *   ran Paddle would renew at the **old, higher** price. That is the shown-price/charged-price
 *   gap `paddleCheckout.ts` refuses in the direction that takes more money than was agreed.
 *
 * `pendingPlan` therefore survives on the Paddle path for one thing only: `'free'`, written
 * from a `scheduled_change` of `cancel`, which is the one action Paddle does model.
 *
 * **Two more measured facts, both easy to get backwards.** A change of plan *within* the same
 * cycle leaves `current_billing_period` exactly where it was, so `expiresAt` does not move. A
 * change of **cycle** restarts it — premium/year → premium/month moved the period end from
 * 2027 to one month out — and the credit funds the renewals from there. The webhook writes
 * whichever of the two Paddle reports, so neither needs special handling here; they are written
 * down because a reader of `subscriptionCopy` will otherwise wonder why one date jumped.
 */

import type { LivePaddleSubscription } from './paddleAccount'
import type { BillingPeriod } from './prices'
import { PLAN_RANK, type Plan } from './types'

/** What Paddle is billing for right now, read from the subscription's own item. */
export interface SubscribedTo {
  plan: Plan
  cycle: BillingPeriod | null
}

export type ChangeDirection = 'upgrade' | 'downgrade'

/** The two of Paddle's five modes this app uses, named as Paddle names them. */
export type ProrationMode = 'prorated_immediately' | 'prorated_next_billing_period'

/**
 * Why a change of plan is not a change of plan.
 *
 * `same` is not an error anywhere else in this file's callers, but it has to be refused here:
 * `subscriptions.update` with the items it already has still bills a proration of zero and
 * still fires an event, so a double-tap would leave a second receipt describing nothing.
 */
export type ChangeRefusal = 'same' | 'lifetime-target' | 'lifetime-live' | 'unreadable'

export type PlanChangeEffect =
  | { ok: true; direction: ChangeDirection; proration: ProrationMode }
  | { ok: false; reason: ChangeRefusal }

/**
 * Which way a move goes, and therefore how Paddle should bill it.
 *
 * **Plan rank first, cycle only as the tiebreak**, and that order is the decision rather than
 * an implementation detail. Comparing *amounts* instead would read premium/month → standard/year
 * as an increase — €9.99 becomes €34.99 — and charge a reader immediately for what they chose
 * as a downgrade. Rank is what the reader means by up and down; `PLAN_RANK`'s own comment says
 * it grants rather than prices, which is exactly the question being asked here.
 *
 * With the plan unchanged, yearly is the upgrade: it is the longer commitment and the larger
 * charge, so it is billed now, while month-by-month is the step back and waits for the invoice.
 *
 * **Lifetime is refused in both directions.** As a *target* it is not a recurring price at all
 * and `subscriptions.update` takes only recurring items — it is bought through a transaction of
 * its own, which would leave the subscription running beside it. As the *live* plan there is no
 * subscription left to update. Both answer here rather than at the API, so the screen can say
 * which of the two it is.
 */
export function planChangeEffect(from: SubscribedTo, to: SubscribedTo): PlanChangeEffect {
  if (from.plan === 'lifetime') return { ok: false, reason: 'lifetime-live' }
  if (to.plan === 'lifetime') return { ok: false, reason: 'lifetime-target' }

  /* A subscription is never on `free` — that is what having no subscription is — and a plan
     this file cannot rank is a catalogue it does not recognise. Neither is a direction. */
  if (from.plan === 'free' || to.plan === 'free') return { ok: false, reason: 'unreadable' }
  if (from.cycle === null || to.cycle === null) return { ok: false, reason: 'unreadable' }

  if (PLAN_RANK[to.plan] > PLAN_RANK[from.plan]) {
    return { ok: true, direction: 'upgrade', proration: 'prorated_immediately' }
  }
  if (PLAN_RANK[to.plan] < PLAN_RANK[from.plan]) {
    return { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period' }
  }

  if (from.cycle === to.cycle) return { ok: false, reason: 'same' }

  return to.cycle === 'year'
    ? { ok: true, direction: 'upgrade', proration: 'prorated_immediately' }
    : { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period' }
}

/**
 * Which of three things `/checkout/[plan]` may do, given what Paddle is billing.
 *
 * Pure and tested because getting it wrong charges somebody twice, and because that is
 * precisely the kind of rule that reads as obviously correct in a page and is not.
 *
 * - **`sell`** — open a checkout. Allowed on exactly two answers: no subscription has ever
 *   existed, and one that has **ended**. A reader who cancelled and lapsed back to free wants
 *   to buy, the same as a first-timer, and the `paddle_subscription_id` still sitting on their
 *   row must not stand between them and the button.
 * - **`change`** — move the subscription they have.
 * - **`stalled`** — say something, offer nothing. A failing card, a hold, a shape this app
 *   cannot read, Paddle not answering: each means something **may still be running**, and a
 *   checkout opened beside it is a second subscription billing alongside the first. The
 *   cautious answer is the cheap one here — the cost of `stalled` is a reader who has to come
 *   back, the cost of guessing `sell` is two charges a month for as long as nobody notices.
 */
export type CheckoutMode = 'sell' | 'change' | 'stalled'

export function checkoutMode(live: LivePaddleSubscription): CheckoutMode {
  if (live.ok) return 'change'
  return live.reason === 'no-subscription' || live.reason === 'gone' ? 'sell' : 'stalled'
}
