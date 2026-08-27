'use server'

/**
 * A reader asking the dev team for a feature — the one thing in this app a paying customer
 * sends *to* us rather than reads from us.
 *
 * No database table behind it, deliberately. What a feature request needs is to reach a
 * person who can answer it, and an inbox does that with nothing to build; a table would add
 * a migration, an admin screen to read it on and a second place for the same sentence to
 * live. If that inbox ever stops being enough, the send is the part that would stay.
 *
 * That choice has one consequence worth stating plainly rather than discovering later:
 * `sendEmail` never throws and reports nothing back (see its own comment — every other
 * email in this app is a side effect of an action that has already written its row, so
 * failing loudly would undo nothing and break something). Here the send *is* the action, so
 * `{ ok: true }` means "accepted and sent" rather than "delivered", and a Resend failure is
 * visible only in the server log. Reporting real delivery means changing `sendEmail`'s
 * signature for all five of its callers, which is a bigger decision than this feature.
 */

import { currentUser } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/send'
import { featureRequestEmail } from '@/lib/email/templates'
import { entitlementsOf } from '@/lib/plans/resolve'
import { PLAN_LABEL } from '@/lib/plans/types'
import { checkRateLimit } from '@/lib/rateLimit'

import { DETAIL_MAX, SUMMARY_MAX, type FeatureRequestResult, featureRequestProblem } from './types'

/**
 * Where these land. The same address the four legal pages print as their own `CONTACT`, and
 * a copy of it rather than a shared constant for the reason those four are copies of each
 * other: each of them has it inline in prose a lawyer reads, and this one is a destination a
 * mail server reads. They must agree, and they do; nothing enforces it, which is the same
 * standing already true of that set.
 */
const INBOX = 'info@strumfolio.com'

/**
 * Proposed, not tuned — the same status as `register`'s own constant. Generous on purpose:
 * this is only reachable by a paying customer, so the thing being defended against is a
 * stuck submit button rather than an attacker.
 */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Sends one feature request, or says why it did not.
 *
 * The plan is asked of `entitlementsOf` and never inferred from anything the browser sent:
 * `FeatureRequestScreen` reads `plan` out of `RoleProvider` to decide whether to draw the
 * form at all, which is the half a reader experiences, and this is the half that cannot be
 * bypassed by a reader who reaches the action another way — the same two-halves arrangement
 * `PlanLimits.ukulele` describes for the ukulele.
 *
 * Trimmed before it is measured and before it is sent, so the length the check ran on is the
 * length that goes in the email — and the substring caps are belt and braces: the check
 * above has already refused anything longer, and an email built from unbounded input is not
 * something to leave resting on one `if`.
 */
export async function requestFeature(summary: string, detail: string): Promise<FeatureRequestResult> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const problem = featureRequestProblem(summary, detail)
  if (problem !== null) return { ok: false, reason: problem }

  try {
    const entitlements = await entitlementsOf(user.accountOwnerEmail)
    if (entitlements.refused.featureRequest !== null) return { ok: false, reason: 'plan-required' }

    if (!(await checkRateLimit(`feature-request:${user.email}`, RATE_LIMIT, RATE_WINDOW_MS))) {
      return { ok: false, reason: 'rate-limited' }
    }

    /*
     * `state` is null with `SONGBOOK_PLANS` off, and then there is no plan to name — the
     * request still goes, since `refused.featureRequest` was null, and the line in the email
     * says as much rather than inventing a tier. Priority likewise reads the limits table
     * rather than the plan name, so it stays right if a plan's row ever changes.
     */
    const plan = entitlements.state === null ? 'no plan enforced' : PLAN_LABEL[entitlements.state.effectivePlan]

    await sendEmail({
      to: INBOX,
      replyTo: user.email,
      ...featureRequestEmail({
        from: user.email,
        plan,
        priority: entitlements.limits.featureRequests === 'priority',
        summary: summary.trim().slice(0, SUMMARY_MAX),
        detail: detail.trim().slice(0, DETAIL_MAX),
      }),
    })

    return { ok: true }
  } catch (error) {
    console.error('requestFeature failed', error)
    return { ok: false, reason: 'failed' }
  }
}
