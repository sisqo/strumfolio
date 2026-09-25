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

/** 2 MB of source bytes, checked before base64 inflates it by a third. Not a Resend limit but
 *  the request's: `next.config.ts`'s `bodySizeLimit` is 3 MB, under Vercel's 4.5 MB, and a
 *  4 MB image — the old cap — could never arrive whatever the sheet allowed. */
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024

/** What may be attached: the image types a phone or a desktop screenshot actually produces. */
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

/** The extension each accepted type is sent under, whatever name the file arrived with. */
const SCREENSHOT_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/** The first bytes of each accepted type, read as Latin-1 so each character is one byte — `atob`
 *  rather than `Buffer` because the sheet imports this module into the browser. HEIC and HEIF
 *  share one container, so either brand list answers for both. */
function looksLike(mimeType: string, head: string): boolean {
  switch (mimeType) {
    case 'image/png':
      return head.startsWith('\x89PNG\r\n\x1a\n')
    case 'image/jpeg':
      return head.startsWith('\xff\xd8\xff')
    case 'image/gif':
      return head.startsWith('GIF87a') || head.startsWith('GIF89a')
    case 'image/webp':
      return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
    case 'image/heic':
    case 'image/heif':
      return head.slice(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'].includes(head.slice(8, 12))
    default:
      return false
  }
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * A Server Action receives whatever was posted, so the attachment is checked for shape here —
 * **and for content**, since the declared type is only a claim. Resend decides an attachment's
 * type from its filename unless told otherwise, so checking `mimeType` alone let a posted
 * `invoice.html` labelled `image/png` reach info@ as HTML. The bytes must now open like the
 * declared image, and `screenshotAttachment` sends them under that type and its extension.
 */
export function screenshotAcceptable(screenshot: unknown): screenshot is FeedbackScreenshot {
  if (typeof screenshot !== 'object' || screenshot === null) return false
  const { filename, mimeType, base64 } = screenshot as Record<string, unknown>
  return (
    typeof filename === 'string' &&
    filename.length > 0 &&
    filename.length <= 200 &&
    typeof mimeType === 'string' &&
    SCREENSHOT_TYPES.includes(mimeType) &&
    typeof base64 === 'string' &&
    !screenshotTooLarge(base64) &&
    BASE64.test(base64) &&
    looksLike(mimeType, atob(base64.slice(0, 24)))
  )
}

/** What goes to Resend: the same bytes, the checked type, and a name whose extension is that
 *  type's — the reader's own name is kept only as far as it is plain letters and digits. */
export function screenshotAttachment(screenshot: FeedbackScreenshot): {
  filename: string
  content: string
  contentType: string
} {
  const extension = SCREENSHOT_EXTENSION[screenshot.mimeType]
  const stem = screenshot.filename.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 80)
  return {
    filename: `${stem === '' ? 'screenshot' : stem}.${extension}`,
    content: screenshot.base64,
    contentType: screenshot.mimeType,
  }
}

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return (FEEDBACK_CATEGORIES as readonly unknown[]).includes(value)
}

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
