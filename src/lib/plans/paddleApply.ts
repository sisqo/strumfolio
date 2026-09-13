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

import { notifyTelegram } from '@/lib/telegram/notify'

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
/**
 * How far the date Paddle reports back may sit from the one asked for and still count as landed.
 *
 * **Exact equality was the wrong test, and it fails in the expensive direction.** The value makes
 * a round trip through a third party — sent as an ISO string, stored, parsed back — and the one
 * measurement behind it (2026-09-13) is not a promise that Paddle will never normalise a
 * timestamp to its own billing time-of-day or precision. If it ever does, a pin that *worked*
 * reads as failed, the retry below reads as failed too, and the rollback undoes a change that
 * had gone through, telling the reader it did not.
 *
 * A minute is enormous margin against what this is actually detecting: an unset date is a whole
 * cycle away — a month or a year — not a second.
 */
const PIN_TOLERANCE_MS = 60_000

/**
 * Whether the date Paddle reported back is the date that was asked for. Pure and exported so the
 * comparison that was wrong is the one thing here a test can hold in place — everything else in
 * this file is I/O.
 */
export function pinLanded(reported: string | null | undefined, wanted: Date): boolean {
  if (reported == null) return false

  const landed = new Date(reported)
  if (Number.isNaN(landed.getTime())) return false

  return Math.abs(landed.getTime() - wanted.getTime()) <= PIN_TOLERANCE_MS
}

async function putBillingDate(paddle: Paddle, id: string, at: Date): Promise<boolean> {
  try {
    const pinned = await paddle.subscriptions.update(id, {
      nextBilledAt: at.toISOString(),
      prorationBillingMode: 'do_not_bill',
    })

    return pinLanded(pinned.nextBilledAt, at)
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
   */
  console.error('applyItemChange could not pin the billing date; rolling the items back', live.id)

  /*
   * **The one failure on this path that costs a customer money, and it used to tell nobody.** A
   * `console.error` on Vercel is a line in a log nobody tails; meanwhile the *cheaper* failure —
   * a subscription left running beside a Lifetime — has sent the operator a Telegram since B9.
   * That was the wrong way round. `notifyTelegram` swallows its own errors and is switched off
   * per event by the operator's own settings, so this cannot fail the change or throw into the
   * rollback below.
   */
  await notifyTelegram(
    'purchase',
    `⚠️ Cambio piano a metà sulla subscription ${live.id}: la data di fatturazione non si è ` +
      'riuscita a rimettere, sto rimettendo indietro gli item. Controlla su Paddle che il ' +
      'periodo finisca il giorno pagato, altrimenti il cliente viene addebitato in anticipo.',
  )

  /*
   * **The stamp goes back to whatever was on the subscription before this call**, which is what
   * `live.customData` still holds — read before any of this ran. Usually that is nothing, and
   * writing `null` would look equivalent; it is not. A change made *on top of* one already
   * arranged carries a real stamp here, and flattening this to `null` would roll the items back
   * while forgetting the promise that was already made to the reader — leaving Paddle on the
   * old plan and this app unable to say why.
   */
  const stampBefore = (live.customData?.downgrade as Record<string, unknown> | null | undefined) ?? null

  await paddle.subscriptions.update(live.id, {
    items: [{ priceId: change.restoreTo, quantity: 1 }],
    prorationBillingMode: 'do_not_bill',
    customData: customDataFor(live, stampBefore),
  })
  await putBillingDate(paddle, live.id, change.pinTo)

  return { ok: false, reason: 'failed' }
}
