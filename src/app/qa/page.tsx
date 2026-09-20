import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PublicHeader } from '@/components/PublicHeader'
import { currentUser } from '@/lib/auth/session'
import { PLAN_LABEL } from '@/lib/plans/types'
import { publicBarFrom } from '@/lib/publicBar'
import { createQaUser, enterAsQaUser } from '@/lib/qa/actions'
import { QA_OWNER_EMAIL, QA_PASSWORD, qaEntryEnabled } from '@/lib/qa/entry'
import { qaAccounts } from '@/lib/qa/read'

export const metadata: Metadata = {
  title: 'QA entry',
  /* Nothing here should ever be offered to a crawler, whatever the deployment. Belt and braces
     beside `publicRoutes.ts`' `indexable: false`: that flag stops *this site* advertising the
     URL, this stops a crawler that arrived from a pasted link. The page 404s in production
     anyway — this is for the two environments where it does not. */
  robots: { index: false, follow: false },
}

/**
 * Nothing is prerendered: the list below is live database state, and the guard reads the
 * environment. A build-time snapshot of either would be a page that lies.
 */
export const dynamic = 'force-dynamic'

/**
 * `/qa` — make a verified account, sign in as it, start testing. No password typed, no email
 * sent, no Telegram notice.
 *
 * It exists because everything worth testing in this app is behind a session, and the ways in
 * are all slow or unavailable to whoever is doing the testing: registration needs a real inbox
 * to receive a verification link, Google sign-in needs an OAuth redirect URI that no preview
 * has, and both need a password typed into a form. A tester needs a clean account in one click,
 * repeatedly.
 *
 * **It is an authentication bypass and it is fenced accordingly** — see `lib/qa/entry.ts` for
 * the reasoning behind both fences. In short: it runs only where `VERCEL_ENV` is absent,
 * `preview` or `development` (never production, and never a value the allowlist does not know),
 * and it can only ever mint or enter an address in `@strumfolio.test`, a domain RFC 2606
 * reserves and nobody can register. So the worst it can do is create a junk account on a
 * deployment that is already behind Vercel's own SSO, and it can never touch a real one — which
 * matters most locally, where the development database holds a 2026-08-29 copy of production.
 *
 * The check is repeated in `lib/qa/actions.ts`. This one is for the reader; that one is the
 * boundary, because a Server Action answers by id whether or not its page rendered.
 *
 * **Not a designed screen.** It is a tool, like `/password` and `/design-system`, and it uses
 * the app's own tokens so it does not look broken — nothing more. No mock, nothing to match.
 */
export default async function QaPage() {
  if (!qaEntryEnabled()) notFound()

  const [user, accounts] = await Promise.all([currentUser(), qaAccounts()])
  const environment = process.env.VERCEL_ENV ?? 'local'

  return (
    <>
      {/* `publicBarFrom` and not `publicBarFor`: `user` is already resolved above, and this is
          the one page that would otherwise ask the same question twice in the same render. */}
      <PublicHeader
        width="48rem"
        {...publicBarFrom(user !== null, { links: [{ href: '/pricing', label: 'Pricing' }] })}
      />

      <main className="mx-auto w-full max-w-[48rem] px-5 py-10">
        <p className="card-eyebrow">Quality testing · {environment}</p>
        <h1 className="screen-title mt-1">QA entry</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Creates an already-verified account in <code>@{QA_OWNER_EMAIL.split('@')[1]}</code> and signs you in as it —
          no verification email, no password to type. This page does not exist in production.
        </p>

        {user !== null && (
          <p className="notice notice-accent mt-5 text-start" role="status">
            Signed in as <strong>{user.email}</strong>.{' '}
            <Link href="/billing" className="underline">
              Plan &amp; billing
            </Link>{' '}
            ·{' '}
            <Link href="/" className="underline">
              Home
            </Link>
          </p>
        )}

        <section className="card mt-6 p-5">
          <h2 className="section-title">A new tester</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            A fresh account on the free plan, with the example songbook every new account gets.
          </p>

          <form action={createQaUser} className="mt-4 flex flex-wrap items-center gap-2">
            <label className="min-w-[12rem] flex-1">
              <span className="sr-only">Name</span>
              <input type="text" name="name" placeholder="QA Tester" className="form-field" />
            </label>
            <button type="submit" className="btn btn-primary btn-sm">
              Create and sign in
            </button>
          </form>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="section-title">The owner address</h2>
          {/* The one address worth writing down: `isOwner` reads `ALLOWED_EMAILS` from the
              environment, so nothing on this page can grant the operator screens to anybody.
              A stable address is what makes that one manual edit possible. */}
          <p className="mt-1 text-sm leading-6 text-muted">
            <code>{QA_OWNER_EMAIL}</code> is an ordinary QA account until somebody adds it to{' '}
            <code>ALLOWED_EMAILS</code> — in <code>.env.local</code> locally, or in Vercel&rsquo;s Preview
            environment. Only then do <code>/coupons</code>, <code>/accounts</code> and <code>/leads</code> open.
          </p>

          <form action={enterAsQaUser.bind(null, QA_OWNER_EMAIL)} className="mt-4">
            <button type="submit" className="btn btn-sm">
              Sign in as the owner address
            </button>
          </form>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="section-title">Accounts already here</h2>

          {accounts.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {accounts.map((account) => (
                <li key={account.email} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                  <span className="flex-1 text-sm font-medium">
                    {account.email}
                    {account.name !== null && <span className="ml-2 text-muted">{account.name}</span>}
                  </span>
                  <span className="state-badge state-badge-quiet">
                    {PLAN_LABEL[account.plan]}
                    {account.planStatus !== 'active' && ` · ${account.planStatus}`}
                  </span>
                  <form action={enterAsQaUser.bind(null, account.email)}>
                    <button type="submit" className="btn btn-quiet btn-sm">
                      Sign in
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-6 text-sm leading-6 text-muted">
          Every account here has the password <code>{QA_PASSWORD}</code>, so the ordinary sign-in form at{' '}
          <Link href="/login" className="underline">
            /login
          </Link>{' '}
          can be tested by hand too. Signing in from this page writes no welcome email and no Telegram notice.
        </p>
      </main>
    </>
  )
}
