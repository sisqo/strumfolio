/**
 * What `/verify` can answer once somebody has pressed its button.
 *
 * Separate from `actions.ts` because that file carries `'use server'`, where every export must
 * be an async function — the reason `register/types.ts` is split from its own actions too.
 */

import { MAX_PASSWORD, MIN_PASSWORD } from '@/lib/auth/types'

export type VerifyFailure = 'invalid-link' | 'weak-password' | 'password-mismatch' | 'failed'

/** `null` until the form has been sent once; a success never returns, it redirects. */
export type VerifyState = { reason: VerifyFailure } | null

export const VERIFY_MESSAGE: Record<VerifyFailure, string> = {
  'invalid-link': 'This link is invalid or has expired.',
  'weak-password': `The password must be at least ${MIN_PASSWORD} characters.`,
  'password-mismatch': 'The passwords do not match.',
  failed: 'Something went wrong. Please try again.',
}

/**
 * What `register` writes into `pending_registrations.password_hash` since 2026-09-24: nothing
 * anybody can sign in with.
 *
 * **The password is chosen on `/verify`, by whoever opened the link — never at registration.**
 * Until that date it was typed on `/register`, and registering again on a still-pending address
 * replaced it: a stranger who knew the address registered over the real owner's attempt, the
 * owner clicked the link, and the account was born with the stranger's password. Asking for the
 * password only after the link is opened is the one shape in which nothing typed before the
 * inbox was proved can become the account's way in.
 *
 * The column stays `NOT NULL`, so no migration was needed: an empty string is not a stored hash
 * `verifyPassword` can match (`decode` refuses it), and `readPendingCredential` treats it as no
 * pending password at all, so `/login` answers such an address exactly as it answers a stranger.
 */
export const NO_PENDING_PASSWORD = ''

/**
 * The password `/verify` was sent, judged before anything is written — the same two rules
 * `/register` used to apply. Pure, so it is tested without a database.
 */
export function passwordProblem(password: unknown, confirm: unknown): VerifyFailure | null {
  if (typeof password !== 'string' || typeof confirm !== 'string') return 'failed'
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) return 'weak-password'
  if (password !== confirm) return 'password-mismatch'
  return null
}
