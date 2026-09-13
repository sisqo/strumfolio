'use server'

/**
 * Cancelling a real Paddle subscription.
 *
 * **It takes no arguments, and that is the security design rather than an omission.** The
 * documented shape for this passes a `subscriptionId` from the browser and then checks the
 * signed-in reader owns it — a check that has to be right every time it is written. Reading
 * the id from the session's own account instead removes the question: there is no id to
 * tamper with, because none is sent. The same reasoning `startPaddleCheckout` gives for refusing to
 * take a coupon as a parameter.
 *
 * **`next_billing_period`, never `immediately`.** The reader pressed «cancel», not «cancel and
 * refund the rest»: they have paid through the end of the period and keep it, which is exactly
 * what `resolveSubscription` already models as
 * `pendingPlan: 'free'`. Immediate cancellation is a different product decision with a
 * proration attached, and it is deliberately not reachable from here.
 *
 * **This writes no plan columns, on purpose.** Paddle answers with the subscription still
 * `active` and a `scheduled_change` attached; the `subscription.updated` that follows is what
 * `webhookApply.ts` turns into `pendingPlan`. Writing them here too would make two writers for
 * one fact, and the webhook is the one that also has to be right for renewals, failures and
 * changes made from Paddle's own portal. The cost is a visible one: for the second or two
 * before that event lands, `/billing` still shows nothing scheduled. `revalidatePath` is what
 * makes the page pick it up without a manual reload.
 */

import { revalidatePath } from 'next/cache'

import { hasDatabase } from '@/lib/db/client'

import { customDataFor, livePaddleSubscription, type NoLiveSubscription } from './paddleAccount'
import { paddlePriceId } from './paddlePrices'
import { isCheckoutPlan } from './prices'
import { paddleClient } from './paddleClient'

export type PaddleCancelFailure = 'not-configured' | 'no-database' | 'failed' | NoLiveSubscription

export type PaddleCancelResult =
  | { ok: true; effectiveAt: string | null }
  | { ok: false; reason: PaddleCancelFailure }

/** Nothing was scheduled, so there is nothing to call off — not a fault, and worth its own word. */
export type PaddleKeepFailure = PaddleCancelFailure | 'nothing-scheduled'

export type PaddleKeepResult = { ok: true } | { ok: false; reason: PaddleKeepFailure }

export async function cancelPaddleSubscription(): Promise<PaddleCancelResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  try {
    /*
     * `livePaddleSubscription` rather than the account column, which says «has had a
     * subscription» and not «has one» — the webhook writes it on `subscription.canceled` too and
     * nothing ever nulls it. Cancelling against a dead id answers a Paddle error and reaches the
     * reader as «that didn't go through», when the truth is that it already has.
     */
    const live = await livePaddleSubscription()
    if (!live.ok) return { ok: false, reason: live.reason }

    const canceled = await paddle.subscriptions.cancel(live.id, {
      effectiveFrom: 'next_billing_period',
    })

    /* The page reads the account row, which the webhook is about to change. */
    revalidatePath('/billing')

    return { ok: true, effectiveAt: canceled.scheduledChange?.effectiveAt ?? null }
  } catch (error) {
    console.error('cancelPaddleSubscription failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Calling off whatever is about to happen to this plan — «Keep Premium».
 *
 * **Two different things can be scheduled, and this undoes either or both.** A cancellation is
 * Paddle's own `scheduled_change`, cleared by writing `null` over it. A *downgrade* is not
 * Paddle's at all: the items already carry the cheaper plan and a `custom_data` stamp holds the
 * date the reader keeps the dearer one until — `planChange.ts` explains why that is the only
 * shape available — so calling it off means putting the items back and clearing the stamp. No
 * money moves in either direction: the period was paid at the old price, which is exactly what
 * `do_not_bill` leaves alone, and it is why the undo is as free as the downgrade was.
 *
 * It used to be able to say «nothing is scheduled» simply by asking Paddle, and that answer was
 * right only while a scheduled downgrade was impossible. `/billing` draws this button from
 * `pendingPlan`, which now carries downgrades too — so without this second branch the one
 * reader who most wants the button would press it and be told there was nothing to call off.
 *
 * `scheduled_change: null` travels alone: Paddle refuses it beside any other field, which is
 * why the two undos are two calls when both apply. It also restores `next_billed_at`, which
 * cancelling had nulled, so the subscription comes back to the row it was on. Both measured
 * 2026-09-13.
 *
 * Writes no plan columns, like everything else on this path: the `subscription.updated` that
 * follows is what clears `pendingPlan`.
 */
export async function keepPaddleSubscription(): Promise<PaddleKeepResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const paddle = paddleClient()
  if (paddle === null) return { ok: false, reason: 'not-configured' }

  try {
    const live = await livePaddleSubscription()
    if (!live.ok) return { ok: false, reason: live.reason }

    /* Asked of the same read that established the subscription is live, never of a second
       fetch — see `livePaddleSubscription`'s own note on why one snapshot. */
    if (!live.scheduledChange && live.pendingDowngrade === null) {
      return { ok: false, reason: 'nothing-scheduled' }
    }

    if (live.scheduledChange) {
      await paddle.subscriptions.update(live.id, { scheduledChange: null })
    }

    if (live.pendingDowngrade !== null) {
      /* The plan they are paying for, which is what `livePaddleSubscription` reports while a
         downgrade is stamped — never the items, which are already the cheaper one. Neither of
         the two plans that have no subscription to put back can be standing here, and saying so
         is what lets the price be looked up at all. */
      const priceId = isCheckoutPlan(live.plan) ? paddlePriceId(live.plan, live.cycle) : null
      if (priceId === null) return { ok: false, reason: 'unreadable' }

      await paddle.subscriptions.update(live.id, {
        items: [{ priceId, quantity: 1 }],
        prorationBillingMode: 'do_not_bill',
        customData: customDataFor(live, null),
      })
    }

    revalidatePath('/billing')

    return { ok: true }
  } catch (error) {
    console.error('keepPaddleSubscription failed', error)
    return { ok: false, reason: 'failed' }
  }
}
