'use server'

/**
 * Cancelling a real Paddle subscription.
 *
 * **It takes no arguments, and that is the security design rather than an omission.** The
 * documented shape for this passes a `subscriptionId` from the browser and then checks the
 * signed-in reader owns it — a check that has to be right every time it is written. Reading
 * the id from the session's own account instead removes the question: there is no id to
 * tamper with, because none is sent. The same reasoning `mockPurchase` gives for refusing to
 * take a coupon as a parameter.
 *
 * **`next_billing_period`, never `immediately`.** The reader pressed «cancel», not «cancel and
 * refund the rest»: they have paid through the end of the period and keep it, which is exactly
 * what `mockCancel` did and what `resolveSubscription` already models as
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

import { livePaddleSubscription, type NoLiveSubscription } from './paddleAccount'
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
 * Calling off a cancellation that has not happened yet — «Keep Premium».
 *
 * **This is the one mock capability that maps onto Paddle exactly**, and it is worth saying why,
 * because its neighbour does not. `clearPendingChange` undid whatever sat in
 * `pendingPlan`/`pendingCycle`, which for the mock could be either a cancellation *or* a
 * scheduled downgrade. On the Paddle path `pendingPlan` is only ever `'free'`, written from a
 * `scheduled_change` of `cancel` — there are no scheduled downgrades, for the reason
 * `planChange.ts` sets out at length — so «undo the pending change» and «clear the scheduled
 * cancellation» are the same act here, where on the mock they were two.
 *
 * `scheduled_change: null` travels alone: Paddle refuses it beside any other field. It also
 * restores `next_billed_at`, which cancelling had nulled, so the subscription comes back to the
 * row it was on. Both measured 2026-09-13.
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
    if (!live.scheduled) return { ok: false, reason: 'nothing-scheduled' }

    await paddle.subscriptions.update(live.id, { scheduledChange: null })

    revalidatePath('/billing')

    return { ok: true }
  } catch (error) {
    console.error('keepPaddleSubscription failed', error)
    return { ok: false, reason: 'failed' }
  }
}
