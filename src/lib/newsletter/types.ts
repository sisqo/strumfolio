/**
 * The two cadences a subscribed reader can choose between (`PLAN-newsletter.md`,
 * decided in interview). Plain string union, not a pgEnum/CHECK — same convention
 * `newsletterPrefs.frequency` itself already follows.
 */
export type NewsletterFrequency = 'weekly' | 'monthly'

/**
 * What `/profile`-style settings screens read to prefill a form: never null while
 * signed in, same shape `loadOwnName` already returns for the same reason — a row
 * absent (no database, never provisioned, or the insert in `provisionAccount` failed)
 * reads as "not subscribed, monthly" rather than leaving the caller with nothing to
 * show.
 */
export type NewsletterPrefs = { subscribed: boolean; frequency: NewsletterFrequency }

export type NewsletterFailure = 'no-session' | 'no-database' | 'failed'

export type NewsletterResult = { ok: true } | { ok: false; reason: NewsletterFailure }

export const NEWSLETTER_MESSAGE: Record<NewsletterFailure, string> = {
  'no-session': 'Session expired. Reload the page and sign in again.',
  'no-database': 'No database configured: your preference cannot be saved.',
  failed: 'Save failed. Please try again.',
}
