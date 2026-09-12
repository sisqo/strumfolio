import type { Metadata } from 'next'

import { AuthLockup } from '@/components/AuthLockup'
import { Footer } from '@/components/Footer'
import { confirmCourtesyUnsubscribe, courtesyUnsubscribeStatus } from '@/lib/courtesy/publicActions'

export const metadata: Metadata = { title: 'Unsubscribe' }

interface Props {
  searchParams: Promise<{ email?: string; token?: string }>
}

/**
 * The landing page for a courtesy email's one-click unsubscribe link.
 *
 * **Reads only, on this GET.** `courtesyUnsubscribeStatus` checks the token and looks up
 * whether the address has already opted out, and this page shows a button rather than acting
 * on its own — the same discipline `/verify` and `/reset-password` already follow, for the
 * same reason: a corporate mail scanner follows every link in a message before a person sees
 * it, and a GET that wrote would silently opt out an account nobody but the scanner ever
 * visited. The actual write, `confirmCourtesyUnsubscribe`, sits behind the explicit tap below.
 *
 * **No session anywhere in this file.** A reader here followed a link out of an email; the
 * token in the query string is the entire authorization (`lib/courtesy/unsubscribe.ts`), which
 * is also why this page needs no `requireAccount` and is listed as session-free in
 * `publicRoutes.ts`.
 *
 * Once the form below submits, Next re-renders this same route — which re-runs
 * `courtesyUnsubscribeStatus` and finds the column already set, so "already unsubscribed" is
 * what a second visit (or a second click) shows, with no client-side state of its own to keep
 * in step.
 */
export default async function CourtesyUnsubscribePage({ searchParams }: Props) {
  const { email, token } = await searchParams
  const status = email === undefined || token === undefined ? 'invalid' : await courtesyUnsubscribeStatus(email, token)

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center px-5 py-10 sm:py-16">
      <div className="login-glow" aria-hidden />

      <AuthLockup payoff="Unsubscribe from courtesy emails." />

      <div className="mt-7 w-full max-w-sm sm:mt-8">
        <div className="card card-lead login-card p-6 sm:p-7">
          {status === 'invalid' && (
            <p className="notice notice-error" role="alert">
              This link is not valid.
            </p>
          )}

          {status === 'already-out' && (
            <p className="notice notice-accent" role="status">
              You won&rsquo;t receive these again. Everything else about your account stays
              exactly as it is.
            </p>
          )}

          {status === 'confirmable' && email !== undefined && token !== undefined && (
            <>
              <p className="mb-4 text-sm leading-[1.45] text-muted">
                Stop the occasional personal note from Francesco at Strumfolio, the one sent
                after signing up? This only affects those two emails — everything else about
                your account, including the newsletter, stays exactly as it is.
              </p>
              <form action={confirmCourtesyUnsubscribe.bind(null, email, token)}>
                <button type="submit" className="btn btn-primary w-full justify-center py-3">
                  Stop these emails
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <Footer />
    </main>
  )
}
