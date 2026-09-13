/**
 * The four figures over the payment table on `/accounts/[email]`'s Payments tab
 * (`Account Detail.dc.html`) — collected, events, last payment — derived from the ledger the
 * table below them already renders, never from a second read.
 *
 * A plain module beside the screens rather than a function in `lib/plans/history.ts`: that
 * file opens a database connection at import time, and `npm test` is `node:test` over pure
 * functions (CLAUDE.md). Only the row *type* comes from there, as a type-only import, so
 * nothing of it is pulled in at runtime.
 */

import { toCents } from '@/lib/coupons/discount'
import type { PaymentHistoryLine } from '@/lib/plans/history'

/** What the strip prints. Every field is already a string a cell can show, or null for «—». */
export interface PaymentSummary {
  /**
   * Everything ever charged, as `euro()` wants it — a decimal string, no sign. `'0.00'` for an
   * account that never bought anything, which is a figure worth printing rather than a dash:
   * "nothing was collected" is an answer.
   */
  collected: string
  /** Every row in the ledger, purchases and plan changes alike — the table's own length. */
  events: number
  /** The day of the most recent purchase, `YYYY-MM-DD`, or null when there has never been one. */
  lastPaymentOn: string | null
}

/** `3430` → `'34.30'`, the shape `euro()` prefixes a sign to. */
function decimal(total: number): string {
  return `${Math.trunc(total / 100)}.${String(total % 100).padStart(2, '0')}`
}

/**
 * Summarises one account's ledger.
 *
 * **Only `purchase` rows count toward the total, and that is not a tidiness choice.**
 * the ledger falls back to the catalogue price for the actions where nothing was charged
 * (`cancelled_now`, `force_expired`, `kept_current` — see its own comment on `amount`), so
 * those rows carry a perfectly plausible figure for money that never moved. Summing every
 * amount would report a refunded, cancelled account as one of the best-paying in the
 * installation.
 *
 * `history` arrives newest-first from `paymentHistoryFor`, which is why `find` is enough for
 * the last payment; the total does not care about order.
 */
export function paymentSummary(history: PaymentHistoryLine[]): PaymentSummary {
  let total = 0
  for (const line of history) {
    /* `purchase` is the mock's word for it and `payment` is Paddle's; both are money that
       actually moved, and every other action is a plan changing. Adding Paddle's here is what
       stopped this reading €0.00 for accounts that had genuinely paid. */
    if ((line.action !== 'purchase' && line.action !== 'payment') || line.amount === null) continue
    total += toCents(line.amount) ?? 0
  }

  const paid = history.find((line) => line.action === 'purchase' || line.action === 'payment')

  return {
    collected: decimal(total),
    events: history.length,
    lastPaymentOn: paid === undefined ? null : paid.occurredAt.toISOString().slice(0, 10),
  }
}
