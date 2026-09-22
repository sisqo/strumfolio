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
 * - **A change that collects money applies now and is billed now** (`prorated_immediately`):
 *   the unused part of the old plan is credited against the charge, and the reader has the
 *   bigger plan before the page has finished reloading. That is a rise in tier, or the longer
 *   commitment of going yearly — and only while the cycle is not being shortened underneath it.
 * - **A change that would hand money back keeps the plan that was paid for until the period
 *   ends** — case B2,
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
 * - **A change that shortens the cycle waits in exactly the same way** (B4, B6, B8 — and B7,
 *   which raises the tier and waits anyway), and costs one extra call: `do_not_bill` preserves
 *   the billing period only while the *frequency* is unchanged, and restarts it otherwise — so
 *   the billing date is put back by a second call afterwards. `paddleApply.ts` owns that
 *   sequence and the measurement behind it.
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
import type { BillingPeriod, CheckoutPlan } from './prices'
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

/**
 * Two of Paddle's five modes, named as Paddle names them — and two is the whole list on purpose.
 *
 * **`prorated_next_billing_period` was used and is gone**, which is worth a line because it is
 * the obvious thing to reach for and it is wrong twice over. It repays a downgrade in *money* on
 * the next invoice, where this product repays it in *time*: the reader keeps what they bought
 * until the day they bought it to. And Paddle refuses every deferred mode outright on any change
 * of billing frequency, so the cases that most needed it — a tier drop that also changes cycle —
 * could never have used it anyway.
 *
 * What is left is one rule with two halves, and the halves are told apart by **which way the
 * money goes, not by which way the plan goes**: a change that takes money happens now and is
 * billed now; a change that would give money back happens at the end of the period already paid
 * for, and bills nothing at all. B7 is what forced that wording — it raises the tier, which
 * sounds like the first half, and shortens a paid year, which puts it squarely in the second.
 */
export type ProrationMode = 'prorated_immediately' | 'do_not_bill'

/**
 * When the reader actually stops having the plan they have now. `now` for everything Paddle
 * bills on the spot; `period-end` for a change held back to the last day of what they paid for,
 * which is the whole of case B2 — and, since B7, not only for changes that go *down*: this is
 * the field the screens read, and `direction` is not a substitute for it.
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
 * exists because the arithmetic cannot be shown honestly: Paddle's preview prices the move
 * against the items, which have already moved, while the sequence that would actually be run
 * credits the plan that was *paid for*. Quoting the first and charging the second is precisely
 * the shown-price/charged-price gap this directory is written to close, so the reader is asked
 * to call the scheduled change off first — one press, on /billing — and is then priced against
 * what they hold.
 *
 * **Its name is now narrower than what it covers**, and the copy it drives already knows this:
 * since B7 the arranged change can rank *above* the live plan, so neither this refusal nor
 * `already-scheduled` may say which way it goes. Renaming the member would touch five files to
 * say what this paragraph says once.
 */
export type ChangeRefusal =
  | 'same'
  | 'already-scheduled'
  | 'lifetime-target'
  | 'lifetime-live'
  | 'pending-downgrade'
  | 'unreadable'

export type PlanChangeEffect =
  | {
      ok: true
      direction: ChangeDirection
      proration: ProrationMode
      when: ChangeWhen
      /**
       * Whether the billing date has to be put back by a second call, because this change moves
       * the items onto a different **frequency**.
       *
       * **Measured 2026-09-13, and it is the fact B4 turns on.** `do_not_bill` leaves the period
       * alone when the frequency is unchanged — that is what makes B2 work — but a change of
       * frequency *restarts* it even under `do_not_bill`: a monthly subscription moved to the
       * yearly price came back with `next_billed_at` a year out instead of the three weeks it
       * had left. Applied to year→month that would bill the reader again next month and throw
       * away the rest of the year they had paid for, which is the exact harm this case exists
       * to prevent.
       *
       * `next_billed_at` is the repair, and it has two rules of its own, both measured: it is
       * **ignored** when it travels with an items change, and it is **refused** when it travels
       * alone («Invalid request») — it needs a `proration_billing_mode` beside it. So it is a
       * second call, after the items, carrying `do_not_bill` and nothing else.
       */
      pinBillingDate: boolean
    }
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
 * **Lifetime is refused in both directions, and the two refusals mean different things now.**
 * As a *target* it is not a recurring price at all and `subscriptions.update` takes only
 * recurring items, so a subscription cannot be moved onto it — but it *can* be bought beside
 * one, and since 2026-09-13 it is: `/checkout/lifetime` sells to a subscriber and the webhook
 * ends the subscription once the payment has arrived (`endSubscriptionBoughtOut`). So this
 * refusal now means «not through this path», not «not at all». As the *live* plan it means what
 * it always did: there is no subscription left to update, and nothing above Lifetime to sell.
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
   * The cycle **Paddle's items carry right now**, which is the pending one whenever something is
   * arranged and the paid one otherwise. The distinction is the whole of `pinBillingDate`: what
   * restarts the period is the frequency changing against what is *there*, not against what was
   * paid for. Reading `from.cycle` here instead would miss a tier change made on top of an
   * already-arranged change of cycle, and lose the paid period at the second press.
   */
  const itemsCycle = pending?.cycle ?? from.cycle
  const pinBillingDate = itemsCycle !== to.cycle

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
      : { ok: true, direction: 'revert', proration: 'do_not_bill', when: 'now', pinBillingDate }
  }

  /* Already arranged, to the day. Pressing it again would restamp the same date and fire a
     second event for one decision — and it is emphatically not `same`: this reader is still on
     the plan they paid for, and being told otherwise on the way out of it is the kind of wrong
     sentence that gets read as a charge already taken. */
  if (pending !== null && to.plan === pending.plan && to.cycle === pending.cycle) {
    return { ok: false, reason: 'already-scheduled' }
  }


  const risesInTier = PLAN_RANK[to.plan] > PLAN_RANK[from.plan]
  const dropsInTier = PLAN_RANK[to.plan] < PLAN_RANK[from.plan]
  /*
   * Shortens against **what was paid for**, not against what the items carry — `pinBillingDate`
   * is the one that asks the items. A reader who has already arranged to go monthly has monthly
   * items and a paid *year* underneath them, and it is the year that must not be handed back.
   */
  const shortensTheCycle = from.cycle === 'year' && to.cycle === 'month'

  /*
   * **The whole rule, in one condition: a change that would hand money back waits for the
   * period that has been paid for.** Nothing is charged and nothing is credited — the items
   * move now only because that is the single way to make Paddle renew at the new price by
   * itself, and a `custom_data` stamp (`webhook.ts`) carries the date, which is what keeps this
   * app's account of the plan honest while Paddle's items are ahead of it.
   *
   * Two things get a reader money back, and both are here: **dropping a tier** (B2 with the
   * cycle unchanged, B6 and B8 when it moves as well) and **shortening the cycle**, which
   * ends a year that was paid in full (B4, and B7 below).
   *
   * **B7 is why this is one condition rather than a branch per case** (decided 2026-09-14).
   * Standard yearly → Premium monthly *raises* the tier, so it read as an upgrade and was
   * billed on the spot — and what Paddle does to a paid year on the way is credit the eleven
   * months left of it. That credit is money owed back, sitting on the account against monthly
   * invoices it would take the best part of a year to absorb, and lost outright if the reader
   * then leaves. So the tier rising does not make a change collect money; the cycle shortening
   * decides it either way, and a rise in tier over a paid year waits for that year like
   * everything else. The reader is told so before they press: they keep what they paid for
   * until the day, and the bigger plan starts then, billed monthly.
   *
   * **What it costs is stated rather than hidden**: this is the one waiting case where the
   * reader is asking for *more* and is made to wait for it. The alternative — grant the tier
   * now at the yearly price, take the prorated difference, and turn the billing monthly at the
   * renewal — collects money instead of owing it and would give them what they asked for the
   * same day, but it is three Paddle calls and a second kind of stamp carrying a cycle with no
   * plan beside it. Not built, and this is the note saying it was weighed.
   *
   * **B8 had to be decided the same way** and against the same instinct, since it is where
   * waiting costs the business most: Premium monthly to Standard yearly could be billed today,
   * a whole year up front, and the analysis document proposed exactly that. Decided the other
   * way on 2026-09-13, for the reason that now covers B7 too — the rule a reader has been told
   * holds everywhere or it is not a rule, and the single exception where the exception collects
   * more money is the kind a customer notices.
   *
   * **C2 falls out of the same line**: a second, different waiting change while one is pending
   * is decided against the *paid* plan like the first, so the last one asked for wins and
   * nothing accumulates. Nothing is billed, so there is no figure to quote wrongly and no
   * reason to refuse it — the line `pending-downgrade` draws is between priced changes and free
   * ones, which is why this block asks nothing about `pending`.
   */
  if (dropsInTier || shortensTheCycle) {
    return {
      ok: true,
      /* The tier is what the reader calls up and down, and B7 is genuinely up — only its
         billing waits. The screens read `when` for the sentence and `direction` only for the
         two cases that move money, so naming this one honestly costs nothing and stops the
         fallback copy calling a rise in tier a downgrade. */
      direction: risesInTier ? 'upgrade' : 'downgrade',
      proration: 'do_not_bill',
      when: 'period-end',
      pinBillingDate,
    }
  }

  /*
   * Everything left takes money now: a rise in tier that does not shorten the cycle, and B3 —
   * monthly to yearly, a bigger commitment paid for on the spot. The period restarting under
   * B3 is the point of it rather than a side effect, so nothing is pinned.
   *
   * Refused while something is arranged, where the block above is not, and the line between
   * them is exactly whether money is quoted: Paddle would price this against the items, which
   * have already moved, while the sequence that would actually run credits the plan that was
   * paid for. Calling the arranged change off first is one press, on /billing.
   */
  if (risesInTier || (from.cycle === 'month' && to.cycle === 'year')) {
    return pending === null
      ? { ok: true, direction: 'upgrade', proration: 'prorated_immediately', when: 'now', pinBillingDate: false }
      : { ok: false, reason: 'pending-downgrade' }
  }

  /* Two plans of equal rank under different names, on one cycle: not a direction this file can
     order, and not a move worth billing for. Unreachable while `PLAN_RANK` stays injective. */
  return { ok: false, reason: 'same' }
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

/**
 * Whether opening a checkout for this plan would start a **second** subscription beside one
 * that is already running — the same question `checkoutMode` answers for the screen, asked
 * again at the moment of the press.
 *
 * It has to be asked twice because the two are different events: `/checkout/[plan]` reads the
 * subscription to decide which button to draw, and a reader can hold that render open in one
 * tab while completing a purchase in another. The rule `changePaddlePlan` already follows,
 * pointed the other way.
 *
 * **It is deliberately not `checkoutMode(live) !== 'sell'`**, and the difference is the whole
 * reason this is a function rather than a comparison. `stalled` gathers a shape this app cannot
 * read and Paddle not answering, which is the right answer for a *screen* — a sentence costs
 * nothing there — and the wrong one for the action, where it would turn a blip at Paddle into a
 * refused first purchase from somebody who has never subscribed. So only `ok: true` refuses:
 * every other answer passes, and the worst those readers meet is the behaviour that shipped
 * before this rule existed rather than a new one.
 *
 * **Lifetime is exempt**, for the reason `/checkout/[plan]` gives at length about `stalled`:
 * what is being prevented is a second *subscription*, and a one-time transaction is not one.
 * The webhook ends whatever subscription was running once that payment has arrived (B9).
 */
export function wouldBeSecondSubscription(plan: CheckoutPlan, live: LivePaddleSubscription): boolean {
  return plan !== 'lifetime' && live.ok
}

export type LifetimeRefusal = 'lifetime-not-on-sale' | 'already-lifetime'

/**
 * Whether a Lifetime may be sold to this reader right now — asked by the screen and again by
 * the press, like every other rule in this file.
 *
 * Neither question was asked anywhere. `/checkout/lifetime` read `lifetime.on_sale` only to word
 * the coupon bar, and nothing read the account's own plan, so an owner who switched the Lifetime
 * off went on selling it to anybody with the link — and somebody who already held one could be
 * charged €199.99 again by following an old bookmark. `loadLifetimeOnSale`'s own comment says a
 * withdrawn plan must stop taking money; this is what makes that true.
 *
 * **Holding one wins over the switch**, because it is the more useful sentence: somebody who
 * already has Lifetime needs to hear that, not that it is off sale. A Lifetime taken back by a
 * refund or a chargeback is not «held», so that reader may buy again — `mayWritePlan`'s reading.
 */
export function lifetimeRefusal(onSale: boolean, holdsLifetime: boolean): LifetimeRefusal | null {
  if (holdsLifetime) return 'already-lifetime'
  if (!onSale) return 'lifetime-not-on-sale'
  return null
}
