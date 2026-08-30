'use server'

/**
 * A reader telling us something — a bug, an idea, a request, or just a thought — from the
 * one "Share your feedback" sheet reachable from everywhere except the reading screen and
 * the editor. Replaces `featureRequest/actions.ts`: the plan gate, the rate limit and the
 * email send it had are folded in here, now covering three more categories that were never
 * gated at all.
 *
 * No database table behind it, for the same reason `featureRequest/actions.ts` gave: an
 * inbox reaches a person who can answer, and a table would only add a migration and a
 * second place for the same sentence to live. `sendEmail` never throws and reports nothing
 * back, so `{ ok: true }` here means "accepted and sent", not "delivered" — same asymmetry.
 */

import { currentUser } from '@/lib/auth/session'
import { sendEmail } from '@/lib/email/send'
import { feedbackEmail } from '@/lib/email/templates'
import { entitlementsOf } from '@/lib/plans/resolve'
import { PLAN_LABEL } from '@/lib/plans/types'
import { checkRateLimit } from '@/lib/rateLimit'
import { notifyTelegram } from '@/lib/telegram/notify'

import {
  FEEDBACK_CATEGORY_LABEL,
  MESSAGE_MAX,
  excerpt,
  feedbackProblem,
  screenshotTooLarge,
  type FeedbackCategory,
  type FeedbackResult,
  type FeedbackScreenshot,
} from './types'

/** Same inbox `requestFeature` and the legal pages' `CONTACT` already use. */
const INBOX = 'info@strumfolio.com'

/** Same generosity `requestFeature` chose: this defends against a stuck submit button, not
 *  an attacker — the surface is signed-in-only. */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Sends one piece of feedback, or says why it did not.
 *
 * Only `category === 'feature'` is gated — Bug report, Improvement and Something else are
 * open to every plan, exactly as the mock draws them. The gate is re-checked here against
 * `entitlementsOf`, never trusted from whatever `FeedbackSheet` decided client-side: the
 * same two-halves arrangement `requestFeature` already used, so a reader who reaches this
 * another way still can't ask for a feature request their plan refuses.
 */
export async function submitFeedback(
  category: FeedbackCategory,
  message: string,
  screenshot?: FeedbackScreenshot,
): Promise<FeedbackResult> {
  const user = await currentUser()
  if (user === null) return { ok: false, reason: 'no-session' }

  const problem = feedbackProblem(message)
  if (problem !== null) return { ok: false, reason: problem }

  if (screenshot !== undefined && screenshotTooLarge(screenshot.base64)) return { ok: false, reason: 'too-long' }

  try {
    const entitlements = await entitlementsOf(user.accountOwnerEmail)

    if (category === 'feature' && entitlements.refused.featureRequest !== null) {
      return { ok: false, reason: 'plan-required' }
    }

    if (!(await checkRateLimit(`feedback:${user.email}`, RATE_LIMIT, RATE_WINDOW_MS))) {
      return { ok: false, reason: 'rate-limited' }
    }

    const trimmedMessage = message.trim().slice(0, MESSAGE_MAX)
    const priority = category === 'feature' && entitlements.limits.featureRequests === 'priority'
    const plan = entitlements.state === null ? 'no plan enforced' : PLAN_LABEL[entitlements.state.effectivePlan]

    await sendEmail({
      to: INBOX,
      replyTo: user.email,
      attachments:
        screenshot === undefined
          ? undefined
          : [{ filename: screenshot.filename, content: screenshot.base64 }],
      ...feedbackEmail({
        from: user.email,
        plan,
        category,
        priority,
        message: trimmedMessage,
        screenshotFilename: screenshot?.filename ?? null,
      }),
    })

    /*
     * Category and a short excerpt go straight into the one line of text, the same way
     * every other `notifyTelegram` call bakes its own facts in rather than passing a bare
     * event name — see that function's own comment.
     */
    await notifyTelegram(
      'feedback',
      `💬 Feedback (${FEEDBACK_CATEGORY_LABEL[category]}${priority ? ', priority' : ''}): ${user.email} — "${excerpt(trimmedMessage, 80)}"`,
    )

    return { ok: true }
  } catch (error) {
    console.error('submitFeedback failed', error)
    return { ok: false, reason: 'failed' }
  }
}
