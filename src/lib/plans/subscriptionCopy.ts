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
import type { MockSubscriptionState } from './checkout'

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
 */
export function subscriptionStatusLine(current: MockSubscriptionState): string {
  if (current.plan === 'free') return 'Free — nothing bought yet.'
  if (current.plan === 'lifetime') return 'Lifetime — bought once, nothing to renew or cancel.'
  if (current.status === 'expired') return `${PLAN_LABEL[current.plan]}, expired.`
  if (current.status === 'grace') return `${PLAN_LABEL[current.plan]}, payment retrying.`
  if (current.expiresAt === null) return `${PLAN_LABEL[current.plan]}, no end.`

  const until = formatPlanDate(current.expiresAt)
  return current.pendingPlan !== null
    ? `${PLAN_LABEL[current.plan]} until ${until}, then ${PLAN_LABEL[current.pendingPlan]}.`
    : `${PLAN_LABEL[current.plan]}, active until ${until}.`
}
