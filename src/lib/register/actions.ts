'use server'

/**
 * Registering with email and password (v3.2, PLAN.md point 3) — in two steps, not one:
 * this only ever writes `pendingRegistrations`, never `accounts` or `credentials`. The
 * real account is born later, when the link in the verification email is followed, with
 * the example songbook already in it (see `provisionAccount`): nothing exists until there
 * is a real reason for it, and following the link is that reason.
 *
 * Reads its fields straight off a raw `FormData`, the same style the inline form actions
 * in `login/page.tsx` already use, rather than typed parameters like `createAccount`'s:
 * this is meant to be handed directly to a `<form>`.
 */

import { eq } from 'drizzle-orm'

import { isEmailShape, normalizeEmail } from '@/lib/allowlist'
import { generateToken } from '@/lib/auth/tokens'
import { hashPassword, isPasswordAcceptable } from '@/lib/auth/password'
import { verifyTurnstile } from '@/lib/captcha'
import { db, hasDatabase } from '@/lib/db/client'
import { accounts, pendingRegistrations } from '@/lib/db/schema'
import { sendEmail } from '@/lib/email/send'
import { verificationEmail } from '@/lib/email/templates'
import { checkRateLimit, requestIp, requestOrigin } from '@/lib/rateLimit'

import type { RegisterResult, ResendResult } from './types'

const EXPIRES_IN_MS = 24 * 60 * 60 * 1000

/**
 * Proposed, not tuned: the number to raise or lower once there is real traffic to look
 * at, not a value to get exactly right today.
 */
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

export async function register(formData: FormData): Promise<RegisterResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  const captchaToken = String(formData.get('captchaToken') ?? '')

  const ip = await requestIp()

  if (!(await verifyTurnstile(captchaToken, ip))) {
    return { ok: false, reason: 'captcha-failed' }
  }

  /*
   * Both keys checked regardless of which one a given attempt would trip: one blocked
   * address hammering from a rotating pool of IPs is still stopped by the email key, and
   * one IP trying a pool of addresses is still stopped by the IP key.
   */
  const ipAllowed = ip === null || (await checkRateLimit(`register:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS))
  const emailAllowed = await checkRateLimit(`register:email:${email}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!ipAllowed || !emailAllowed) return { ok: false, reason: 'rate-limited' }

  if (!isEmailShape(email)) return { ok: false, reason: 'invalid-email' }
  if (firstName === '' || lastName === '') return { ok: false, reason: 'invalid-name' }
  if (!isPasswordAcceptable(password)) return { ok: false, reason: 'weak-password' }
  if (password !== confirmPassword) return { ok: false, reason: 'password-mismatch' }

  try {
    const existing = await db()
      .select({ ownerEmail: accounts.ownerEmail })
      .from(accounts)
      .where(eq(accounts.ownerEmail, email))
      .limit(1)
    // A real account already answers here — never silently overwritten by a new signup
    // for the same address. The person is told to sign in, or to recover the password.
    if (existing.length > 0) return { ok: false, reason: 'account-exists' }

    const { raw, hash } = generateToken()
    const passwordHash = await hashPassword(password)
    const expiresAt = new Date(Date.now() + EXPIRES_IN_MS)

    /*
     * Upsert on `email`, not insert: registering again on the same still-pending address
     * must renew the token and the expiry rather than fail, since that is how "the email
     * never arrived" gets fixed, with no separate resend action (PLAN.md point 3).
     */
    await db()
      .insert(pendingRegistrations)
      .values({ email, firstName, lastName, passwordHash, verificationTokenHash: hash, expiresAt })
      .onConflictDoUpdate({
        target: pendingRegistrations.email,
        set: { firstName, lastName, passwordHash, verificationTokenHash: hash, expiresAt },
      })

    const url = new URL('/verify', await requestOrigin())
    url.searchParams.set('email', email)
    url.searchParams.set('token', raw)

    await sendEmail({ to: email, ...verificationEmail(url.toString()) })

    return { ok: true }
  } catch (error) {
    console.error('register failed', error)
    return { ok: false, reason: 'failed' }
  }
}

/**
 * Resent from `/verify`'s own error state (v3.2, PLAN.md point 5) — a different case
 * from the "no separate resend action" this file's own top comment describes, which only
 * holds while `RegisterForm` is still on screen with the password sitting in its state.
 * By the time someone opens `/verify` from a stale or expired link, all that survives
 * from that first submission is the address in the URL: the password was hashed away at
 * `register` time, and `register` needs the plaintext back to rehash it. So this rotates
 * the token and the expiry in place instead, leaving `passwordHash` untouched — asking
 * again proved nothing new about the password, only that the address is still wanted.
 *
 * No token to check here, on purpose: knowing the *old* token proves nothing about the
 * *new* email that would be sent, and requiring it would lock out the exact person this
 * exists for, who is looking at an error page precisely because their token no longer
 * works. The same captcha and rate limit as `register` are the real defence — this is
 * still "send an email to an address of the caller's choosing," the surface point 9
 * exists to slow down, regardless of which function does the sending.
 */
export async function resendVerification(formData: FormData): Promise<ResendResult> {
  if (!hasDatabase) return { ok: false, reason: 'no-database' }

  const email = normalizeEmail(String(formData.get('email') ?? ''))
  const captchaToken = String(formData.get('captchaToken') ?? '')

  const ip = await requestIp()

  if (!(await verifyTurnstile(captchaToken, ip))) {
    return { ok: false, reason: 'captcha-failed' }
  }

  const ipAllowed = ip === null || (await checkRateLimit(`register:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS))
  const emailAllowed = await checkRateLimit(`register:email:${email}`, RATE_LIMIT, RATE_WINDOW_MS)
  if (!ipAllowed || !emailAllowed) return { ok: false, reason: 'rate-limited' }

  try {
    const rows = await db()
      .select({ email: pendingRegistrations.email })
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, email))
      .limit(1)
    // Nothing left to extend — the address belongs on /register to start over with a
    // fresh password, not here with one that no longer exists anywhere to reuse.
    if (rows.length === 0) return { ok: false, reason: 'not-pending' }

    const { raw, hash } = generateToken()
    const expiresAt = new Date(Date.now() + EXPIRES_IN_MS)

    await db()
      .update(pendingRegistrations)
      .set({ verificationTokenHash: hash, expiresAt })
      .where(eq(pendingRegistrations.email, email))

    const url = new URL('/verify', await requestOrigin())
    url.searchParams.set('email', email)
    url.searchParams.set('token', raw)

    await sendEmail({ to: email, ...verificationEmail(url.toString()) })

    return { ok: true }
  } catch (error) {
    console.error('resendVerification failed', error)
    return { ok: false, reason: 'failed' }
  }
}
