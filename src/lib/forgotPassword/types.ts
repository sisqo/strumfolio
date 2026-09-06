/**
 * What password recovery can answer (v3.2).
 *
 * Separate from `actions.ts` because that file carries `'use server'`, where every export
 * must be an async function — the same reason `register/types.ts` is split from its own
 * actions file.
 */

import { MIN_PASSWORD } from '@/lib/auth/types'

/**
 * Deliberately has no "no such account" member. `requestPasswordReset` answers `{ ok:
 * true }` whether or not the address has one — see that function's own comment — so a
 * failure here is only ever a reason that has nothing to do with which addresses exist:
 * the captcha, the rate limit, or the shape of the address itself.
 */
export type RequestResetFailure = 'no-database' | 'captcha-failed' | 'rate-limited' | 'invalid-email' | 'failed'

export type RequestResetResult = { ok: true } | { ok: false; reason: RequestResetFailure }

export const REQUEST_RESET_MESSAGE: Record<RequestResetFailure, string> = {
  'no-database': 'No database configured: no email can be sent.',
  'captcha-failed': 'Security check failed. Please try again.',
  'rate-limited': 'Too many attempts. Please try again later.',
  'invalid-email': 'Enter a valid email address.',
  failed: 'Something went wrong. Please try again.',
}

export type ResetPasswordFailure = 'no-database' | 'invalid-token' | 'weak-password' | 'password-mismatch' | 'failed'

export type ResetPasswordResult = { ok: true } | { ok: false; reason: ResetPasswordFailure }

export const RESET_PASSWORD_MESSAGE: Record<ResetPasswordFailure, string> = {
  'no-database': 'No database configured: the password cannot be saved.',
  'invalid-token': 'This link is invalid or has expired. Request a new one.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'password-mismatch': 'The passwords do not match.',
  failed: 'Something went wrong. Please try again.',
}
