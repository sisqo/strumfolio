import type { Metadata } from 'next'
import { AuthError } from 'next-auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { signIn } from '@/auth'
import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { IconGoogle } from '@/components/icons'

export const metadata: Metadata = { title: 'Sign in' }

interface Props {
  searchParams: Promise<{ error?: string; failed?: string; reset?: string }>
}

/**
 * Signing in, and nothing else.
 *
 * **This page used to be the whole product's public face** — a 1068-line landing page with the
 * sign-in card in its hero, because `/` required a session and the middleware sent every
 * visitor and every crawler here. `lib/publicRoutes.ts` recorded the problem beside its own
 * entry for years («that it is also the sign-in form is a problem for another day, and still
 * open»); the pitch now lives at `/` (`(home)/Landing.tsx`) and what is left here is the form.
 *
 * Which makes it `/register`'s twin, and it is deliberately built as one: the same
 * `AuthLockup`, the same `.login-card`, the same `login-or` divider, the same acceptance line,
 * the same cross-link to the other page. It also moved back into the `(auth)` group with the
 * other four sign-in-adjacent pages — it had left that group only because a 70rem landing page
 * could not share their 48rem bar, and with the landing page gone the reason went with it. One
 * `layout.tsx` for five pages that are one card each, instead of six files for the same shape.
 *
 * Google first, because it is the way that needs no password kept anywhere. Underneath, an
 * address and a password, for whoever would rather not hand Google another sign-in — or whose
 * address is not a Google account at all. The Google button is byte-for-byte `/register`'s:
 * OAuth does not tell "sign in" from "sign up" apart, and a first successful Google sign-in is
 * what `provisionAccount` already treats as an account being born.
 *
 * Both refusals are one sentence. "Wrong email or password" covers a wrong password, an
 * address with no password, and an address that is not on the list, because telling those
 * apart is telling a stranger which addresses exist here.
 */
export default async function LoginPage({ searchParams }: Props) {
  const { error, failed, reset } = await searchParams

  const message =
    failed !== undefined
      ? 'Wrong email or password.'
      : error === undefined
        ? null
        : error === 'AccessDenied'
          ? "Google couldn't confirm this email address. Try again, or sign in a different way."
          : 'Sign-in failed. Please try again.'

  // Only shown when there is no failure to report instead — landing here with `?reset=1`
  // straight after `/reset-password` (v3.2) is never itself an error.
  const success = message === null && reset !== undefined ? 'Password changed. Sign in with your new password.' : null

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Welcome back." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {message !== null && (
            <p className="notice notice-error text-start" role="alert">
              {message}
            </p>
          )}

          {success !== null && (
            <p className="notice notice-accent text-start" role="status">
              {success}
            </p>
          )}

          <form
            className={message !== null || success !== null ? 'mt-4' : undefined}
            action={async () => {
              'use server'
              await signIn('google', { redirectTo: '/' })
            }}
          >
            <button type="submit" className="btn is-page w-full justify-center py-3 text-base">
              <IconGoogle />
              Sign in with Google
            </button>
          </form>

          <div className="login-or">
            <span>or</span>
          </div>

          <form
            className="grid gap-2.5"
            action={async (data: FormData) => {
              'use server'

              try {
                await signIn('credentials', {
                  email: String(data.get('email') ?? ''),
                  password: String(data.get('password') ?? ''),
                  redirectTo: '/',
                })
              } catch (thrown) {
                /*
                 * `signIn` reports success by throwing a redirect, so the redirect has to
                 * pass through untouched — only a real `AuthError` means the attempt failed.
                 * It is answered with a flag in the URL rather than with the error's own
                 * code, because the code distinguishes cases this page must not.
                 */
                if (thrown instanceof AuthError) redirect('/login?failed=1')
                throw thrown
              }
            }}
          >
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="Email"
                className="form-field"
              />
            </label>

            <label className="block">
              <span className="sr-only">Password</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                className="form-field"
              />
              <span className="mt-1.5 block text-end">
                <Link href="/forgot-password" className="text-xs text-muted hover:underline">
                  Forgot password?
                </Link>
              </span>
            </label>

            <button type="submit" className="btn btn-primary mt-1 w-full justify-center py-3">
              Sign in
            </button>
          </form>
        </div>

        {/*
          * Same acceptance line as `/register`, because the Google button above is the same
          * button: a first successful Google sign-in *is* a registration (`provisionAccount`),
          * so an account can be born here having agreed to nothing unless this line says it.
          */}
        <p className="mt-4 text-center text-xs text-muted">
          By signing in you agree to our{' '}
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
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
      </div>

      <Footer />
    </main>
  )
}
