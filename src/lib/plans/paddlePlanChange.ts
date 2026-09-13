'use server'

/**
 * Moving an existing Paddle subscription onto a different plan or cycle.
 *
 * `planChange.ts` holds the decision and the argument for it — chiefly that Paddle has no way
 * to *schedule* a change of plan, so a downgrade applies now and is repaid in money rather than
 * in time. This file is the I/O around it.
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

import { livePaddleSubscription } from './paddleAccount'
import { paddleClient } from './paddleClient'
import { paddlePriceId } from './paddlePrices'
import { planChangeEffect, type ChangeDirection, type ChangeRefusal } from './planChange'
import { isCheckoutPlan, type BillingPeriod } from './prices'
import { redeemableCouponFor } from './redeemable'

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
  | { ok: true; direction: ChangeDirection }
  | { ok: false; reason: PaddlePlanChangeFailure }

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
     * split `mockPurchase` states about the coupon it re-reads rather than accepting.
     */
    const live = await livePaddleSubscription()
    if (!live.ok) return { ok: false, reason: live.reason }

    const subscription = await paddle.subscriptions.get(live.id)

    const effect = planChangeEffect(live, { plan, cycle: plan === 'lifetime' ? null : cycle })
    if (!effect.ok) return { ok: false, reason: effect.reason }

    /*
     * **A scheduled cancellation is cleared in a call of its own, and it has to be.** Paddle
     * refuses `scheduled_change` alongside anything else — «you cannot combine updating
     * schedule_change with other fields» — so folding it into the update below fails *every*
     * change of plan, not merely the ones where something is scheduled. Measured against the
     * sandbox on 2026-09-13, which is the only reason this is two calls.
     *
     * A reader who changes plan has plainly changed their mind about leaving, which is the
     * reading `mockPurchase` already gives to re-buying; left in place the cancellation would
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
    if (subscription.scheduledChange) {
      await paddle.subscriptions.update(live.id, { scheduledChange: null })
    }

    await paddle.subscriptions.update(live.id, {
      items: [{ priceId, quantity: 1 }],
      prorationBillingMode: effect.proration,
    })

    revalidatePath('/billing')
    revalidatePath('/pricing')

    return { ok: true, direction: effect.direction }
  } catch (error) {
    console.error('changePaddlePlan failed', error)
    return { ok: false, reason: 'failed' }
  }
}
