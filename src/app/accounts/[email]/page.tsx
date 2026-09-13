import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AccountNameForm } from '@/components/AccountNameForm'
import { AttributionCard } from '@/components/AttributionCard'
import { ChangeEmailForm } from '@/components/ChangeEmailForm'
import { ClearRateLimitRow } from '@/components/ClearRateLimitRow'
import { CouponsSeenCard } from '@/components/CouponsSeenCard'
import { DeleteAccountRow } from '@/components/DeleteAccountRow'
import { Footer } from '@/components/Footer'
import { GiftForm } from '@/components/GiftForm'
import { IconCheck, IconGift, IconReceipt, IconSend, IconShield, IconUser } from '@/components/icons'
import { InternalNoteForm } from '@/components/InternalNoteForm'
import { OutreachPanel } from '@/components/OutreachPanel'
import { PasswordForm } from '@/components/PasswordForm'
import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import { PrefsProvider } from '@/components/PrefsProvider'
import { SendResetEmailRow } from '@/components/SendResetEmailRow'
import { SuspendAccountRow } from '@/components/SuspendAccountRow'
import { SwitchAccountButton } from '@/components/SwitchAccountButton'
import { TopBar } from '@/components/TopBar'
import { loadAccountHistory } from '@/lib/accounts/actions'
import { paymentSummary } from '@/lib/accounts/paymentSummary'
import { NO_PLAN_LINE, giftCell, giftWithdrawn, noPlanYet, planBadge, rowStatus } from '@/lib/accounts/planText'
import { getAccountDetail, rateLimitStatusFor, usageSummaryFor } from '@/lib/accounts/read'
import { attributionFor } from '@/lib/attribution/read'
import { avatarInitials } from '@/lib/avatar'
import { currentUser } from '@/lib/auth/session'
import { couponViewsFor } from '@/lib/coupons/views'
import { loadNewsletterSummaryFor } from '@/lib/newsletter/actions'
import { loadOutreachFor } from '@/lib/outreach/actions'
import { OUTREACH_MESSAGE } from '@/lib/outreach/types'
import { euro } from '@/lib/plans/prices'
import { PLAN_LABEL } from '@/lib/plans/types'

export const metadata: Metadata = { title: 'Account' }

/** Rendered per request: which account this is, and whether it is the one already switched into, both depend on who is asking. */
export const dynamic = 'force-dynamic'

/**
 * The tabs the detail page's controls are dealt into, where this used to be eight stacked
 * fieldsets. Each is one question an operator opens the page with — what is this account
 * entitled to, who are they, what did they pay, can they get in — and the summary strip above
 * the tabs answers the first four at once for the case where reading is all that was wanted.
 *
 * **Four of the five are `Account Detail.dc.html`'s own and the fifth is not.** Outreach is
 * newer than that handoff, so its absence from the mock is not a deviation to be reconciled:
 * every other tab answers what this account *is*, and it answers what has been *done to* it,
 * which is the one question the strip cannot summarise because it has no fixed answer — a
 * greeting sent this year says nothing about next year's.
 */
type Tab = 'plan' | 'identity' | 'payments' | 'security' | 'outreach'

/**
 * The order they are drawn in, and the first of them is also the one the page opens on —
 * `readQuery`'s fallback and `hrefFor`'s omitted param are both `identity` for that reason.
 * Identity is who this account *is*, which is what an operator wants confirmed before reading
 * anything else about it. Security is last: nothing there is read, everything there is done,
 * and two of its rows are irreversible.
 *
 * Changing this order means changing those two constants with it — the landing tab is the one
 * a URL with no `?tab=` resolves to, so a first tab that is not the default would leave the
 * page opening on a tab that is not the one drawn first.
 */
const TABS: readonly Tab[] = ['identity', 'plan', 'payments', 'outreach', 'security']

const TAB_LABEL: Record<Tab, string> = {
  plan: 'Plan & gift',
  identity: 'Identity',
  payments: 'Payments',
  security: 'Security',
  outreach: 'Outreach',
}

/** One mark each (`Account Detail.dc.html`), so the row is scannable before it is read. */
const TAB_ICON: Record<Tab, (props: { size?: number }) => React.ReactElement> = {
  plan: IconGift,
  identity: IconUser,
  payments: IconReceipt,
  security: IconShield,
  outreach: IconSend,
}

/**
 * How many ledger rows the Payments tab shows before offering the rest. The mock draws five
 * under an «All 9 events» link; the link is a URL param and not a client toggle, which is what
 * keeps `PaymentHistoryTable` — shared verbatim with the reader's own `/billing` — a server
 * component.
 */
const EVENTS_PREVIEW = 5

interface Query {
  tab: Tab
  events: 'preview' | 'all'
}

/** An unrecognised or absent param always falls back to the least surprising default, never to an error — the same rule `/accounts` reads its four params by. */
function readQuery(raw: { tab?: string; events?: string }): Query {
  return {
    tab: TABS.includes(raw.tab as Tab) ? (raw.tab as Tab) : TABS[0],
    events: raw.events === 'all' ? 'all' : 'preview',
  }
}

/** The href for a link that changes part of the page's state and keeps the rest — the tabs and the «All N events» link are both built from it, so neither can drop what the other set. */
function hrefFor(address: string, query: Query, overrides: Partial<Query>): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  if (merged.tab !== TABS[0]) params.set('tab', merged.tab)
  if (merged.events !== 'preview') params.set('events', merged.events)

  const search = params.toString()
  const base = `/accounts/${encodeURIComponent(address)}`
  return search === '' ? base : `${base}?${search}`
}

interface Props {
  params: Promise<{ email: string }>
  searchParams: Promise<{ tab?: string; events?: string }>
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
 * One account's administrative detail, laid out after `Account Detail.dc.html`: the header
 * with its monogram and `Enter as this account`, a summary strip, the internal note, then the
 * tabs holding every control — the mock's five, Outreach included, which the earlier handoff
 * did not have (see `Tab` above).
 *
 * **The strip is read-only and the tabs are where anything is written**, which is the whole
 * point of the shape: the version before the tabs stacked eight always-open fieldsets, so
 * opening an account to check what plan it was on meant scrolling past the field that sets its
 * password. The strip answers that without a single control on screen.
 *
 * **It is two halves and they are not the same kind of thing.** The tinted panel on the left is
 * the *answer* — what this account is entitled to and the gift queued behind it, which is the
 * question the page is opened with. The seven cells on the right are facts checked against it,
 * and three of them (Status, Last sign-in, Rate limit) came up out of the Security tab in this
 * redesign: they were behind the one tab that also holds the password field and the delete row,
 * so reading three numbers meant opening the place where a wrong click is expensive.
 *
 * The tabs are `<Link>`s and their state is a URL param, so this stays a server component
 * with no tab state to hold — the same choice `/accounts`' own four tabs make, and the reason
 * the «All N events» link can be a link too. The cost, stated plainly: switching tabs is a
 * request, and this page is `force-dynamic` over six reads. Right for a surface a global
 * owner opens a handful of times a week, and the deep link into one tab is worth having.
 *
 * `getAccountDetail` already checks `isOwner` and answers `null` for both "not a global
 * owner" and "no such account" — `notFound()` renders the two identically, the same rule
 * `/accounts` itself follows.
 */
export default async function AccountDetailPage({ params, searchParams }: Props) {
  const { email } = await params
  const address = readEmailParam(email)
  if (address === null) notFound()

  const [detail, user] = await Promise.all([getAccountDetail(address), currentUser()])
  if (detail === null) notFound()

  const query = readQuery(await searchParams)

  const [history, newsletter, usage, rateLimit, outreach, seen, attribution] = await Promise.all([
    loadAccountHistory(detail.ownerEmail),
    loadNewsletterSummaryFor(detail.ownerEmail),
    usageSummaryFor(detail.ownerEmail),
    rateLimitStatusFor(detail.ownerEmail),
    loadOutreachFor(detail.ownerEmail),
    /*
     * Which coupons this account has been *shown*, which is a different question from the
     * redemptions the ledger below already carries — and the one an operator asks before
     * deciding whether a reminder is worth sending. Read here rather than behind an action:
     * `getAccountDetail` above has already checked `isOwner` and this page has already
     * `notFound()` on its answer, the same arrangement `usageSummaryFor` is read under.
     */
    couponViewsFor(detail.ownerEmail),
    /* Where this account came from, for the Identity tab. Read under the same arrangement as
       the line above: `getAccountDetail` has already established `isOwner`. */
    attributionFor(detail.ownerEmail),
  ])

  const isCurrent = user?.accountOwnerEmail === detail.ownerEmail
  const plan = detail.plan
  const badge = plan === null ? null : planBadge(plan)
  const status = plan === null ? null : rowStatus(plan, detail.signInCount)
  const gift = plan === null ? null : giftCell(plan)
  const ledger = history.ok ? paymentSummary(history.history) : null

  /*
   * `admin === null` means the two `0036` columns could not be read at all, which must never
   * render as an unsuspended account: "not suspended" and "could not tell" are opposite
   * answers, and this screen exists to be believed (`AccountDetail.admin`'s own comment).
   */
  const suspended = detail.admin !== null && detail.admin.suspendedAt !== null

  /*
   * The header's second line, assembled from whatever this account actually has: the name is
   * nullable for every account predating the name columns, and a leading « · » where it would
   * have been is worse than no name at all.
   */
  const fullName = [detail.firstName, detail.lastName].filter((part) => part !== null && part !== '').join(' ')
  const facts = [
    fullName === '' ? null : fullName,
    `Registered ${detail.createdAt.slice(0, 10)}`,
    /* The strip's Status cell says this too, and it is still worth saying twice: it is the one
       fact here that changes what every control below does, and the header is read first. */
    suspended ? 'Suspended' : null,
  ].filter((fact) => fact !== null)

  /*
   * The gift, as the one line that goes under the plan in the strip's left panel — and only
   * when there is something to say. `giftCell` answers for three states and they are not
   * interchangeable: a gift on file, a gift an operator withdrew (whose audit has nowhere else
   * to go on this page), and an account nobody ever gifted anything, which is the ordinary
   * case and earns no line at all. Keyed on `giftWithdrawn` rather than on the cell's own
   * words, so this cannot drift out of step with what `planText.ts` writes.
   */
  const giftLine =
    plan === null || gift === null
      ? null
      : gift.plan !== null
        ? { plan: gift.plan, text: gift.text }
        : giftWithdrawn(plan)
          ? { plan: null, text: gift.text }
          : null

  const events = history.ok ? history.history : []
  const shown = query.events === 'all' ? events : events.slice(0, EVENTS_PREVIEW)

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        <p className="mb-3 text-sm">
          <Link href="/accounts" className="text-accent hover:underline">
            ← All accounts
          </Link>
        </p>

        <header className="acct-head">
          <div className="acct-who">
            {/* The monogram in the plan's own colour, exactly as the list row draws it, so an
                operator arriving from `/accounts` recognises the row they clicked. */}
            <span className={`acct-avatar ${badge?.className ?? 'plan-badge-none'}`} aria-hidden>
              {avatarInitials(detail.ownerEmail)}
            </span>
            <div className="min-w-0">
              <h1 className="acct-address">{detail.ownerEmail}</h1>
              <p className="acct-facts">{facts.join(' · ')}</p>
            </div>
          </div>

          {isCurrent ? (
            <span className="acct-current">
              <IconCheck size={13} /> current
            </span>
          ) : (
            <SwitchAccountButton targetEmail={detail.ownerEmail} className="acct-enter">
              Enter as this account
            </SwitchAccountButton>
          )}
        </header>

        {/* Read-only, no control among them — see this component's own header. */}
        <div className="acct-summary">
          {/* The answer: what this account is entitled to, and the gift queued behind it. */}
          <div className="acct-force">
            <span className="acct-force-label">In force</span>
            {badge === null || status === null || plan === null ? (
              <>
                <span className="acct-force-plan is-quiet">—</span>
                <span className="acct-force-note">Plan columns unavailable</span>
              </>
            ) : (
              <>
                {/* «No plan» is not an entitlement, so it is not lettered like one: 27px of
                    accent over a warm panel reads as *this account has something*. */}
                <span className={`acct-force-plan${noPlanYet(plan) ? ' is-quiet' : ''}`}>{badge.label}</span>
                {/* The list's own Status column, verbatim: «Until 2027-03-14», «Awaiting
                    choice», «Premium expired 2026-08-01». One vocabulary for the two screens. */}
                {status.text !== '' && (
                  <span className={`acct-force-note${status.tone === 'alert' ? ' is-alert' : ''}`}>{status.text}</span>
                )}
              </>
            )}

            {giftLine !== null && (
              <span className="acct-force-gift">
                <span className="acct-cell-gift" aria-hidden>
                  <IconGift size={13} />
                </span>
                {/* «gifted,» is the label the strip's old Gift column carried, now that the
                    panel has no room for a heading of its own — the clause after it is
                    `giftCell`'s, untouched. */}
                <span>
                  {giftLine.plan === null ? (
                    giftLine.text
                  ) : (
                    <>
                      <strong>{PLAN_LABEL[giftLine.plan]}</strong> gifted, {giftLine.text}
                    </>
                  )}
                </span>
              </span>
            )}
          </div>

          {/* The facts checked against that answer. Every one of the seven has a branch for a
              read that failed, and none of them may answer it with a number: «0 songbooks» and
              «Not hit» are what an operator would *believe*, and "could not tell" is a dash. */}
          <div className="acct-cells">
            <div className="acct-cell">
              <span className="acct-cell-label">Songbooks</span>
              <span className={usage === null ? 'acct-cell-main is-faint' : 'acct-cell-main is-count'}>
                {usage === null ? '—' : usage.songbookCount}
              </span>
              {/* Said once, under the first of the three dashes, rather than three times. */}
              {usage === null && <span className="acct-cell-note">Usage data unavailable</span>}
            </div>

            <div className="acct-cell">
              <span className="acct-cell-label">Songs</span>
              <span className={usage === null ? 'acct-cell-main is-faint' : 'acct-cell-main is-count'}>
                {usage === null ? '—' : usage.songCount}
              </span>
            </div>

            <div className="acct-cell">
              <span className="acct-cell-label">Peak devices</span>
              <span className={usage === null ? 'acct-cell-main is-faint' : 'acct-cell-main is-count'}>
                {usage === null ? '—' : usage.singAlongPeakDevices}
              </span>
            </div>

            <div className="acct-cell">
              <span className="acct-cell-label">Status</span>
              {/* «—», never «Active», when the `0036` columns could not be read at all. */}
              <span className={detail.admin === null ? 'acct-cell-main is-faint' : 'acct-cell-main'}>
                {detail.admin === null ? '—' : suspended ? 'Suspended' : 'Active'}
              </span>
            </div>

            <div className="acct-cell">
              <span className="acct-cell-label">Last sign-in</span>
              <span
                className={detail.lastSignInAt === null ? 'acct-cell-main is-faint' : 'acct-cell-main is-nums'}
              >
                {detail.lastSignInAt?.slice(0, 10) ?? 'Never'}
              </span>
              {/* No «0 in all» under «Never»: the date already said it, twice would be a tally. */}
              {detail.signInCount > 0 && <span className="acct-cell-note is-faint">{detail.signInCount} in all</span>}
            </div>

            <div className="acct-cell">
              <span className="acct-cell-label">Rate limit</span>
              {/* «—», never «Not hit», when the read failed: see `rateLimitStatusFor`. */}
              <span className={rateLimit === null ? 'acct-cell-main is-faint' : 'acct-cell-main'}>
                {rateLimit === null
                  ? '—'
                  : rateLimit.attempts === 0
                    ? 'Not hit'
                    : `${rateLimit.attempts} attempt${rateLimit.attempts === 1 ? '' : 's'}`}
              </span>
            </div>

            <div className="acct-cell is-wide">
              <span className="acct-cell-label">Newsletter</span>
              {newsletter === null ? (
                <>
                  <span className="acct-cell-main is-faint">—</span>
                  <span className="acct-cell-note">Newsletter data unavailable</span>
                </>
              ) : (
                <span className="acct-cell-main">
                  {newsletter.subscribed ? `Subscribed · ${newsletter.frequency}` : 'Not subscribed'}{' '}
                  {/* Read-only here on purpose: the account's own `/profile` is where this is
                      changed (`lib/accounts/CLAUDE.md`). */}
                  {newsletter.subscribed && newsletter.subscribedAt !== null && (
                    <span className="text-faint">since {newsletter.subscribedAt.slice(0, 10)}</span>
                  )}
                  {!newsletter.subscribed && newsletter.unsubscribedAt !== null && (
                    <span className="text-faint">unsubscribed {newsletter.unsubscribedAt.slice(0, 10)}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Above the tabs and outside them: the first thing an operator opening an account for
            support wants to read, and it belongs to no one of the four questions below. */}
        <InternalNoteForm ownerEmail={detail.ownerEmail} note={detail.admin?.internalNote ?? null} />

        <nav className="acct-tabs" aria-label="Account sections">
          {TABS.map((tab) => {
            const active = tab === query.tab
            const Mark = TAB_ICON[tab]
            return (
              <Link
                key={tab}
                href={hrefFor(detail.ownerEmail, query, { tab, events: 'preview' })}
                className={`acct-tab${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                <Mark size={15} />
                {TAB_LABEL[tab]}
                {tab === 'payments' && ledger !== null && ledger.events > 0 && (
                  <span className="acct-tab-count">{ledger.events}</span>
                )}
              </Link>
            )
          })}
        </nav>

        {query.tab === 'plan' && (
          <div className="acct-panel">
            {plan === null ? (
              <p className="text-sm text-muted">Could not read the plan for this account. Reload the page.</p>
            ) : (
              <>
                {/* The summary strip's badge and Status cell only go as far as "No plan" /
                    "Awaiting choice" — this is the one place that says what that actually
                    means: the account cannot get into the app at all yet. A gift is still
                    offered below regardless — `setGrant` stamps the choice itself, so gifting
                    a plan here is exactly how this state ends without the reader visiting
                    `/pricing`. */}
                {noPlanYet(plan) && <p className="mb-3 text-sm text-muted">{NO_PLAN_LINE}</p>}
                <GiftForm ownerEmail={detail.ownerEmail} plan={plan} />
              </>
            )}
          </div>
        )}

        {query.tab === 'identity' && (
          <div className="acct-panel">
            <AccountNameForm
              ownerEmail={detail.ownerEmail}
              firstName={detail.firstName}
              lastName={detail.lastName}
            />
            <ChangeEmailForm ownerEmail={detail.ownerEmail} />
            {/* Identity is where "who is this person" is answered, so where they came from
                belongs here rather than beside the money on Payments. Read-only, like
                everything else on this tab that is not one of the two forms above. */}
            <AttributionCard read={attribution} />
          </div>
        )}

        {query.tab === 'payments' && (
          <div className="acct-panel">
            {ledger === null ? (
              <p className="text-sm text-muted">Could not read the history.</p>
            ) : (
              <>
                <div className="acct-stats">
                  <span className="acct-stat">
                    <span className="acct-cell-label">Collected</span>
                    <span className="acct-stat-value">{euro(ledger.collected)}</span>
                  </span>
                  <span className="acct-stat">
                    <span className="acct-cell-label">Events</span>
                    <span className="acct-stat-value">{ledger.events}</span>
                  </span>
                  <span className="acct-stat">
                    <span className="acct-cell-label">Last payment</span>
                    <span className="acct-stat-value is-nums">{ledger.lastPaymentOn ?? '—'}</span>
                  </span>
                  <span className="acct-stat">
                    <span className="acct-cell-label">Renews</span>
                    {/* Lifetime carries no date at all, which is not the same «—» as a plan
                        that has one and could not be read. */}
                    <span className="acct-stat-value is-nums">
                      {plan === null ? '—' : plan.plan === 'lifetime' ? 'Never' : (plan.planExpiresOn ?? '—')}
                    </span>
                  </span>
                </div>

                <div className="acct-card">
                  <PaymentHistoryTable lines={shown} look="ledger" />
                  {query.events === 'preview' && ledger.events > EVENTS_PREVIEW && (
                    <p className="acct-more">
                      <Link href={hrefFor(detail.ownerEmail, query, { events: 'all' })}>
                        All {ledger.events} events
                      </Link>
                    </p>
                  )}
                </div>

                <CouponsSeenCard lines={seen} />
              </>
            )}
          </div>
        )}

        {query.tab === 'outreach' && (
          <div className="acct-panel">
            {/* The failure is printed, never an empty panel: «nothing has ever been sent to
                this account» is the one sentence a failed read must not be mistaken for. */}
            {outreach.ok ? (
              <OutreachPanel history={outreach.view.history} />
            ) : (
              <p className="text-sm text-muted">{OUTREACH_MESSAGE[outreach.reason]}</p>
            )}
          </div>
        )}

        {query.tab === 'security' && (
          <div className="acct-panel">
            {/* Four facts about access used to stand at the top of this tab and are in the
                summary strip now (`Account Detail.dc.html`): reading whether an account is
                suspended should not mean opening the one tab that also sets a password. What
                is left here is only what *acts*, which is why it is the last tab. */}
            <PasswordForm ownerEmail={detail.ownerEmail} />
            <SendResetEmailRow ownerEmail={detail.ownerEmail} />
            {/* Absent, not disabled, when the `0036` columns cannot be read: a toggle whose
                current state is unknown would be a guess about which way it flips. */}
            {detail.admin !== null && (
              <SuspendAccountRow ownerEmail={detail.ownerEmail} suspended={suspended} />
            )}
            <ClearRateLimitRow ownerEmail={detail.ownerEmail} />
            <DeleteAccountRow ownerEmail={detail.ownerEmail} />
          </div>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
