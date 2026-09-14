/**
 * Which ledger lines are money, and which row a screen should quote a figure from.
 *
 * **A module of its own for the reason `paymentSummary.ts` states about itself**: the rule reads
 * `PaymentHistoryLine`, whose home is `history.ts` — and that file imports drizzle, the schema
 * and the database client to do the reading. A *type* crosses that boundary for nothing; a
 * function would drag the whole of it into every pure consumer, and `npm test` here is
 * `node:test` over pure functions. So the type is imported type-only and the rule lives here,
 * the sibling-module arrangement the root `CLAUDE.md` describes.
 *
 * **Two words for one thing, and the second one is the live one.** `purchase` is what the mock
 * wrote; `payment` is what a real `transaction.completed` becomes. The mock was demolished on
 * 2026-09-13 and three separate readers went on matching `'purchase'` alone — so from that day
 * every genuine purchase was invisible to them, and `/billing` quietly stopped printing what had
 * been paid and what a discount came off. Nothing failed anywhere: `find` simply answered
 * `undefined`, which all three are written to treat as «no purchase to quote», and the screen
 * showed one fewer line than it should have. `paymentSummary` had the pair right all along,
 * which is why the operator's own total stayed correct and the bug was survivable.
 *
 * One predicate now, so the next event name that means «money moved» is added once.
 */

import type { PaymentHistoryLine } from './history'
import type { Plan } from './types'

export function isPaidLine(line: PaymentHistoryLine): boolean {
  return line.action === 'purchase' || line.action === 'payment'
}

/**
 * The most recent payment for one exact plan — the row every screen quotes a figure from.
 *
 * `history` newest-first, matched on `plan` and not only on the action: an upgrade's own row
 * must win over the cheaper plan underneath it, or a screen would name the price of a plan no
 * longer held.
 *
 * **A renewal is a payment and wins**, deliberately: it is the most recent thing the customer
 * was actually charged, which is what «last paid» means on a billing screen.
 */
export function lastPaidFor(plan: Plan, history: PaymentHistoryLine[]): PaymentHistoryLine | null {
  return history.find((line) => isPaidLine(line) && line.plan === plan) ?? null
}
