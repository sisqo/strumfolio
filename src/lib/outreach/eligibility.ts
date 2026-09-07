/**
 * Whether an account may be sent an action at all — computed at every read, never stored.
 *
 * The same rule `campaignStatus` and `resolveSubscription` follow, and here it is not a
 * preference: consent is withdrawn between one occurrence and the next, an account is suspended
 * between them, a plan lapses between them. A stored `eligible` column would need the
 * reconciliation job this repository has nowhere to put, and the failure would be an email to
 * somebody who unsubscribed last month.
 *
 * Pure, with no `@/lib/db` import: the facts arrive already read (`read.ts`), which is also
 * what makes every branch below testable without a database.
 */

import { isPaidPlan } from './types'
import type { OutreachDefinition } from './types'
import type { Plan } from '@/lib/plans/types'

/** What has to be known about an account before anything may be aimed at it. */
export interface OutreachFacts {
  /** Blocked from signing in (`accounts.suspended_at`) — and so from being marketed to. */
  suspended: boolean
  /**
   * `newsletter_prefs.subscribed`, or **null when the row could not be read at all**.
   *
   * The two are deliberately not collapsed. See `consentGate` for which way null resolves and
   * why it is the opposite direction from `readBooleanSetting`'s.
   */
  newsletterSubscribed: boolean | null
  /** Whose limits actually apply now — `planStateFor`'s answer, gift included, not the raw column. */
  effectivePlan: Plan
}

/**
 * Why an account is not being sent something. Four reasons, and they are not interchangeable
 * on the screen that prints them: «they said no» and «we could not tell whether they said no»
 * are opposite answers, exactly as `rateLimitStatusFor` refuses to print «Not hit» for a read
 * that failed.
 */
export type IneligibleReason = 'suspended' | 'no-consent' | 'consent-unknown' | 'wrong-audience'

export type Eligibility = { eligible: true } | { eligible: false; reason: IneligibleReason }

export const INELIGIBLE_LABEL: Record<IneligibleReason, string> = {
  suspended: 'Account suspended',
  'no-consent': 'Not subscribed to the newsletter',
  'consent-unknown': 'Consent could not be read',
  'wrong-audience': 'Outside this action’s audience',
}

const ELIGIBLE: Eligibility = { eligible: true }

/**
 * The consent half, and the one gate whose direction is worth arguing for.
 *
 * **Only the `email` channel asks.** A message shown inside an account somebody has signed
 * into is not marketing mail and no subscription governs it; requiring one there would make an
 * in-app notice unreachable for exactly the readers most likely to need it.
 *
 * **An unreadable preference refuses.** `readBooleanSetting` argues the generous direction for
 * its own case — the failure nobody notices is the one where something quietly stops — and
 * that argument inverts here, because what would quietly happen instead is marketing mail sent
 * without verified consent. So a null resolves to `consent-unknown`: the action does not go
 * out, and the row on screen says why rather than reading as a refusal the reader made.
 */
function consentGate(definition: OutreachDefinition, facts: OutreachFacts): Eligibility {
  if (definition.channel !== 'email') return ELIGIBLE
  if (facts.newsletterSubscribed === null) return { eligible: false, reason: 'consent-unknown' }
  return facts.newsletterSubscribed ? ELIGIBLE : { eligible: false, reason: 'no-consent' }
}

function audienceGate(definition: OutreachDefinition, facts: OutreachFacts): Eligibility {
  const paid = isPaidPlan(facts.effectivePlan)
  const matches =
    definition.audience === 'everyone' ||
    (definition.audience === 'with_paid_plan' && paid) ||
    (definition.audience === 'without_paid_plan' && !paid)
  return matches ? ELIGIBLE : { eligible: false, reason: 'wrong-audience' }
}

/**
 * All three gates, in the order they are worth reporting in: suspension first because it is
 * the hardest fact and covers the account whatever the action, then consent, then audience.
 *
 * Only the first refusal is returned. A suspended free account outside a paying audience has
 * two reasons and one of them is the reason: whoever reads the row wants the sentence that
 * would have to change for the action to go out, not a list.
 *
 * What this deliberately does **not** consider is whether the action has already been done.
 * That is a row in `outreach_actions` and a unique index, not an opinion — keeping the two
 * apart is what lets the screen say «eligible, and already done this year».
 */
export function eligibilityFor(definition: OutreachDefinition, facts: OutreachFacts): Eligibility {
  if (facts.suspended) return { eligible: false, reason: 'suspended' }

  const consent = consentGate(definition, facts)
  if (!consent.eligible) return consent

  return audienceGate(definition, facts)
}
