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

/**
 * `'34.30'` → `3430`. Integer cents, because summing `Number('4.90')` twelve times reaches
 * 58.799999999999996 and a control panel that reports €58.80 as €58.79999 has lost the
 * argument. Every amount in this ledger is written by `logMockEvent` from `PRICES`/`LIFETIME`
 * or a coupon calculation over them, so two decimals at most; `padEnd`/`slice` keeps a stray
 * one- or three-decimal string from shifting the whole figure by a factor of ten.
 *
 * Null for anything that will not parse. A row this app did not write can land in
 * `paddle_events` one day (`PaymentHistoryLine`'s own comment), and a garbled amount must
 * cost that one row's contribution to the total, never turn the total into `NaN`.
 */
function cents(amount: string): number | null {
  const [whole = '', fraction = ''] = amount.trim().split('.')
  const euros = Number.parseInt(whole, 10)
  const rest = Number.parseInt(fraction.padEnd(2, '0').slice(0, 2) || '0', 10)
  if (!Number.isFinite(euros) || !Number.isFinite(rest)) return null
  return euros * 100 + rest
}

/** `3430` → `'34.30'`, the shape `euro()` prefixes a sign to. */
function decimal(total: number): string {
  return `${Math.trunc(total / 100)}.${String(total % 100).padStart(2, '0')}`
}

/**
 * Summarises one account's ledger.
 *
 * **Only `purchase` rows count toward the total, and that is not a tidiness choice.**
 * `logMockEvent` falls back to the catalogue price for the actions where nothing was charged
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
    if (line.action !== 'purchase' || line.amount === null) continue
    total += cents(line.amount) ?? 0
  }

  const paid = history.find((line) => line.action === 'purchase')

  return {
    collected: decimal(total),
    events: history.length,
    lastPaymentOn: paid === undefined ? null : paid.occurredAt.toISOString().slice(0, 10),
  }
}
