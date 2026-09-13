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
 * What this app does with that:
 *
 * - **An upgrade applies now and is billed now** (`prorated_immediately`): the unused part of
 *   the old plan is credited against the charge, and the reader has the bigger plan before the
 *   page has finished reloading.
 * - **A downgrade of tier keeps the plan that was paid for until the period ends** — case B2,
 *   and the rule the whole product is written around: nobody pays for Premium to the 13th and
 *   loses it on the 2nd. Paddle cannot schedule that, but it can be *made* to behave as if it
 *   had: the items move now under `do_not_bill`, so no money changes hands in either direction,
 *   the billing period is untouched, and the next renewal bills the new lower price with
 *   nothing having to run in between. What Paddle then gets wrong is only the entitlement — its
 *   items say Standard while the customer holds Premium — and a `custom_data` stamp carries
 *   the missing half to the webhook, which writes the paid plan with the cheaper one behind it
 *   as `pendingPlan`. `resolveSubscription` collapses that on the date by pure reading. **No
 *   cron, no scheduler, no renewal-time write**, which is what made the rejected alternative —
 *   hold the change app-side and apply it at the renewal — impossible here: until that
 *   scheduler ran Paddle would renew at the old, higher price.
 * - **A downgrade that also changes cycle is still billed on the next invoice**
 *   (`prorated_next_billing_period`), and that is unfinished business rather than a decision:
 *   Paddle refuses the deferred modes on any change of billing frequency, so those cases
 *   (B4, B6, B8) are refused by the API today and are the next ones to build.
 *
 * `pendingPlan` therefore has two sources on the Paddle path: `'free'`, written from a
 * `scheduled_change` of `cancel`, which is the one action Paddle does model; and a plan, written
 * from the stamp above. A cancellation arriving on top of a stamped downgrade wins — see
 * `subscriptionEffect`.
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

/** A plan and a cycle, whether held, asked for, or already arranged. */
export interface SubscribedTo {
  plan: Plan
  cycle: BillingPeriod | null
}

/**
 * What the subscription is, for the purpose of deciding what a move from it means: the plan
 * **paid for**, plus whatever is already arranged to happen to it.
 *
 * `pendingDowngrade` is optional because most of the time there is none, and because the
 * comparison of two plans is the same comparison with or without one.
 */
export interface LiveSubscribedTo extends SubscribedTo {
  pendingDowngrade?: SubscribedTo | null
}

/**
 * `revert` is neither of the other two: the items go back to the plan the reader is already
 * paying for, which is a change to Paddle and no change at all to them.
 */
export type ChangeDirection = 'upgrade' | 'downgrade' | 'revert'

/** Three of Paddle's five modes, named as Paddle names them. */
export type ProrationMode = 'prorated_immediately' | 'prorated_next_billing_period' | 'do_not_bill'

/**
 * When the reader actually stops having the plan they have now. `now` for everything Paddle
 * bills on the spot; `period-end` for a downgrade held back to the last day of what they paid
 * for, which is the whole of case B2.
 */
export type ChangeWhen = 'now' | 'period-end'

/**
 * Why a change of plan is not a change of plan.
 *
 * `same` is not an error anywhere else in this file's callers, but it has to be refused here:
 * `subscriptions.update` with the items it already has still bills a proration of zero and
 * still fires an event, so a double-tap would leave a second receipt describing nothing.
 *
 * **`already-scheduled` is not `same`**, though both end in nothing happening. `same` says «you
 * are on this plan»; this says «you are moving to it, on a day already fixed». Folding the two
 * together is how a reader who had just arranged to move to Standard was told, on Standard's own
 * checkout, that Standard was the plan they were already on — which is false while the period
 * they paid for is still running, and on the one screen where it matters most.
 *
 * `pending-downgrade` is the one that describes an ordinary state rather than a fault, and it
 * exists because the arithmetic cannot be shown honestly: with the items already moved down,
 * Paddle's preview credits the *cheaper* plan's unused time, while the two-call sequence that
 * would actually be run credits the dearer one that was paid for. Quoting the first and
 * charging the second is precisely the shown-price/charged-price gap this directory is written
 * to close, so the reader is asked to call the scheduled change off first — one press, on
 * /billing — and is then priced against what they hold.
 */
export type ChangeRefusal =
  | 'same'
  | 'already-scheduled'
  | 'lifetime-target'
  | 'lifetime-live'
  | 'pending-downgrade'
  | 'unreadable'

export type PlanChangeEffect =
  | { ok: true; direction: ChangeDirection; proration: ProrationMode; when: ChangeWhen }
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
export function planChangeEffect(from: LiveSubscribedTo, to: SubscribedTo): PlanChangeEffect {
  if (from.plan === 'lifetime') return { ok: false, reason: 'lifetime-live' }
  if (to.plan === 'lifetime') return { ok: false, reason: 'lifetime-target' }

  /* A subscription is never on `free` — that is what having no subscription is — and a plan
     this file cannot rank is a catalogue it does not recognise. Neither is a direction. */
  if (from.plan === 'free' || to.plan === 'free') return { ok: false, reason: 'unreadable' }
  if (from.cycle === null || to.cycle === null) return { ok: false, reason: 'unreadable' }

  const pending = from.pendingDowngrade ?? null

  /*
   * Asking for the plan you are paying for. With nothing scheduled that is the no-op B11, and
   * refusing it is what stops a receipt describing nothing. With a downgrade scheduled it is
   * the opposite of a no-op — it is «leave me where I am», the C1/C3 change of mind — and the
   * items have to go back. Nothing is billed either way: the period was paid at this price, so
   * `do_not_bill` puts the subscription back exactly as it stood.
   */
  if (to.plan === from.plan && to.cycle === from.cycle) {
    return pending === null
      ? { ok: false, reason: 'same' }
      : { ok: true, direction: 'revert', proration: 'do_not_bill', when: 'now' }
  }

  /* Already arranged, to the day. Pressing it again would restamp the same date and fire a
     second event for one decision — and it is emphatically not `same`: this reader is still on
     the plan they paid for, and being told otherwise on the way out of it is the kind of wrong
     sentence that gets read as a charge already taken. */
  if (pending !== null && to.plan === pending.plan && to.cycle === pending.cycle) {
    return { ok: false, reason: 'already-scheduled' }
  }

  if (PLAN_RANK[to.plan] > PLAN_RANK[from.plan]) {
    return pending === null
      ? { ok: true, direction: 'upgrade', proration: 'prorated_immediately', when: 'now' }
      : { ok: false, reason: 'pending-downgrade' }
  }

  if (PLAN_RANK[to.plan] < PLAN_RANK[from.plan]) {
    /*
     * **B2, and the reason this file grew a `when`.** The reader keeps the tier they paid for
     * until the period ends, so nothing is charged, nothing is credited and the items move now
     * only because that is the single way to make Paddle renew at the new price by itself. The
     * date is carried in a `custom_data` stamp — see `webhook.ts` — which is what keeps this
     * app's account of the plan honest while Paddle's items are ahead of it.
     *
     * **C2 falls out of the same line**: a second, different downgrade while one is pending is
     * decided against the *paid* plan like the first, so the last one asked for wins and
     * nothing accumulates.
     */
    if (to.cycle === from.cycle) {
      return { ok: true, direction: 'downgrade', proration: 'do_not_bill', when: 'period-end' }
    }
    return pending === null
      ? { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period', when: 'now' }
      : { ok: false, reason: 'pending-downgrade' }
  }

  if (from.cycle === to.cycle) return { ok: false, reason: 'same' }
  if (pending !== null) return { ok: false, reason: 'pending-downgrade' }

  return to.cycle === 'year'
    ? { ok: true, direction: 'upgrade', proration: 'prorated_immediately', when: 'now' }
    : { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period', when: 'now' }
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
