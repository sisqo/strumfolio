import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AccountNameForm } from '@/components/AccountNameForm'
import { ChangeEmailForm } from '@/components/ChangeEmailForm'
import { ClearRateLimitButton } from '@/components/ClearRateLimitButton'
import { DeleteAccountButton } from '@/components/DeleteAccountButton'
import { Footer } from '@/components/Footer'
import { ForceExpireButton } from '@/components/ForceExpireButton'
import { GiftForm } from '@/components/GiftForm'
import { IconCheck } from '@/components/icons'
import { InternalNoteForm } from '@/components/InternalNoteForm'
import { PasswordForm } from '@/components/PasswordForm'
import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SendResetEmailButton } from '@/components/SendResetEmailButton'
import { SuspendAccountButton } from '@/components/SuspendAccountButton'
import { SwitchAccountButton } from '@/components/SwitchAccountButton'
import { TopBar } from '@/components/TopBar'
import { loadAccountHistory } from '@/lib/accounts/actions'
import { getAccountDetail, usageSummaryFor } from '@/lib/accounts/read'
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
import { loadNewsletterSummaryFor } from '@/lib/newsletter/actions'

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
 * One account's administrative detail (`PLAN.md` v3.8; `PLAN-account-admin.md` for
 * everything below). Fieldset order, top to bottom: Internal note (the first thing an
 * operator wants to read), Identity (name + the click-to-reveal Change email), Subscription
 * (the gift form + Force expire now), Payment history, Newsletter (read-only), Usage &
 * content (read-only), Access & Security (password + reset email + suspend + rate-limit
 * unlock), Danger zone. Everything visible as soon as the page opens except Change email and
 * Delete account, which keep their own click-to-reveal — a safety net for the two riskier
 * actions on the page, not a space-saving convenience like the others.
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

  const [history, newsletter, usage] = await Promise.all([
    loadAccountHistory(detail.ownerEmail),
    loadNewsletterSummaryFor(detail.ownerEmail),
    usageSummaryFor(detail.ownerEmail),
  ])
  const isCurrent = user?.accountOwnerEmail === detail.ownerEmail
  const audit = detail.plan !== null ? auditLine(detail.plan) : null
  const suspended = detail.admin?.suspendedAt !== null && detail.admin?.suspendedAt !== undefined

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
              {suspended && ' · Suspended'}
            </p>
          </div>

          {isCurrent ? (
            <span className="meta-chip">
              <IconCheck size={13} /> current
            </span>
          ) : (
            <SwitchAccountButton targetEmail={detail.ownerEmail} className="btn btn-primary">
              Enter as this account
            </SwitchAccountButton>
          )}
        </header>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Internal note</h2>
          <InternalNoteForm ownerEmail={detail.ownerEmail} note={detail.admin?.internalNote ?? null} />
        </section>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Identity</h2>
          <div className="mb-3">
            <AccountNameForm ownerEmail={detail.ownerEmail} firstName={detail.firstName} lastName={detail.lastName} />
          </div>
          <ChangeEmailForm ownerEmail={detail.ownerEmail} />
        </section>

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

              {/* Gated on `subscriptionPlan` — the live subscription alone, gift ignored — not
                  `effectivePlan`, because that is exactly what `forceExpireNow` itself checks
                  (`liveSubscription`, `checkout.ts`). `effectivePlan` blends in a gift, which
                  would show this button for a free account carrying only a gifted plan, where
                  the action always answers `not-applicable`. */}
              {detail.plan.subscriptionPlan !== null &&
                detail.plan.subscriptionPlan !== 'free' &&
                detail.plan.subscriptionPlan !== 'lifetime' && <ForceExpireButton ownerEmail={detail.ownerEmail} />}
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
          <h2 className="section-title mb-2.5">Newsletter</h2>
          {newsletter === null ? (
            <p className="text-sm text-muted">Newsletter data unavailable.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={newsletter.subscribed ? 'badge' : 'badge plan-badge-free'}>
                {newsletter.subscribed ? 'Subscribed' : 'Not subscribed'}
              </span>
              {newsletter.subscribed && <span className="text-muted">{newsletter.frequency}</span>}
              {newsletter.subscribedAt !== null && (
                <span className="text-muted">· subscribed {newsletter.subscribedAt.slice(0, 10)}</span>
              )}
              {newsletter.unsubscribedAt !== null && (
                <span className="text-muted">· unsubscribed {newsletter.unsubscribedAt.slice(0, 10)}</span>
              )}
            </div>
          )}
        </section>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Usage & content</h2>
          {usage === null ? (
            <p className="text-sm text-muted">Usage data unavailable.</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span>
                <strong>{usage.songbookCount}</strong> {usage.songbookCount === 1 ? 'songbook' : 'songbooks'}
              </span>
              <span>
                <strong>{usage.songCount}</strong> {usage.songCount === 1 ? 'song' : 'songs'}
              </span>
              <span>
                <strong>{usage.singAlongPeakDevices}</strong> Strum Together peak devices
              </span>
            </div>
          )}
        </section>

        <section className="card mb-5 p-4">
          <h2 className="section-title mb-2.5">Access & Security</h2>
          <div className="mb-3">
            <PasswordForm ownerEmail={detail.ownerEmail} />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <SendResetEmailButton ownerEmail={detail.ownerEmail} />
            {detail.admin !== null && <SuspendAccountButton ownerEmail={detail.ownerEmail} suspended={suspended} />}
            <ClearRateLimitButton ownerEmail={detail.ownerEmail} />
          </div>
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
