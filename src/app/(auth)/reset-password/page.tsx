import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { ResetPasswordForm } from '@/components/ResetPasswordForm'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { checkPasswordResetToken } from '@/lib/forgotPassword/check'
import type { PasswordResetCheck } from '@/lib/forgotPassword/check'
import { SAMPLE_EMAIL, SAMPLE_TOKEN } from '@/lib/previewSample'

export const metadata: Metadata = { title: 'Reset password' }

interface Props {
  searchParams: Promise<{ email?: string; token?: string; preview?: string }>
}

/**
 * The landing page for the link in the password-reset email (v3.2).
 *
 * Shows the new-password form directly on this GET, with no intermediate button the way
 * `/verify` needs one: typing a password and submitting it is already the explicit
 * action an email scanner never takes on its own, so there is nothing left for a button
 * to gate that the form itself does not already gate. The check (`checkPasswordResetToken`)
 * is still read-only — it is `resetPassword`'s own recheck at submit time that actually
 * consumes the token, not this render.
 *
 * `?preview=1` (`/pages`) is `/verify`'s own `?preview=1` for this page — see that page's
 * comment for the full reasoning. The one thing worth repeating: the sample address and
 * token this renders with match no real row, so submitting the form for real in preview
 * mode still writes nothing — `resetPassword`'s own recheck rejects it as an invalid token,
 * the same as it would for any other stale link.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { email: emailParam, token: tokenParam, preview: previewParam } = await searchParams

  const session = previewParam === undefined ? null : await auth()
  const preview = isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)

  const email = preview ? SAMPLE_EMAIL : emailParam
  const token = preview ? SAMPLE_TOKEN : tokenParam
  const check: PasswordResetCheck = preview ? 'valid' : await checkPasswordResetToken(email, token)

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Choose a new password." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {preview && (
            <p className="notice notice-accent mb-4" role="status">
              Preview — the &ldquo;ready to set a new password&rdquo; state, with a sample
              address. No real reset is pending.
            </p>
          )}

          {check === 'no-database' && (
            <p className="notice notice-error" role="alert">
              No database configured: the password cannot be saved.
            </p>
          )}

          {check === 'valid' && email && token && <ResetPasswordForm email={email} token={token} />}

          {check === 'invalid' && (
            <>
              <p className="notice notice-error" role="alert">
                This link is invalid or has expired.
              </p>
              <p className="mt-4 text-center text-sm text-muted">
                <Link href="/forgot-password" className="text-accent hover:underline">
                  Request a new link
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
