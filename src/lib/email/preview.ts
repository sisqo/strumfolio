/**
 * The four emails `templates.ts` can build, rendered with placeholder data instead of a
 * real link — what `/emails` (the global-owner-only preview page) shows.
 *
 * `origin` arrives as a parameter rather than read here with `requestOrigin()`
 * (`lib/rateLimit.ts`): that keeps this module a plain, request-independent function, the
 * same reason `checkout.ts`'s `expiryFor` takes `now` instead of calling `new Date()`
 * itself. The caller — the page, or the `sendTestEmail` action — is the one place that
 * actually knows which request this is.
 */

import { SAMPLE_EMAIL, SAMPLE_TOKEN } from '@/lib/previewSample'

import { passwordResetEmail, purchaseEmail, verificationEmail, welcomeEmail } from './templates'
import type { EmailTemplate } from './templates'

export type PreviewKey = 'verification' | 'welcome' | 'password-reset' | 'purchase'

export const PREVIEW_KEYS: PreviewKey[] = ['verification', 'welcome', 'password-reset', 'purchase']

export const PREVIEW_LABEL: Record<PreviewKey, string> = {
  verification: 'Verify email',
  welcome: 'Welcome',
  'password-reset': 'Reset password',
  purchase: 'Purchase confirmation',
}

/**
 * The purchase confirmation's own placeholders. A fixed date rather than one derived from
 * today, for the reason this module's header gives about `origin`: `buildEmailPreviews` stays a
 * plain function of its argument, with no clock of its own, so two previews of the same
 * template are the same bytes. The plan and price are a literal pair and deliberately not read
 * from `PRICES` — a preview showing yesterday's price beside today's copy is a preview nobody
 * has to reconcile, whereas one wired to the live catalogue silently changes what it is
 * demonstrating whenever a price moves.
 */
const SAMPLE_PURCHASE = {
  planLabel: 'Premium',
  amount: '99',
  cycle: 'year' as const,
  renewsOn: '22 September 2027',
}

/**
 * A link that looks exactly like a real one — same host, same two query params
 * (`register`/`forgotPassword`'s own `actions.ts` build theirs the same way) — but whose
 * token exists nowhere: opening it lands on the same "expired or invalid link" state a
 * stale real one would, which is expected here and not a bug to fix. The one state this
 * can never show is the *valid* one — see `/verify` and `/reset-password`'s own
 * `?preview=1` (`/pages`) for that.
 */
function sampleUrl(origin: string, path: '/verify' | '/reset-password'): string {
  const url = new URL(path, origin)
  url.searchParams.set('email', SAMPLE_EMAIL)
  url.searchParams.set('token', SAMPLE_TOKEN)
  return url.toString()
}

export function buildEmailPreviews(origin: string): Record<PreviewKey, EmailTemplate> {
  return {
    verification: verificationEmail(sampleUrl(origin, '/verify')),
    welcome: welcomeEmail(),
    'password-reset': passwordResetEmail(sampleUrl(origin, '/reset-password')),
    purchase: purchaseEmail(SAMPLE_PURCHASE),
  }
}
