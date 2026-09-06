/**
 * Payment history, read and written through `paddle_events` — the same table a real Paddle
 * webhook will one day fill, not a second one built just for the mock.
 * The point of sharing the table is that the day the real webhook lands,
 * the user's and the operator's history screens need no new read path at all.
 *
 * `logMockEvent` is the only writer today, called from `checkout.ts`'s mutation functions.
 * `eventType` carries a `mock.` prefix so these rows stay visually and query-ably distinct
 * from Paddle's own dotted names (`subscription.created`, ...) the moment those start
 * arriving in the same table.
 */

import { randomUUID } from 'crypto'
import { desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { accountIdOf } from '@/lib/db/ids'
import { paddleEvents } from '@/lib/db/schema'

import { LIFETIME, PRICES } from './prices'
import type { BillingPeriod } from './prices'
import { readPlan } from './types'
import type { Plan } from './types'

/**
 * What one mock write actually did — the vocabulary a history line can describe.
 *
 * `cancelled_now` is not a duplicate of `scheduled_change` with `plan: 'free'`: that one says
 * "at the end of the period", and `mockCancel` has a branch where there is no period left to
 * end (a row with no `planExpiresAt` — see its own comment), which drops the plan on the spot.
 * Logging both the same way put "Scheduled: cancel at period end" in the history directly under
 * a confirmation saying the account was already back on Free.
 */
export type MockEventAction = 'purchase' | 'scheduled_change' | 'cancelled_now' | 'force_expired' | 'kept_current'

/**
 * One row of history, already parsed for a screen to render — never the raw `payload`, which
 * stays this file's own concern.
 *
 * `action` and `plan`/`cycle`/`amount` are independently nullable-ish because a row this file
 * did not write itself can still land in `paddle_events` one day (a real Paddle event, or one
 * corrupted beyond parsing): it must still show up, dated, rather than vanish or throw — see
 * `paymentHistoryFor`'s own comment.
 */
export interface PaymentHistoryLine {
  id: string
  occurredAt: Date
  action: MockEventAction | 'unknown'
  plan: Plan | null
  cycle: BillingPeriod | null
  /** Euro, as `PRICES`/`LIFETIME` already print it — a fake charge, never a real one. */
  amount: string | null
  /**
   * The coupon redeemed on this line, and what the listino said at the time.
   *
   * Read back out of the payload, never re-derived: that is the whole reason `logMockEvent`
   * takes an explicit `amount` now rather than calling `amountFor` itself — a later re-price
   * must not rewrite what somebody already paid, nor what they were shown it was reduced from.
   * `null` on every line that had no coupon, which is most of them.
   */
  couponCode: string | null
  couponPercent: string | null
  fullAmount: string | null
}

/**
 * The price this mock would have shown before the purchase this event records — never a real
 * charge.
 *
 * Exported because the thank-you email names the same figure (`purchaseEmail`, sent from
 * `mockPurchase`): two copies of "what does this plan cost for this cycle" are two copies that
 * drift, and a receipt disagreeing with the ledger row written in the same breath is the exact
 * kind of contradiction this feature keeps avoiding elsewhere.
 */
export function amountFor(plan: Plan, cycle: BillingPeriod | null): string | null {
  if (plan === 'lifetime') return LIFETIME.amount
  if (plan === 'free' || cycle === null) return null
  return PRICES[plan][cycle].amount
}

/**
 * The cycle the most recent purchase of this exact plan actually paid for — the one fact
 * `accounts` never stores as a column of its own (see `subscriptionCopy.ts`'s own comment on
 * `lastPaymentLine`, which reads the same ledger for the same reason). `null` when this plan
 * was never bought through this ledger at all — a manually granted plan, most likely — and a
 * caller wanting to offer "the other cycle" has no honest opposite to offer then.
 *
 * `history` newest-first, matched on `plan` and not only on the action, for the same reason
 * `lastPaymentLine` matches on both: an upgrade's own row must win over the cheaper plan
 * underneath it, or this would answer with the cycle of a plan no longer held.
 */
export function mostRecentCycleFor(plan: Plan, history: PaymentHistoryLine[]): BillingPeriod | null {
  const paid = history.find((line) => line.action === 'purchase' && line.plan === plan)
  return paid?.cycle ?? null
}

/**
 * Writes one mock event for an account — the only write this file makes. `paddleSubscriptionId`
 * is always null, deliberately: nothing here has ever minted one, and that column stays
 * reserved for the real webhook to key on (`checkout.ts`'s own header).
 */
export async function logMockEvent(input: {
  accountOwnerEmail: string
  action: MockEventAction
  plan: Plan
  cycle: BillingPeriod | null
  /**
   * What was actually charged, as opposed to what the catalogue says today.
   *
   * **Passed in rather than recomputed, since coupons landed**, and the change is worth the
   * paragraph. This used to write `amountFor(input.plan, input.cycle)` — a fresh read of
   * `PRICES` — which was correct only for as long as nobody was ever charged anything but the
   * listino. With a discount it reported the full price for a purchase that took less; and
   * because `paymentHistoryFor` reads this payload back rather than recomputing, a re-price
   * would have rewritten history that had already happened.
   *
   * Omitted for the actions where nothing is charged (`cancelled_now`, `force_expired`,
   * `kept_current`), which fall back to the catalogue exactly as before — those are records of
   * a plan changing, not of money moving.
   */
  amount?: string | null
  /** The campaign redeemed, when one was — so a history line can say why it cost less. */
  coupon?: { code: string; percent: string; fullAmount: string } | null
}): Promise<void> {
  const now = new Date()
  await db().insert(paddleEvents).values({
    eventId: `mock_${randomUUID()}`,
    eventType: `mock.${input.action}`,
    occurredAt: now,
    /* Both columns, and they are not redundant (v4.7): the address is the historical fact —
       who this arrived for, never rewritten afterwards — and the id is the pointer every read
       uses, so a later change of address does not detach a payment from its account. See
       `paddleEvents` in `db/schema.ts`. */
    accountOwnerEmail: input.accountOwnerEmail,
    accountId: accountIdOf(input.accountOwnerEmail),
    paddleSubscriptionId: null,
    payload: JSON.stringify({
      mock: true,
      action: input.action,
      plan: input.plan,
      cycle: input.cycle,
      /* `undefined` means "nothing was charged here, ask the catalogue"; an explicit `null`
         from the caller means the same and is preserved as such. See the field's comment. */
      amount: input.amount === undefined ? amountFor(input.plan, input.cycle) : input.amount,
      ...(input.coupon == null
        ? {}
        : {
            couponCode: input.coupon.code,
            couponPercent: input.coupon.percent,
            fullAmount: input.coupon.fullAmount,
          }),
    }),
  })
}

/**
 * One account's payment history, newest first — every row in `paddle_events` for that
 * address, not only the ones this file wrote. A row whose `eventType` carries no `mock.`
 * prefix, or whose `payload` this cannot parse as its own shape, still returns as a bare
 * `{ action: 'unknown', plan: null, cycle: null, amount: null }` line rather than being
 * dropped or throwing — the ledger's job is to have the event, the same principle
 * `db/schema.ts` states for the table itself.
 *
 * Callers decide who may ask for whose history: this function itself checks nothing, the
 * same split `checkout.ts`'s self-scoped read and `accounts/actions.ts`'s owner-gated read
 * already draw for every other query in this feature.
 */
export async function paymentHistoryFor(accountOwnerEmail: string): Promise<PaymentHistoryLine[]> {
  const rows = await db()
    .select({
      eventId: paddleEvents.eventId,
      eventType: paddleEvents.eventType,
      occurredAt: paddleEvents.occurredAt,
      receivedAt: paddleEvents.receivedAt,
      payload: paddleEvents.payload,
    })
    .from(paddleEvents)
    /* By the id and not the address (v4.7): an account that changed address keeps its
       payment history, without anything having had to move the old rows to the new
       address — which is what `changeAccountEmail` used to do, and must not. */
    .where(eq(paddleEvents.accountId, accountIdOf(accountOwnerEmail)))
    .orderBy(desc(paddleEvents.receivedAt))

  return rows.map((row) => {
    const action = row.eventType.startsWith('mock.') ? (row.eventType.slice('mock.'.length) as MockEventAction) : 'unknown'

    let plan: Plan | null = null
    let cycle: BillingPeriod | null = null
    let amount: string | null = null
    let couponCode: string | null = null
    let couponPercent: string | null = null
    let fullAmount: string | null = null
    try {
      const parsed: unknown = JSON.parse(row.payload)
      if (parsed !== null && typeof parsed === 'object') {
        const {
          plan: rawPlan,
          cycle: rawCycle,
          amount: rawAmount,
          couponCode: rawCode,
          couponPercent: rawPercent,
          fullAmount: rawFull,
        } = parsed as Record<string, unknown>
        if (typeof rawPlan === 'string') plan = readPlan(rawPlan)
        if (rawCycle === 'year' || rawCycle === 'month') cycle = rawCycle
        if (typeof rawAmount === 'string') amount = rawAmount
        if (typeof rawCode === 'string') couponCode = rawCode
        if (typeof rawPercent === 'string') couponPercent = rawPercent
        if (typeof rawFull === 'string') fullAmount = rawFull
      }
    } catch {
      // Not a payload this file wrote — occurredAt/receivedAt and the bare event type are
      // still shown, exactly as this function's own header promises.
    }

    return {
      id: row.eventId,
      occurredAt: row.occurredAt ?? row.receivedAt,
      action,
      plan,
      cycle,
      amount,
      couponCode,
      couponPercent,
      fullAmount,
    }
  })
}
