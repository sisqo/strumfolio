/**
 * The one sentence that says what an account's subscription is right now — read by
 * `/billing` and `/checkout/[plan]` alike, so the two screens describing the exact same
 * fact cannot drift into two different sentences the way they used to: `/billing` never
 * named a `grace` subscription at all (falling through to "active until <a date already in
 * the past>"), and `/checkout/[plan]` had its own third phrasing that named neither `grace`
 * nor `lifetime` specially. A plain module, not `'use server'`: `lib/plans/checkout.ts` (the
 * type this reads) is one, and a `'use server'` module may only export async functions —
 * the same reason `plans/testCard.ts` exists beside `checkout.ts` rather than inside it.
 */

import { PLAN_LABEL } from './types'
import type { Plan } from './types'
import { euro } from './prices'
import type { MockSubscriptionState } from './checkout'
import type { PaymentHistoryLine } from './history'

/**
 * A renewal date as a reader would write it — «22 September 2026» — the same form the
 * purchase email and `/thanks` already use. Not `toISOString().slice(0, 10)`, which is what
 * `/billing` and `/checkout/[plan]` each used to print on their own: a machine-readable date
 * sitting next to plain English elsewhere on the same screen reads as unfinished.
 */
export function formatPlanDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * `grace` checked ahead of the `expiresAt === null` branch and named on its own, never a
 * date: a failing card's `expiresAt` is virtually always already in the past (`grace` is
 * defined to ignore dates for exactly that reason, `entitlements.ts`), so printing it would
 * read as an already-lapsed plan instead of one still in force while payment retries — the
 * same reasoning `lib/accounts/planText.ts`'s own `subscriptionLine` already applies for the
 * operator screen, mirrored here for the customer-facing one.
 *
 * **`live` is a parameter and is never re-derived here**, for the reason this whole module
 * exists. A subscription stops being in force for two different reasons and only one of them
 * writes anything down: `planStatus: 'expired'` is a webhook's deliberate act, while a
 * `planExpiresAt` in the past ends the plan all on its own, with the status column still
 * reading `active` for ever after. Nothing in this repository renews anything, so the second
 * case is not an edge — it is where *every* plan bought through the mock eventually lands, and
 * this sentence used to greet it with "Standard, active until 3 May 2026", a date already gone
 * by, on the very screen a customer opens to find out where they stand. The rule that decides
 * it is `liveSubscription`'s, read once per request beside the clock (`loadCheckoutStatus`,
 * `loadPurchaseSummary`), and this function is handed the answer rather than guessing at it
 * from the two columns — a second copy of that comparison is the drift this file was written
 * to end.
 *
 * `null` means nothing is running: expired, or lapsed by date. `grace` is never null, which is
 * what keeps a retrying card on its own sentence instead of being mourned as a dead plan.
 *
 * The lifetime branch sits **after** the two status branches, not before them: a lifetime that
 * a refund or a chargeback has marked `expired` is still a plan that ended, and saying "bought
 * once, nothing to renew or cancel" over it would describe the purchase rather than the state.
 */
export function subscriptionStatusLine(current: MockSubscriptionState, live: Plan | null): string {
  if (current.plan === 'free') return 'Free — nothing bought yet.'
  if (current.status === 'expired') return `${PLAN_LABEL[current.plan]}, expired.`
  if (current.status === 'grace') return `${PLAN_LABEL[current.plan]}, payment retrying.`
  if (current.plan === 'lifetime') return 'Lifetime — bought once, nothing to renew or cancel.'

  /* Lapsed by date alone. The date is named because it is the one fact that explains it — and
     "ended" rather than "expired", which is the word this app reserves for the stored status. */
  if (live === null) {
    return current.expiresAt === null
      ? `${PLAN_LABEL[current.plan]}, ended.`
      : `${PLAN_LABEL[current.plan]}, ended ${formatPlanDate(current.expiresAt)}.`
  }

  if (current.expiresAt === null) return `${PLAN_LABEL[current.plan]}, no end.`

  const until = formatPlanDate(current.expiresAt)
  return current.pendingPlan !== null
    ? `${PLAN_LABEL[current.plan]} until ${until}, then ${PLAN_LABEL[current.pendingPlan]}.`
    : `${PLAN_LABEL[current.plan]}, active until ${until}.`
}

/**
 * What was actually paid, and for how long a period — the two facts `/billing` never said.
 *
 * A billing screen exists to answer «what was I charged, and when», and this one answered
 * neither: `subscriptionStatusLine` above names the plan and the day it runs to, and that was
 * the whole of it. No amount, and no period — a reader could not tell «Standard, active until
 * 22 September 2026» on a yearly plan from the same sentence on a monthly one renewed eleven
 * times.
 *
 * **Read out of the ledger, not out of a column, and that is not a shortcut.** No column
 * anywhere stores the cycle a live subscription is on: `accounts.pendingCycle` is the only one
 * in the schema and, by its own comment, is null unless a change is already scheduled. The
 * ledger `logMockEvent` writes does carry it, on the row that recorded the purchase itself —
 * which is the row this reads, and the same row `PaymentHistoryTable` prints two cards further
 * down the same screen. The two therefore cannot disagree, which a new column would have made
 * possible on the day one write updated it and the other did not.
 *
 * `history` is expected newest-first, which is how `loadMyPaymentHistory` returns it
 * (`orderBy(desc(receivedAt))`) — so the first match is the most recent purchase and not merely
 * some purchase. Matched on `plan` as well as on the action, so an upgrade's own row wins over
 * the older, cheaper plan's underneath it: the figure named has to be the figure paid for the
 * plan that is running now.
 *
 * `null` — no line at all rather than a hedged one — whenever there is nothing certain to say:
 * a free account, a plan bought before this ledger existed, or a row with no amount on it. An
 * absent sentence is read as "not applicable"; a vague one gets read as a fact.
 *
 * Deliberately says nothing about what happens next. That is `subscriptionStatusLine`'s
 * «active until <date>», and it stays as bare as it is on purpose: nothing in this repository
 * renews anything (see `checkout.ts`'s own header), so a word like "renews" here would promise
 * a charge that never comes — the mistake the purchase email was making until v3.13.
 */
export function lastPaymentLine(
  current: MockSubscriptionState,
  history: PaymentHistoryLine[],
): string | null {
  if (current.plan === 'free') return null

  const paid = history.find((line) => line.action === 'purchase' && line.plan === current.plan)
  if (paid === undefined || paid.amount === null) return null

  const when = formatPlanDate(paid.occurredAt)

  /* No cycle is `lifetime`'s own shape, not a missing value — see `PaymentHistoryLine.cycle`. */
  return paid.cycle === null
    ? `${euro(paid.amount)} paid once, on ${when}.`
    : `${euro(paid.amount)} paid on ${when}, for ${paid.cycle === 'year' ? 'a year' : 'a month'}.`
}
