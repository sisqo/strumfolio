/**
 * The token-and-email half of a password reset, shared by `requestPasswordReset`
 * (self-service, behind captcha/rate-limit/anti-enumeration) and `sendPasswordResetFor`
 * (`lib/auth/actions.ts`, an admin action on `/accounts/[email]` that needs none of those
 * three) — one place to keep `EXPIRES_IN_MS`, the token, and the link in agreement, rather
 * than a second hand-typed copy of this exact block. Assumes the caller has already normalized
 * `email` and decided it is worth sending to; this does not check whether an account exists.
 *
 * **A plain module, not a `'use server'` export, and that move is the point.** It used to sit in
 * `forgotPassword/actions.ts`, whose every export Next.js registers as a callable server action
 * with an id shipped in the client bundle (`ForgotPasswordForm` and `ResetPasswordForm` both
 * import from that file). This function mints a reset token and sends the email while skipping
 * the captcha, the rate limit and the account-existence check its own callers apply — so as an
 * action it was an unauthenticated "send a reset email to any address" endpoint, i.e. an email
 * bomb and a token generator for strangers. Its two callers are both server-side, so a plain
 * module reaches them and nobody else. Same arrangement `testCard.ts` uses beside `checkout.ts`.
 */

import { db } from '@/lib/db/client'
import { passwordResetTokens } from '@/lib/db/schema'
import { generateToken } from '@/lib/auth/tokens'
import { sendEmail } from '@/lib/email/send'
import { passwordResetEmail } from '@/lib/email/templates'
import { requestOrigin } from '@/lib/rateLimit'

const EXPIRES_IN_MS = 60 * 60 * 1000

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
