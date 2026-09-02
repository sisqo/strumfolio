import type { Metadata } from 'next'
import Link from 'next/link'

import { signIn } from '@/auth'
import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { RegisterForm } from '@/components/RegisterForm'
import { IconGoogle } from '@/components/icons'

export const metadata: Metadata = { title: 'Register' }

/**
 * Creating an account with email and password (v3.2, PLAN.md points 3-4) — the second of
 * the two ways in, next to Google. Same shell as `/login`: the lockup, the same
 * `.login-card`, and the exact same Google button, throwing the exact same redirect on
 * success. Registering with Google is not a separate flow at all (PLAN.md point 2): the
 * button below is the one on `/login`, byte for byte, because OAuth does not tell "sign
 * in" from "sign up" apart — a first successful sign-in is what `provisionAccount`
 * already treats as an account being born, on `/login` as much as here.
 */
export default function RegisterPage() {
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Create your account." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          <form
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <button type="submit" className="btn is-page w-full justify-center py-3 text-base">
              <IconGoogle />
              Sign up with Google
            </button>
          </form>

          <div className="login-or">
            <span>or</span>
          </div>

          <RegisterForm />
        </div>

        {/*
          * The acceptance line. The footer's links alone cannot show that anyone agreed to
          * anything — a reader has to be told, at the moment of creating the account, what
          * creating it commits them to. Below the card and not inside the form, because both
          * ways in — the Google button and the email form — create an account, and a line inside
          * one of them would leave the other looking exempt.
          */}
        <p className="mt-4 text-center text-xs text-muted">
          By creating an account you agree to our{' '}
          <Link href="/terms-of-service" className="text-accent hover:underline">
            Terms of Service
          </Link>{' '}
          and acknowledge our{' '}
          <Link href="/privacy-policy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="mt-2 text-center text-xs text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <Footer />
    </main>
  )
}
