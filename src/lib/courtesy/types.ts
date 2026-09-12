/**
 * The vocabulary of a courtesy send — reasons, results, and the sentences an operator reads.
 *
 * **A module with no `@/lib/db` import and no `'use server'`**, the same two reasons
 * `accounts/types.ts` (`GiftNoticeFailure`/`GIFT_NOTICE_MESSAGE`) and `outreach/types.ts`
 * (`OutreachFailure`/`OUTREACH_MESSAGE`) state for themselves. A `'use server'` module may
 * export **only async functions** — every other export, including a plain `const` object like
 * `COURTESY_MESSAGE`, breaks the Server Actions build in a way `tsc --noEmit` does not catch
 * and `next build` does not always catch either.
 *
 * **This is not a hypothetical.** `COURTESY_MESSAGE` originally lived in `actions.ts` beside
 * the two send functions, compiled clean, and built clean — and then every call to
 * `sendCourtesyThanks`/`sendCourtesyCheckin` in production answered `POST /accounts 500,
 * Error: A "use server"…`, with no row ever claimed and no email ever sent, because the action
 * reference for that module never resolved. Moving the constant here, with nothing left in
 * `actions.ts` but the two async functions, is the fix — and the reason this file exists at
 * all rather than folding the vocabulary back into `actions.ts` "since it's only two
 * functions."
 */

export type CourtesyFailure =
  | 'not-allowed'
  | 'no-database'
  /** `COURTESY_UNSUBSCRIBE_SECRET` is unset — refused before anything is claimed. */
  | 'no-secret'
  | 'unknown-account'
  /** This address has used the one-click link; sending would ignore it. */
  | 'opted-out'
  | 'suspended'
  /** `courtesy_checkin` only: no `done` row for `courtesy_thanks` on this address yet. */
  | 'send-thanks-first'
  /** A `done` row already exists for this occurrence. */
  | 'already-sent'
  | 'in-flight'
  | 'send-failed'
  | 'failed'

export type CourtesyResult = { ok: true } | { ok: false; reason: CourtesyFailure }

/**
 * The identity these two emails send under — a **named** person, not the product, and a
 * reply-to that is genuinely read (see `email/send.ts`'s own comment on the distinction).
 * Exported from here rather than left private to `actions.ts`, so `/emails`'s own
 * `sendTestEmail` (`email/actions.ts`) can send a `[Preview]` copy under the same identity a
 * real courtesy send uses instead of the default `no-reply@` — the two must not drift apart
 * silently the way a hand-duplicated literal would let them.
 */
export const COURTESY_FROM = 'Francesco from Strumfolio <info@strumfolio.com>'
export const COURTESY_REPLY_TO = 'info@strumfolio.com'

export const COURTESY_MESSAGE: Record<CourtesyFailure, string> = {
  'not-allowed': 'Only a global owner may send this.',
  'no-database': 'No database configured: nothing can be sent.',
  'no-secret': 'COURTESY_UNSUBSCRIBE_SECRET is not configured, so no unsubscribe link can be signed.',
  'unknown-account': 'This account no longer exists. Reload the page.',
  'opted-out': 'This reader unsubscribed from courtesy emails.',
  suspended: 'This account is suspended.',
  'send-thanks-first': 'Send the thank-you email first.',
  'already-sent': 'This has already been sent to this account.',
  'in-flight': 'Another send for this account started a moment ago. Wait for it to finish.',
  'send-failed': 'The email did not go out. You can try again.',
  failed: 'Could not send. Please try again.',
}
