/**
 * What a feature request is, and what can be wrong with one.
 *
 * A plain module beside `actions.ts` rather than part of it, for the reason CLAUDE.md gives:
 * a `'use server'` module may only export async functions, so the lengths, the wording and
 * the one synchronous check live here where a test can reach them.
 */

/** The one-line summary, which becomes the email's subject. */
export const SUMMARY_MAX = 120

/** Everything else the reader wants to say, which is optional. */
export const DETAIL_MAX = 4000

/**
 * Short enough to be a real floor and no more. Five characters rejects an empty field and a
 * stray keystroke; anything above that starts guessing at what a good request looks like,
 * which is not this function's business — a request the dev team cannot act on is answered
 * by a person asking, not refused by a length.
 */
export const SUMMARY_MIN = 5

export type FeatureRequestProblem = 'too-short' | 'too-long'

/**
 * What is wrong with this request, or null when nothing is.
 *
 * Both fields at once rather than one call per field: the form has one message line, and
 * "too long" about the summary and about the detail are the same sentence to the reader.
 */
export function featureRequestProblem(summary: string, detail: string): FeatureRequestProblem | null {
  const trimmed = summary.trim()
  if (trimmed.length < SUMMARY_MIN) return 'too-short'
  if (trimmed.length > SUMMARY_MAX || detail.trim().length > DETAIL_MAX) return 'too-long'
  return null
}

/**
 * Why a request was not sent.
 *
 * `plan-required` is the plan's own refusal and the only one with a purchase behind it —
 * carried as a `LimitReason` value on purpose, so `FeatureRequestScreen` can hand it
 * straight to `PlanUpgradeModal` the way every other plan refusal in the app is handled.
 * `no-session` is nobody signed in, which the menu entry cannot be reached without and so
 * only happens to a session that expired while the form was open.
 */
export type FeatureRequestResult =
  | { ok: true }
  | { ok: false; reason: FeatureRequestProblem | 'plan-required' | 'no-session' | 'rate-limited' | 'failed' }

export const FEATURE_REQUEST_MESSAGE: Record<
  Exclude<Extract<FeatureRequestResult, { ok: false }>['reason'], 'plan-required'>,
  string
> = {
  'too-short': 'Tell us in a line or two what you would like Strumfolio to do.',
  'too-long': 'That is longer than we can send — trim it a little.',
  'no-session': 'Your session has expired. Sign in again and resend it.',
  'rate-limited': 'You have sent a few of these just now. Try again in a few minutes.',
  failed: 'Something went wrong on our side. Please try again.',
}
