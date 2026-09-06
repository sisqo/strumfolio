'use server'

/**
 * Recovering access to an address by email, rather than by asking a global owner
 * (v3.2) — the self-serve counterpart to `setPasswordFor`
 * (`lib/auth/actions.ts`), which stays exactly as it was for the one case this cannot
 * reach: an address with no verified email loop of its own to receive a link on.
 */

import { eq } from 'drizzle-orm'

import { isEmailShape, normalizeEmail } from '@/lib/allowlist'
import { writePasswordHash } from '@/lib/auth/credentials'
import { hashPassword, isPasswordAcceptable } from '@/lib/auth/password'
import { generateToken } from '@/lib/auth/tokens'
import { verifyTurnstile } from '@/lib/captcha'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, passwordResetTokens } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { passwordResetEmail } from '@/lib/email/templates'
import { checkRateLimit, requestIp, requestOrigin } from '@/lib/rateLimit'

import { checkPasswordResetToken } from './check'
import type { RequestResetResult, ResetPasswordResult } from './types'

const EXPIRES_IN_MS = 60 * 60 * 1000

/**
 * Proposed, not tuned — same status as `register`'s own constant.
 */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Always answers `{ ok: true }` once past the captcha and the rate limit, whether or not
 * `email` has an account — the one case this must never distinguish (the same
 * principle as `verifyAgainstNothing` in `lib/auth/password.ts`, which hides the same
 * thing on the login path). An address with no account gets no email and no row, but the
 * caller cannot tell that apart from one that just got both.
 */
export async function requestPasswordReset(formData: FormData): Promise<RequestResetResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const captchaToken = String(formData.get('captchaToken') ?? '')

  const ip = await requestIp()

  if (!(await verifyTurnstile(captchaToken, ip))) {
    return { ok: false, reason: 'captcha-failed' }
  }

  const ipAllowed = ip === null || (await checkRateLimit(`reset:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS))
  const emailAllowed = await checkRateLimit(`reset:email:${email}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!ipAllowed || !emailAllowed) return { ok: false, reason: 'rate-limited' }

  if (!isEmailShape(email)) return { ok: false, reason: 'invalid-email' }

  try {
    const existing = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, email))
      .limit(1)

    if (existing.length > 0) {
      await sendPasswordResetToken(email)
    }

    return { ok: true }
  } catch (error) {
    console.error('requestPasswordReset failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * The token-and-email half of a password reset, shared by `requestPasswordReset` above
 * (self-service, behind captcha/rate-limit/anti-enumeration) and `sendPasswordResetFor`
 * (`lib/auth/actions.ts`, an admin action on `/accounts/[email]` that needs none of
 * those three) — one place to keep `EXPIRES_IN_MS`,
 * the token, and the link in agreement, rather than a second hand-typed copy of this
 * exact block. Assumes the caller has already normalized `email` and decided it is
 * worth sending to; this does not check whether an account exists at all.
 */
export async function sendPasswordResetToken(email: string): Promise<void> {
  const { raw, hash } = generateToken()
  const expiresAt = new Date(Date.now() + EXPIRES_IN_MS)

  await db()
    .insert(passwordResetTokens)
    .values({ email, tokenHash: hash, expiresAt })
    .onConflictDoUpdate({
      target: passwordResetTokens.email,
      set: { tokenHash: hash, expiresAt },
    })

  const url = new URL('/reset-password', await requestOrigin())
  url.searchParams.set('email', email)
  url.searchParams.set('token', raw)

  await sendEmail({ to: email, ...passwordResetEmail(url.toString()) })
}

/**
 * The `/reset-password` form's own submit — already the explicit action a scanner
 * never takes (see `check.ts`'s own comment), so there is no separate confirmation step
 * here the way `/verify` needs one.
 *
 * `writePasswordHash` is the exact call `setOwnPassword` and `setPasswordFor` already use
 * (`lib/auth/actions.ts`): it upserts, so it writes this address's *first* password
 * exactly as readily as it replaces one — no branch here needs to ask which case this is.
 * Verified as a side effect of proving control of the inbox, not by a separate flag this
 * function would have to set: nothing in this table ever recorded "verified" to begin
 * with, and completing a reset is itself proof enough for the email actually being able
 * to answer next time it needs to.
 *
 * Returns `{ ok: true }` rather than calling `redirect` itself: this is invoked as a plain
 * function from `ResetPasswordForm`'s own `onSubmit`, the same direct-call style
 * `register` already uses, not bound to a `<form action>` the way `verifyEmail` is — and
 * `redirect()` throwing across that client/server boundary is not something to lean on
 * when the caller also needs the *failure* reasons rendered inline. The form itself does
 * the navigation once it sees `ok: true`, with `next/navigation`'s `useRouter`.
 *
 * Not signed in on success, unlike `verifyEmail`: the caller sends the person to `/login`
 * instead, so whoever just reset it proves the new password once, the normal way, rather
 * than this flow repeating `verifyEmail`'s hand-built cookie for a smaller convenience
 * gain.
 */
export async function resetPassword(formData: FormData): Promise<ResetPasswordResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if ((await checkPasswordResetToken(email, token)) !== 'valid') {
    return { ok: false, reason: 'invalid-token' }
  }

  if (!isPasswordAcceptable(password)) return { ok: false, reason: 'weak-password' }
  if (password !== confirmPassword) return { ok: false, reason: 'password-mismatch' }

  try {
    await writePasswordHash(email, await hashPassword(password))
    await db().delete(passwordResetTokens).where(eq(passwordResetTokens.email, email))
    return { ok: true }
  } catch (error) {
    console.error('resetPassword failed', error)
    return { ok: false, reason: 'failed' }
  }
}
