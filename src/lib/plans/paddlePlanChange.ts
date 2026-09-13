'use server'

/**
 * Moving an existing Paddle subscription onto a different plan or cycle.
 *
 * `planChange.ts` holds the decision and the argument for it — chiefly that Paddle has no way
 * to *schedule* a change of plan, and what is done about it: a downgrade of tier moves the
 * items now under `do_not_bill`, which charges and credits nothing, and carries the date the
 * reader keeps their old plan until in a `custom_data` stamp. This file is the I/O around it.
 *
 * **`custom_data` is replaced wholesale by an update, never merged into**, so every write here
 * goes through `customDataFor`: `account_id` travels in the same object and is the only way a
 * first event finds its account. Losing it does not fail — it produces an event recorded as
 * `unmatched`, which is the kind of defect nobody sees until a plan does not appear.
 *
 * **It takes no subscription id, for `cancelPaddleSubscription`'s reason**: the id is read from
 * the session's own account, so there is nothing for a caller to tamper with. And it takes a
 * plan and a cycle rather than a price: which price a cycle is sold at is `paddlePriceId`'s
 * answer, so a forged value can at worst name another plan we publish anyway.
 *
 * **What the subscription is on now is read from Paddle, not from this database.** `accounts`
 * stores the live plan but no live *cycle* — there has never been a column for it — and the
 * direction of a move cannot be decided without one. Asking Paddle also makes the comparison
 * against the thing that is actually being billed, which is the only reading that can be
 * wrong in a way anybody would notice. `planOfPrice` does the reading, the same function the
 * webhook uses on the same shape, so a price whose stamp this app cannot read refuses the
 * change here exactly as it declines to grant anything there.
 *
 * **The items array is the complete list Paddle will keep, and anything omitted is removed.**
 * Every subscription this app creates has exactly one item, and that is asserted rather than
 * assumed: a subscription carrying more than one recurring item is refused (`unexpected-items`)
 * instead of being silently reduced to one. `quantity: 1` is written out, matching the 1‑1 cap
 * every price carries.
 *
 * **It writes no plan columns**, for the reason `cancelPaddleSubscription` gives at length: the
 * `subscription.updated` that follows is what `webhookApply.ts` turns into the new plan, and two
 * writers for one fact is how they come to disagree. `revalidatePath` is what stops the screen
 * showing the old plan until somebody reloads.
 */

import { revalidatePath } from 'next/cache'

import { currentUser } from '@/lib/auth/session'
import { hasDatabase } from '@/lib/db/client'

import { livePaddleSubscription, readDate } from './paddleAccount'
import { applyItemChange } from './paddleApply'
import { paddleClient } from './paddleClient'
import { paddlePriceId } from './paddlePrices'
import { readChangeCost, type ChangeCost } from './changePreview'
import { planChangeEffect, type ChangeDirection, type ChangeRefusal, type ChangeWhen } from './planChange'
import { isCheckoutPlan, type BillingPeriod } from './prices'
import { redeemableCouponFor } from './redeemable'
import { downgradeStamp } from './webhook'

export type PaddlePlanChangeFailure =
  | 'not-configured'
  | 'no-database'
  | 'no-session'
  | 'invalid-plan'
  | 'no-price'
  /** Nothing to change: this account has no Paddle subscription to move. */
  | 'no-subscription'
  /** The subscription has ended, so there is nothing to move — there is something to buy. */
  | 'gone'
  /** Live but not `active`: a failing card or a hold, where the next move is not a plan. */
  | 'not-live'
  /** More than one recurring item, which this app never creates and will not reduce. */
  | 'unexpected-items'
  | 'coupon-unsupported'
  | 'failed'
  | ChangeRefusal

export type PaddlePlanChangeResult =
  | {
      ok: true
      direction: ChangeDirection
      when: ChangeWhen
      /**
       * The day a `period-end` change actually lands, ISO, for a screen to name — `null` for
       * everything that takes effect at once. Said back from the write rather than recomputed,
       * so the sentence a reader is left with quotes the date that was stamped.
       */
      effectiveAt: string | null
    }
  | { ok: false; reason: PaddlePlanChangeFailure }

export type PaddleChangeCostResult =
  | { ok: true; direction: ChangeDirection; when: ChangeWhen; effectiveAt: string | null; cost: ChangeCost }
  | { ok: false; reason: PaddlePlanChangeFailure }

/**
 * What a change would cost, without making it.
 *
 * **The same decision, the same items, the same proration mode as `changePaddlePlan` below** —
 * `subscriptions.preview` takes the identical body and computes what `update` would do. (The
 * write carries a `custom_data` the preview does not: it decides nothing about money, and
 * sending it here would ask Paddle to price a field it does not price.) That is
 * what makes the number on the screen the number on the card, rather than an estimate this file
 * computes a second way. `changePreview.ts` reads the answer; the two must never drift, which is
 * why the mode comes from `planChangeEffect` in both and not from a literal in either.
 *
 * Refuses exactly where the write refuses, and with the same words, so a reader is never offered
 * a price for something that would then be turned down. The one thing it deliberately does *not*
 * share is the coupon gate: a preview takes no money, and a reader carrying a redeemable coupon
 * should still be told what the change costs before being told we cannot honour the discount yet.
 */
export async function previewPaddlePlanChange(
  plan: string,
  cycle: BillingPeriod | null,
): Promise<PaddleChangeCostResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  const priceId = paddlePriceId(plan, plan === 'lifetime' ? null : cycle)
  if (priceId === null) return { ok: false, reason: 'no-price' }

  try {
    const live = await livePaddleSubscription()
    if (!live.ok) return { ok: false, reason: live.reason }

    const effect = planChangeEffect(live, { plan, cycle: plan === 'lifetime' ? null : cycle })
    if (!effect.ok) return { ok: false, reason: effect.reason }
    if ((effect.when === 'period-end' || effect.pinBillingDate) && live.periodEndsAt === null) {
      return { ok: false, reason: 'unreadable' }
    }

    const previewed = await paddle.subscriptions.previewUpdate(live.id, {
      items: [{ priceId, quantity: 1 }],
      prorationBillingMode: effect.proration,
    })

    /*
     * The SDK hands back an entity with camelCase fields; `readChangeCost` reads Paddle's own
     * snake_case wire shape, which is what the sandbox and the tests both speak. Rather than
     * teach the reader two spellings, the two fields it needs are handed over under the names it
     * expects — the same one-rename cast `livePaddleSubscription` makes for `custom_data`.
     */
    const cost = readChangeCost({
      update_summary: previewed.updateSummary
        ? { result: { action: previewed.updateSummary.result.action, amount: previewed.updateSummary.result.amount } }
        : null,
      immediate_transaction: previewed.immediateTransaction
        ? {
            details: { totals: { grand_total: previewed.immediateTransaction.details?.totals?.grandTotal } },
          }
        : null,
    })
    if (cost === null) return { ok: false, reason: 'unreadable' }

    return {
      ok: true,
      direction: effect.direction,
      when: effect.when,
      effectiveAt: effect.when === 'period-end' ? (live.periodEndsAt?.toISOString() ?? null) : null,
      cost,
    }
  } catch (error) {
    console.error('previewPaddlePlanChange failed', error)
    return { ok: false, reason: 'failed' }
  }
}

export async function changePaddlePlan(
  plan: string,
  cycle: BillingPeriod | null,
): Promise<PaddlePlanChangeResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }
  if (!isCheckoutPlan(plan)) return { ok: false, reason: 'invalid-plan' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const priceId = paddlePriceId(plan, plan === 'lifetime' ? null : cycle)
  if (priceId === null) return { ok: false, reason: 'no-price' }

  try {
    /* The same gate `startPaddleCheckout` states: no campaign has a Paddle Discount behind it
       yet, and a change made at the listino would charge more than the page just promised. */
    const coupon = await redeemableCouponFor(plan, user.accountOwnerEmail)
    if (coupon !== null) return { ok: false, reason: 'coupon-unsupported' }

    /*
     * Read again here, though `/checkout/[plan]` has already read it to decide which button to
     * draw. That read is a page render and this one is a press, and between the two a card can
     * fail, a cancellation can land or somebody can change the plan in another tab — so the
     * screen's answer decides what is *offered* and this one decides what is *done*. The same
     * split `startPaddleCheckout` states about the coupon it re-reads rather than accepting.
     */
    const live = await livePaddleSubscription()
    if (!live.ok) return { ok: false, reason: live.reason }

    const effect = planChangeEffect(live, { plan, cycle: plan === 'lifetime' ? null : cycle })
    if (!effect.ok) return { ok: false, reason: effect.reason }

    /*
     * **A downgrade held to the end of the period is nothing without its date**, so a
     * subscription whose period this cannot read refuses the change rather than making it. The
     * failure it avoids is the expensive one: `do_not_bill` with no stamp behind it moves the
     * reader onto the cheaper plan *now*, having charged them for the dearer one, and there is
     * nothing on any screen that would explain it. Paddle sends this field on every active
     * subscription, so this is a guard against the impossible, not a case.
     */
    if ((effect.when === 'period-end' || effect.pinBillingDate) && live.periodEndsAt === null) {
      return { ok: false, reason: 'unreadable' }
    }

    /*
     * **A scheduled cancellation is cleared in a call of its own, and it has to be.** Paddle
     * refuses `scheduled_change` alongside anything else — «you cannot combine updating
     * schedule_change with other fields» — so folding it into the update below fails *every*
     * change of plan, not merely the ones where something is scheduled. Measured against the
     * sandbox on 2026-09-13, which is the only reason this is two calls.
     *
     * A reader who changes plan has plainly changed their mind about leaving, which is the
     * reading a re-buy has always been given; left in place the cancellation would
     * take the *new* plan away on the old date, which is nothing anybody pressed a button for.
     *
     * **Cleared first, and that order is required rather than merely tidier.** A subscription
     * carrying a scheduled change refuses the deferred proration modes outright — «Subscription
     * can only be updated with `do_not_bill`, `full_immediately`, or `prorated_immediately` …
     * because it has a scheduled change» — so a downgrade attempted before the clear fails for
     * every reader who had cancelled and changed their mind. Measured in the same run.
     *
     * It is also the safer of the two orders: a failure *after* the clear leaves a reader still
     * subscribed to the plan they already had, undone by cancelling again, which is one press
     * away. The other order leaves the new plan carrying the old cancellation date, which
     * nothing on any screen would explain.
     *
     * Cancelling sets `next_billed_at` to null and clearing restores it, so the subscription
     * comes back to exactly the row it was — verified rather than assumed.
     */
    /*
     * **The period is re-read from the call that cleared the cancellation, not from the snapshot
     * taken before it.** Cancelling nulls `next_billed_at` and clearing restores it, so the row
     * is touched twice before the items move — and everything below pins a date: the stamp
     * promises the reader a day, and `pinBillingDate` writes that day into Paddle. A snapshot
     * taken before those two calls would be believed over Paddle's own answer, and a period end
     * that shifted by so much as an hour would end the paid year on the wrong day. Paddle
     * answers every update with the updated subscription, so this costs nothing and removes the
     * question rather than settling it by measurement.
     */
    let periodEndsAt = live.periodEndsAt
    if (live.scheduledChange) {
      const cleared = await paddle.subscriptions.update(live.id, { scheduledChange: null })
      periodEndsAt = readDate(cleared.currentBillingPeriod?.endsAt) ?? periodEndsAt
    }

    /*
     * The stamp that makes a `do_not_bill` downgrade mean something — written on the same call
     * as the items, so there is no window in which Paddle is on the cheaper plan and this app
     * has no record of why. A change taking effect now clears any stamp instead: that is what
     * calling off a scheduled downgrade *is*, and what stops a stale one outliving it.
     */
    const stamp =
      effect.when === 'period-end' && periodEndsAt !== null
        ? downgradeStamp({ plan: live.plan, cycle: live.cycle }, periodEndsAt)
        : null

    /*
     * The price Paddle is carrying right now — the pending plan's when one is arranged, the paid
     * one otherwise. It is only ever used to undo this call if the billing date cannot be put
     * back; `applyItemChange` says why that matters.
     */
    const carried = live.pendingDowngrade ?? { plan: live.plan, cycle: live.cycle }
    const restoreTo = isCheckoutPlan(carried.plan) ? paddlePriceId(carried.plan, carried.cycle) : null
    if (restoreTo === null) return { ok: false, reason: 'unreadable' }

    const applied = await applyItemChange(paddle, live, {
      priceId,
      proration: effect.proration,
      stamp,
      pinTo: effect.pinBillingDate ? periodEndsAt : null,
      restoreTo,
    })
    if (!applied.ok) return { ok: false, reason: applied.reason }

    revalidatePath('/billing')
    revalidatePath('/pricing')

    return {
      ok: true,
      direction: effect.direction,
      when: effect.when,
      effectiveAt: stamp === null ? null : (periodEndsAt?.toISOString() ?? null),
    }
  } catch (error) {
    console.error('changePaddlePlan failed', error)
    return { ok: false, reason: 'failed' }
  }
}
