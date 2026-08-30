/**
 * What a piece of feedback is, and what can be wrong with one.
 *
 * A plain module beside `actions.ts` rather than part of it, for the reason CLAUDE.md
 * gives: a `'use server'` module may only export async functions, so the length check,
 * the category labels and the wording live here where a test can reach them.
 */

export type FeedbackCategory = 'feature' | 'bug' | 'improvement' | 'other'

export const FEEDBACK_CATEGORIES = [
  'feature',
  'bug',
  'improvement',
  'other',
] as const satisfies readonly FeedbackCategory[]

/**
 * The mock's own four card labels, reused everywhere a category needs a name: the sheet's
 * grid, the email subject, the Telegram ping — one spelling so the three can't drift apart.
 */
export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  feature: 'Feature request',
  bug: 'Bug report',
  improvement: 'Improvement',
  other: 'Something else',
}

/** One message field replaces `featureRequest`'s summary+detail split — the mock has a
 *  single "Your message" textarea, so this is the one length that matters. */
export const MESSAGE_MAX = 4000

/** Same floor `featureRequest`'s `SUMMARY_MIN` used: rejects an empty field and a stray
 *  keystroke, nothing stricter — a message that's too short to act on is answered by a
 *  person asking, not refused by a length. */
export const MESSAGE_MIN = 5

export type FeedbackProblem = 'too-short' | 'too-long'

export function feedbackProblem(message: string): FeedbackProblem | null {
  const trimmed = message.trim()
  if (trimmed.length < MESSAGE_MIN) return 'too-short'
  if (trimmed.length > MESSAGE_MAX) return 'too-long'
  return null
}

/** ~4MB of source bytes, checked before base64 inflates it by a third — about keeping one
 *  email payload sane, not a Resend limit (theirs is far higher). */
export const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024

/** Base64 length approximates the decoded byte count (6 bits/char) without decoding it. */
export function screenshotTooLarge(base64: string): boolean {
  return base64.length * 0.75 > SCREENSHOT_MAX_BYTES
}

export interface FeedbackScreenshot {
  filename: string
  mimeType: string
  /** No `data:` URL prefix — the exact shape Resend's own attachments field takes. */
  base64: string
}

export type FeedbackResult =
  | { ok: true }
  | { ok: false; reason: FeedbackProblem | 'plan-required' | 'no-session' | 'rate-limited' | 'failed' }

export const FEEDBACK_MESSAGE: Record<
  Exclude<Extract<FeedbackResult, { ok: false }>['reason'], 'plan-required'>,
  string
> = {
  'too-short': 'Tell us a little more about what happened.',
  'too-long': 'That is longer than we can send — trim it a little.',
  'no-session': 'Your session has expired. Sign in again and resend it.',
  'rate-limited': 'You have sent a few of these just now. Try again in a few minutes.',
  failed: 'Something went wrong on our side. Please try again.',
}

/** A short line for the email subject and the Telegram ping — trimmed, collapsed to one
 *  line, and only ever cut with an ellipsis when it actually had to be. */
export function excerpt(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}...` : trimmed
}
