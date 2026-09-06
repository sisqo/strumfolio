import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { ResendVerificationButton } from '@/components/ResendVerificationButton'
import { auth } from '@/auth'
import { isOwner } from '@/lib/allowlist'
import { SAMPLE_EMAIL, SAMPLE_TOKEN } from '@/lib/previewSample'
import { verifyEmail } from '@/lib/verify/actions'
import { checkPendingRegistration } from '@/lib/verify/check'
import type { PendingRegistrationCheck } from '@/lib/verify/check'

export const metadata: Metadata = { title: 'Verify your email' }

interface Props {
  searchParams: Promise<{ email?: string; token?: string; preview?: string }>
}

/**
 * The landing page for the link in the verification email (v3.2).
 *
 * Reads only, on this GET: it checks whether the token still matches and has not expired
 * (`verify/check.ts`), and shows a button rather than acting on its own. An email scanner
 * that "clicks" the link to see where it goes only ever exercises this render — the actual
 * write is `verifyEmail`, a real POST behind an explicit "Verify my email" tap that a
 * scanner never makes. Same shell as `/register`: the lockup, `.login-card`, nothing
 * else on screen to distract from the one thing this page is for.
 *
 * `?preview=1` (`/pages`) forces the one state `/emails`'s own sample link cannot reach: that
 * link's token is deliberately fake (`lib/email/preview.ts`), so it only ever shows "invalid or
 * expired" — the real "ready to confirm" branch, with the actual button and its actual copy,
 * has never been visible without a genuine registration in flight. Owner-gated the same way
 * `/thanks?preview=` is (`loadThanksPreview`): a stray `?preview=1` on a link somebody else
 * opens does nothing, because `isOwner` is checked against the *signed-in* session, not
 * trusted from the query string. Uses the same fixed fake address `/emails` already shows
 * (`SAMPLE_EMAIL`/`SAMPLE_TOKEN`) rather than a real pending row, so tapping "Verify my email"
 * here for real still writes nothing — `verifyEmail`'s own recheck finds no such row either.
 */
export default async function VerifyPage({ searchParams }: Props) {
  const { email: emailParam, token: tokenParam, preview: previewParam } = await searchParams

  const session = previewParam === undefined ? null : await auth()
  const preview = isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)

  const email = preview ? SAMPLE_EMAIL : emailParam
  const token = preview ? SAMPLE_TOKEN : tokenParam
  const check: PendingRegistrationCheck = preview ? { status: 'valid' } : await checkPendingRegistration(email, token)

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Verify your email." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {preview && (
            <p className="notice notice-accent mb-4" role="status">
              Preview — the &ldquo;ready to confirm&rdquo; state, with a sample address. No real
              registration is pending.
            </p>
          )}

          {check.status === 'no-database' && (
            <p className="notice notice-error" role="alert">
              No database configured: accounts cannot be verified.
            </p>
          )}

          {check.status === 'valid' && email && token && (
            <>
              <p className="mb-4 text-sm leading-[1.45] text-muted">
                Confirm <strong>{email}</strong> to finish setting up your account.
              </p>
              <form action={verifyEmail.bind(null, email, token)}>
                <button type="submit" className="btn btn-primary w-full justify-center py-3">
                  Verify my email
                </button>
              </form>
            </>
          )}

          {check.status === 'invalid' && (
            <>
              <p className="notice notice-error" role="alert">
                This link is invalid or has expired.
              </p>

              {check.canResend && email ? (
                <ResendVerificationButton email={email} />
              ) : (
                <p className="mt-4 text-center text-sm text-muted">
                  <Link href="/register" className="text-accent hover:underline">
                    Register again
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
