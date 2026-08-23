/**
 * Payment history, read and written through `paddle_events` — the same table a real Paddle
 * webhook will one day fill, not a second one built just for the mock. See
 * `PLAN.md` (v3.6): the point of sharing the table is that the day the real webhook lands,
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
 * Writes one mock event for an account — the only write this file makes. `paddleSubscriptionId`
 * is always null, deliberately: nothing here has ever minted one, and that column stays
 * reserved for the real webhook to key on (`checkout.ts`'s own header).
 */
export async function logMockEvent(input: {
  accountOwnerEmail: string
  action: MockEventAction
  plan: Plan
  cycle: BillingPeriod | null
}): Promise<void> {
  const now = new Date()
  await db().insert(paddleEvents).values({
    eventId: `mock_${randomUUID()}`,
    eventType: `mock.${input.action}`,
    occurredAt: now,
    accountOwnerEmail: input.accountOwnerEmail,
    paddleSubscriptionId: null,
    payload: JSON.stringify({
      mock: true,
      action: input.action,
      plan: input.plan,
      cycle: input.cycle,
      amount: amountFor(input.plan, input.cycle),
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
    .where(eq(paddleEvents.accountOwnerEmail, accountOwnerEmail))
    .orderBy(desc(paddleEvents.receivedAt))

  return rows.map((row) => {
    const action = row.eventType.startsWith('mock.') ? (row.eventType.slice('mock.'.length) as MockEventAction) : 'unknown'

    let plan: Plan | null = null
    let cycle: BillingPeriod | null = null
    let amount: string | null = null
    try {
      const parsed: unknown = JSON.parse(row.payload)
      if (parsed !== null && typeof parsed === 'object') {
        const { plan: rawPlan, cycle: rawCycle, amount: rawAmount } = parsed as Record<string, unknown>
        if (typeof rawPlan === 'string') plan = readPlan(rawPlan)
        if (rawCycle === 'year' || rawCycle === 'month') cycle = rawCycle
        if (typeof rawAmount === 'string') amount = rawAmount
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
    }
  })
}
