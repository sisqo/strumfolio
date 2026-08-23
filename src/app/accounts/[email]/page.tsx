import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DeleteAccountButton } from '@/components/DeleteAccountButton'
import { Footer } from '@/components/Footer'
import { GiftForm } from '@/components/GiftForm'
import { IconCheck } from '@/components/icons'
import { PasswordForm } from '@/components/PasswordForm'
import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { loadAccountHistory, switchAccount } from '@/lib/accounts/actions'
import { getAccountDetail } from '@/lib/accounts/read'
import {
  NO_PLAN_LINE,
  auditLine,
  giftLine,
  inForceLine,
  noPlanYet,
  planBadge,
  stillAwaitingChoice,
  subscriptionLine,
} from '@/lib/accounts/planText'
import { currentUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Account' }

/** Rendered per request: which account this is, and whether it is the one already switched into, both depend on who is asking. */
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ email: string }>
}

/**
 * The address this page is about, read back out of the path segment.
 *
 * The App Router hands a dynamic segment through **still percent-encoded** — verified
 * empirically against this very app, not inferred: `/accounts/a%40b.com` arrives as the
 * literal `a%40b.com`, `%` and all. The first version of this page trusted `getRouteMatcher`
 * (`next/dist/shared/lib/router/utils/route-matcher.js`), which does call
 * `decodeURIComponent` — but that is the *Pages* Router's matcher and not the code path a
 * server component's `params` travels. The result was a 404 on every single account, because
 * no row's `owner_email` contains a `%`, so `getAccountDetail` found nothing and this page
 * called `notFound()` on a perfectly real address.
 *
 * Exactly one decode, the inverse of the one `encodeURIComponent` the list's link applies.
 * That is also what keeps an address holding a literal `%` intact — legal in an email's local
 * part, if vanishingly rare — since the link writes it as `%25` and this reads it back as `%`.
 * A second decode would corrupt precisely that address, which is why this is not written
 * defensively as "decode until it stops changing".
 *
 * `decodeURIComponent` throws on a malformed sequence (`%zz`), which is a URL nothing in this
 * app could have linked to: `null` here, and the caller answers `notFound()` — the same thing
 * it already answers for an address that has no account.
 */
function readEmailParam(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/**
 * Switching into this account — moved here from the list row (PLAN.md, v3.8), same
 * `switchAccount` and the same `redirect('/')` inside it once the cookie is written. Local to
 * this file rather than a shared component: it is used in exactly the one place now that the
 * list only ever links to this page instead of offering it directly.
 */
function EnterAccountForm({ ownerEmail }: { ownerEmail: string }) {
  const enter = async () => {
    'use server'
    await switchAccount(ownerEmail)
  }

  return (
    <form action={enter}>
      <button type="submit" className="btn btn-primary">
        Enter as this account
      </button>
    </form>
  )
}

/**
 * One account's administrative detail — every operation the old `/accounts` row used to
 * squeeze into a strip of buttons, now with a whole page each (PLAN.md, v3.8):
 * entering the account, giving or withdrawing a plan, its payment history, setting or
 * removing a password, and deleting it. Everything here is visible as soon as the page opens
 * except the delete control, which keeps its own click-to-reveal — a deliberate safety net,
 * not a space-saving convenience like the others used to be.
 *
 * `getAccountDetail` already checks `isOwner` and answers `null` for both "not a global
 * owner" and "no such account" — `notFound()` renders the two identically, the same rule
 * `/accounts` itself follows.
 */
export default async function AccountDetailPage({ params }: Props) {
  const { email } = await params
  const address = readEmailParam(email)
  if (address === null) notFound()

  const [detail, user] = await Promise.all([getAccountDetail(address), currentUser()])
  if (detail === null) notFound()

  const history = await loadAccountHistory(detail.ownerEmail)
  const isCurrent = user?.accountOwnerEmail === detail.ownerEmail
  const audit = detail.plan !== null ? auditLine(detail.plan) : null

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <p className="mb-2.5 text-sm">
          <Link href="/accounts" className="text-accent hover:underline">
            ← All accounts
          </Link>
        </p>

        <header className="mb-[1.125rem] flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="screen-title truncate">{detail.ownerEmail}</h1>
            <p className="mt-1 text-sm text-muted">
              {detail.signInCount === 0
                ? 'Never signed in'
                : `${detail.signInCount} sign-in${detail.signInCount === 1 ? '' : 's'}`}
              {' · '}Registered {detail.createdAt.slice(0, 10)}
            </p>
          </div>

          {isCurrent ? (
            <span className="meta-chip">
              <IconCheck size={13} /> current
            </span>
          ) : (
            <EnterAccountForm ownerEmail={detail.ownerEmail} />
          )}
        </header>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Subscription</h2>

          {detail.plan === null ? (
            <p className="text-sm text-muted">Could not read the plan for this account. Reload the page.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`badge ${planBadge(detail.plan).className}`}>{planBadge(detail.plan).label}</span>
                {stillAwaitingChoice(detail.plan) && (
                  <span className="badge plan-badge-unchosen">Awaiting choice</span>
                )}
              </div>

              <div className="mb-3 text-sm text-muted">
                {/* With no plan at all, the subscription and in-force lines would both name
                    `free` — the column's default rather than anybody's decision — so one honest
                    sentence replaces the pair. The gift lines stay either way: a withdrawn gift's
                    audit is worth reading on an account that never chose anything too. */}
                {noPlanYet(detail.plan) ? (
                  <p>{NO_PLAN_LINE}</p>
                ) : (
                  <p>{subscriptionLine(detail.plan)}</p>
                )}
                <p>{giftLine(detail.plan)}</p>
                {audit !== null && <p>{audit}</p>}
                {detail.plan.grantedNote !== null && <p>“{detail.plan.grantedNote}”</p>}
                {!noPlanYet(detail.plan) && <p className="mt-1.5">{inForceLine(detail.plan)}</p>}
              </div>

              <GiftForm ownerEmail={detail.ownerEmail} plan={detail.plan} />
            </>
          )}
        </section>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Payment history</h2>
          {history.ok ? (
            <PaymentHistoryTable lines={history.history} />
          ) : (
            <p className="text-sm text-muted">Could not read the history.</p>
          )}
        </section>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Password</h2>
          <PasswordForm ownerEmail={detail.ownerEmail} />
        </section>

        <section className="card p-4">
          <h2 className="section-title mb-2.5">Danger zone</h2>
          <DeleteAccountButton ownerEmail={detail.ownerEmail} />
        </section>

        <Footer />
      </main>
    </PrefsProvider>
  )
}
