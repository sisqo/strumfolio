/**
 * Moving a subscription's items, and putting the billing date back when that moves it.
 *
 * A plain module rather than part of either `'use server'` file that calls it, for
 * `paddleClient.ts`'s reason — and because both of them need the *same* sequence: changing plan
 * and calling a change off are the same two Paddle calls with different arguments, and two
 * copies of a sequence whose second half is a repair is two chances to leave a subscription
 * half-moved.
 *
 * **Why there are two calls at all.** `do_not_bill` leaves the billing period exactly where it
 * was — that is what makes a scheduled downgrade possible (`planChange.ts`) — but only while the
 * *frequency* is unchanged. Moving a subscription between the monthly and the yearly price
 * **restarts the period even under `do_not_bill`**: measured 2026-09-13, a monthly subscription
 * with three weeks left came back with `next_billed_at` a year out. Applied to year→month that
 * is the whole of the harm B4 exists to prevent — the reader would be billed again next month
 * and lose the rest of a year they had already paid for.
 *
 * `next_billed_at` repairs it, under two rules that are measured rather than documented: it is
 * silently **ignored** when it travels with an items change, and **refused outright** when it
 * travels alone (`Invalid request`) — it needs a `proration_billing_mode` beside it. So: items
 * first, then the date, with `do_not_bill` on both. Nothing is billed by either.
 *
 * **The order is forced and the middle state is the dangerous one.** Between the two calls
 * Paddle believes the next charge is a cycle away, so a failure there is not cosmetic: it is
 * money taken early, one cycle later, from somebody who has already paid. Hence the retry and
 * then the rollback below — and hence the rollback goes back to what Paddle *had*, never
 * forward, because a reader left on the plan they already bought is a failure nobody is charged
 * for.
 */

import type { Paddle } from '@paddle/paddle-node-sdk'

import { customDataFor, type LivePaddleSubscription } from './paddleAccount'
import type { ProrationMode } from './planChange'

export type LiveSubscription = Extract<LivePaddleSubscription, { ok: true }>

export interface ItemChange {
  /** The price the subscription is to carry. */
  priceId: string
  proration: ProrationMode
  /** The downgrade stamp to write, or `null` to clear whatever stands — never omitted. */
  stamp: Record<string, unknown> | null
  /**
   * The day the billing date must end up on, or `null` when this change is not allowed to move
   * it. Only ever set for a change that alters the frequency; `planChange.ts` decides.
   */
  pinTo: Date | null
  /**
   * The price Paddle carries **now**, to go back to if the date cannot be put right. Not the
   * plan that was paid for: a rollback has to undo this call, not the history before it.
   */
  restoreTo: string
}

export type ItemChangeFailure = 'failed'

/**
 * Put the next billing date where it belongs, and say whether it actually landed there.
 *
 * Paddle answers with the updated subscription, so the check costs nothing and is worth more
 * than the absence of a throw: this is the one call whose silent failure would be read as
 * success by everything downstream.
 */
async function putBillingDate(paddle: Paddle, id: string, at: Date): Promise<boolean> {
  try {
    const pinned = await paddle.subscriptions.update(id, {
      nextBilledAt: at.toISOString(),
      prorationBillingMode: 'do_not_bill',
    })

    return pinned.nextBilledAt != null && new Date(pinned.nextBilledAt).getTime() === at.getTime()
  } catch (error) {
    console.error('putBillingDate failed', error)
    return false
  }
}

export async function applyItemChange(
  paddle: Paddle,
  live: LiveSubscription,
  change: ItemChange,
): Promise<{ ok: true } | { ok: false; reason: ItemChangeFailure }> {
  await paddle.subscriptions.update(live.id, {
    items: [{ priceId: change.priceId, quantity: 1 }],
    prorationBillingMode: change.proration,
    customData: customDataFor(live, change.stamp),
  })

  if (change.pinTo === null) return { ok: true }

  /* Twice before giving up. A second attempt is free and idempotent — setting the same date
     again is the same date — and it covers the likeliest failure of the two, which is a reply
     lost rather than a request refused. */
  if (await putBillingDate(paddle, live.id, change.pinTo)) return { ok: true }
  if (await putBillingDate(paddle, live.id, change.pinTo)) return { ok: true }

  /*
   * The date could not be put back, so the items must go back — otherwise the reader is billed
   * a cycle from now for a period they have already paid for. Restoring is itself a change of
   * frequency, so it restarts the period again, and the date is pinned once more after it: if
   * even that fails the reader keeps the plan they had with a period running longer than they
   * paid for, which is the one direction this is allowed to be wrong in.
   *
   * The stamp goes back to whatever was on the subscription before this call, which is what
   * `live.customData` still holds — read before any of this ran.
   */
  console.error('applyItemChange could not pin the billing date; rolling the items back', live.id)

  await paddle.subscriptions.update(live.id, {
    items: [{ priceId: change.restoreTo, quantity: 1 }],
    prorationBillingMode: 'do_not_bill',
    customData: customDataFor(live, (live.customData?.downgrade as Record<string, unknown> | undefined) ?? null),
  })
  await putBillingDate(paddle, live.id, change.pinTo)

  return { ok: false, reason: 'failed' }
}
