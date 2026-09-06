import type { Metadata } from 'next'
import Link from 'next/link'

import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { ForgotPasswordForm } from '@/components/ForgotPasswordForm'

export const metadata: Metadata = { title: 'Forgot password' }

/**
 * Requesting a password reset link (v3.2) — same shell as `/login` and
 * `/register`: the lockup, `.login-card`, one form.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Reset your password." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          <ForgotPasswordForm />
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>

      <Footer />
    </main>
  )
}
