/**
 * Sample subscription states for `/thanks?preview=<plan>` — the global-owner-only way to see
 * every state the thank-you page can render without an actual, or even mock, purchase going
 * through. Mirrors `lib/email/preview.ts`: fixed, made-up data instead of anything read from an
 * account, so a preview never depends on the mock checkout being switched on and two previews
 * of the same plan are always the same bytes.
 */

import type { MockSubscriptionState } from './checkout'
import type { Plan } from './types'

/** The same renewal date `email/preview.ts`'s `SAMPLE_PURCHASE` uses, so the two previews agree. */
const SAMPLE_RENEWAL = new Date('2027-09-22T00:00:00.000Z')

export function buildThanksPreview(plan: Plan): MockSubscriptionState {
  /* No discount in any preview, deliberately: `/thanks` says nothing about a coupon, so
     inventing one here would be sample data for a sentence that does not exist. */
  if (plan === 'free') return { plan, status: 'active', expiresAt: null, pendingPlan: null, discount: null }

  return {
    plan,
    status: 'active',
    // `lifetime` is the one plan `ThanksScreen` renders with no renewal date at all.
    expiresAt: plan === 'lifetime' ? null : SAMPLE_RENEWAL,
    pendingPlan: null,
    discount: null,
  }
}
