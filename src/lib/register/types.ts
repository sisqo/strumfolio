/**
 * What registering by email and password can answer (v3.2).
 *
 * Separate from `actions.ts` because that file carries `'use server'`, where every
 * export must be an async function — the same reason `accounts/types.ts` and
 * `auth/types.ts` are split from their own actions files.
 */

import { MIN_PASSWORD } from '@/lib/auth/types'

export type RegisterFailure =
  | 'no-database'
  | 'captcha-failed'
  | 'rate-limited'
  | 'invalid-email'
  /** First or last name missing, or only whitespace — checked after trimming both. */
  | 'invalid-name'
  | 'weak-password'
  | 'password-mismatch'
  /** A real account already exists for this address — never overwritten silently. */
  | 'account-exists'
  | 'failed'

export type RegisterResult = { ok: true } | { ok: false; reason: RegisterFailure }

export const REGISTER_MESSAGE: Record<RegisterFailure, string> = {
  'no-database': 'No database configured: accounts cannot be created.',
  'captcha-failed': 'Security check failed. Please try again.',
  'rate-limited': 'Too many attempts. Please try again later.',
  'invalid-email': 'Enter a valid email address.',
  'invalid-name': 'Enter your first and last name.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'password-mismatch': 'The passwords do not match.',
  'account-exists': 'An account already exists for this address. Sign in, or reset your password.',
  failed: 'Something went wrong. Please try again.',
}

/**
 * What `resendVerification` can answer — a separate type from `RegisterFailure` rather
 * than one more member added to it: `register` can never produce `not-pending`, and this
 * project does not model states a function cannot reach.
 */
export type ResendFailure = 'no-database' | 'captcha-failed' | 'rate-limited' | 'not-pending' | 'failed'

export type ResendResult = { ok: true } | { ok: false; reason: ResendFailure }

export const RESEND_MESSAGE: Record<ResendFailure, string> = {
  'no-database': 'No database configured: emails cannot be sent.',
  'captcha-failed': 'Security check failed. Please try again.',
  'rate-limited': 'Too many attempts. Please try again later.',
  'not-pending': 'This link is no longer valid. Please register again.',
  failed: 'Something went wrong. Please try again.',
}
