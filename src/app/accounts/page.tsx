import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AutoSubmitSelect } from '@/components/AutoSubmitSelect'
import { ConfirmPendingRegistrationButton } from '@/components/ConfirmPendingRegistrationButton'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { IconChevronDown, IconChevronUp, IconGift, IconInfo, IconSearch } from '@/components/icons'
import { auth } from '@/auth'
import { listAccountPlans, listAllAccounts, listPendingRegistrations } from '@/lib/accounts/read'
import type { AccountPlanLine, AccountSummary } from '@/lib/accounts/read'
import { giftActive, isPaying, planBadge, rowStatus } from '@/lib/accounts/planText'
import type { RowStatus } from '@/lib/accounts/planText'
import { isOwner } from '@/lib/allowlist'
import { avatarInitials } from '@/lib/avatar'
import { forcedPlanNotice, plansEnforced } from '@/lib/plans/resolve'

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and the search/sort/page state, both depend on the request. */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

/**
 * The four tabs over the list (`Accounts.dc.html`), replacing the plan `<select>` and the
 * two checkboxes the previous form had. Each is a question an operator actually asks of the
 * list — "who do I need to look at", "who pays", "who did I gift" — where a plan filter
 * answered one nobody was asking ("who is on Plus"). The predicate for each lives in
 * `planText.ts`, beside the row copy it has to agree with: `attention` is literally the rows
 * whose Status column is red.
 */
type View = 'all' | 'attention' | 'paying' | 'gifted'

const VIEWS: readonly View[] = ['all', 'attention', 'paying', 'gifted']

const VIEW_LABEL: Record<View, string> = {
  all: 'All',
  attention: 'Needs attention',
  paying: 'Paying',
  gifted: 'Gifted',
}

/**
 * One value per order rather than the old `sort` × `dir` pair: the mock draws a single
 * dropdown, and a select can set one param. Every option is a direction somebody wants, not
 * every direction of every key — nobody sorts by fewest sign-ins.
 */
type Order = 'az' | 'za' | 'newest' | 'oldest' | 'active' | 'signins'

const ORDERS: readonly Order[] = ['az', 'za', 'newest', 'oldest', 'active', 'signins']

const ORDER_LABEL: Record<Order, string> = {
  az: 'A–Z',
  za: 'Z–A',
  newest: 'Newest first',
  oldest: 'Oldest first',
  active: 'Recently signed in',
  signins: 'Most sign-ins',
}

/** Ties broken by address, so two accounts registered in the same second keep a stable order across pages. */
const COMPARE: Record<Order, (a: AccountSummary, b: AccountSummary) => number> = {
  az: (a, b) => a.ownerEmail.localeCompare(b.ownerEmail),
  za: (a, b) => b.ownerEmail.localeCompare(a.ownerEmail),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || COMPARE.az(a, b),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || COMPARE.az(a, b),
  active: (a, b) => (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? '') || COMPARE.az(a, b),
  signins: (a, b) => b.signInCount - a.signInCount || COMPARE.az(a, b),
}

interface Query {
  q: string
  view: View
  sort: Order
  page: number
}

interface RawQuery {
  q?: string
  view?: string
  sort?: string
  page?: string
}

/** Reads the four URL params into a typed, defaulted shape — an unrecognised or absent value always falls back to the least surprising default, never to an error. */
function readQuery(raw: RawQuery): Query {
  return {
    q: (raw.q ?? '').trim(),
    view: VIEWS.includes(raw.view as View) ? (raw.view as View) : 'all',
    sort: ORDERS.includes(raw.sort as Order) ? (raw.sort as Order) : 'az',
    page: Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1),
  }
}

/** The query string for a link that keeps every current param except the ones named in `overrides` — how every tab, column header and pagination link on this page is built, so none of them can drop a search the operator already typed. */
function hrefFor(query: Query, overrides: Partial<Query>): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  if (merged.q !== '') params.set('q', merged.q)
  if (merged.view !== 'all') params.set('view', merged.view)
  if (merged.sort !== 'az') params.set('sort', merged.sort)
  if (merged.page !== 1) params.set('page', String(merged.page))

  const search = params.toString()
  return search === '' ? '/accounts' : `/accounts?${search}`
}

/** One account as the list sees it: the summary, its resolved plan (null while the plan columns cannot be read) and the Status column already written. */
interface Row {
  account: AccountSummary
  line: AccountPlanLine | null
  status: RowStatus | null
}

/**
 * Whether a row belongs under a tab. A row with no readable plan line only ever belongs
 * under "All": the three other tabs ask a plan question it cannot answer, and showing it
 * under "Paying" because the column happened to be unreadable would be a lie on the one
 * screen whose purpose is to be believed.
 */
function inView(row: Row, view: View): boolean {
  if (view === 'all') return true
  if (row.line === null || row.status === null) return false
  if (view === 'attention') return row.status.tone === 'alert'
  if (view === 'paying') return isPaying(row.line)
  return giftActive(row.line)
}

interface Props {
  searchParams: Promise<RawQuery>
}

/**
 * Every account in the installation, searchable, sortable and paginated — a **global owner**
 * question through and through, with a single public now (v3.1). The old second audience, a
 * collaborator switching between accounts they were invited into, is gone along with
 * collaboration itself. `notFound()` rather than a role notice, same reasoning as every other
 * slug-reached page in this app — "this does not exist" and "this is not yours" should look
 * identical from outside.
 *
 * Laid out after `Accounts.dc.html` (PLAN.md, v4.4): a title row with the pending
 * registrations as a pill on its right, four tabs with the search and the sort order on the
 * same line, and one table — avatar and address, a gift mark, the plan badge, the status,
 * the sign-in count, View. The tabs are links and the search is a plain GET form, so the
 * whole state lives in the URL and the page stays a server component with one client
 * component in it (`AutoSubmitSelect`, the sort order).
 *
 * No longer offers creating an account (PLAN.md, v3.8, replacing the old "Create"
 * section): self-service registration and automatic provisioning on any first sign-in — Google
 * or password — cover every real case an admin-created account used to.
 *
 * Filtering by tab and sorting operate in memory, on the *resolved* plan `listAccountPlans`
 * already computes — not a second copy of that rule expressed as SQL. Correct and simple at
 * this installation's scale (a private, invite-only app); the place to revisit if the account
 * count ever grew by orders of magnitude, not before.
 */
export default async function AccountsPage({ searchParams }: Props) {
  const session = await auth()
  if (!isOwner(session?.user?.email, process.env.ALLOWED_EMAILS)) notFound()

  const query = readQuery(await searchParams)

  /*
   * Two reads, not one widened query — `listAccountPlans` names migration 0024's/0026's/0027's
   * columns and therefore fails until they are applied, with its own null, which must cost the
   * plan columns and nothing else. Widening `listAllAccounts` instead would put the whole
   * screen behind those same migrations.
   */
  const [all, plans, pending] = await Promise.all([listAllAccounts(), listAccountPlans(), listPendingRegistrations()])

  /*
   * Read once, here, for the two notices below. `plansEnforced()` first and not merely
   * alongside: `entitlementsOf` returns `UNGATED` before it ever reads the override, so with
   * the switch off there is no forced plan to warn about.
   */
  const forced = plansEnforced() ? forcedPlanNotice() : null

  const needle = query.q.toLowerCase()
  /*
   * The search narrows everything below it, tab counts included: "All 3 · Paying 1" beside a
   * list of three is an answer, where the installation's totals beside those same three rows
   * would be a puzzle.
   */
  const searched: Row[] = (all ?? [])
    .filter((account) => needle === '' || account.ownerEmail.toLowerCase().includes(needle))
    .map((account) => {
      const line = plans?.get(account.ownerEmail) ?? null
      return { account, line, status: line === null ? null : rowStatus(line, account.signInCount) }
    })

  /*
   * When `plans` is null (an unapplied migration — the same case `listAccountPlans` already
   * documents), the three plan tabs stay on screen without a count and answer an empty list:
   * `inView` cannot place any row under them. "All" is unaffected, exactly the unfiltered list
   * `AccountsPage` already fell back to before plans existed.
   */
  const counts = new Map<View, number | null>(
    VIEWS.map((view) => [view, view !== 'all' && plans === null ? null : searched.filter((row) => inView(row, view)).length]),
  )

  const sorted = searched.filter((row) => inView(row, query.view)).sort((a, b) => COMPARE[query.sort](a.account, b.account))

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(query.page, totalPages)
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const pendingCount = pending?.length ?? 0
  const byEmail = query.sort === 'az' || query.sort === 'za'

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3.5">
        <header className="accounts-head">
          <div>
            <h1 className="screen-title">Accounts</h1>
            <p className="mt-[0.4375rem] text-sm text-muted">
              Every account in the installation. Open one to manage its plan, password or removal.
            </p>
          </div>

          {/* The pending registrations as a pill up here rather than a section of their own
              above the list (`PLAN-account-admin.md`, point 11): discoverability without
              already knowing the address is still what it is for, and a red pill beside the
              title is found before any section is. It leads to the rows themselves, below the
              list, where their Confirm buttons live. */}
          {pendingCount > 0 && (
            <a href="#pending" className="accounts-pending">
              <IconInfo size={13} />
              {pendingCount} pending {pendingCount === 1 ? 'registration' : 'registrations'}
            </a>
          )}
        </header>

        {/* The only place `SONGBOOK_PLANS` reaches a screen anywhere in this app. Without it,
            «I gifted premium and nothing changed» is a support call with no visible cause. */}
        {!plansEnforced() && (
          <p className="accounts-notice is-accent" role="status">
            Plans are off in this deployment: every account gets everything, whatever it says here.
          </p>
        )}
        {forced !== null && (
          <p className="accounts-notice is-error" role="status">
            SONGBOOK_PLANS is set: every account is being gated as <strong>{forced}</strong>, whatever it says here.
          </p>
        )}

        <div className="accounts-toolbar">
          <nav className="accounts-tabs" aria-label="Which accounts">
            {VIEWS.map((view) => {
              const count = counts.get(view) ?? null
              const active = view === query.view
              return (
                <Link
                  key={view}
                  href={hrefFor(query, { view, page: 1 })}
                  className={`accounts-tab${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {VIEW_LABEL[view]}
                  {/* Red only while there is something in it: an empty "Needs attention" is
                      the good news, and good news does not get a red pill. */}
                  {count !== null &&
                    (view === 'attention' && count > 0 ? (
                      <span className="accounts-tab-alert">{count}</span>
                    ) : (
                      <span className="accounts-tab-count">{count}</span>
                    ))}
                </Link>
              )
            })}
          </nav>

          <form method="get" className="accounts-tools">
            {/* The form owns only the two controls it draws; the tab travels as a hidden
                field so a new search stays under the tab the operator was already on. */}
            {query.view !== 'all' && <input type="hidden" name="view" value={query.view} />}
            <label className="accounts-search">
              <IconSearch size={14} />
              <input type="search" name="q" defaultValue={query.q} placeholder="Search an address" aria-label="Search an address" />
            </label>
            <span className="accounts-sort">
              <AutoSubmitSelect name="sort" defaultValue={query.sort} aria-label="Sort order">
                {ORDERS.map((order) => (
                  <option key={order} value={order}>
                    {ORDER_LABEL[order]}
                  </option>
                ))}
              </AutoSubmitSelect>
              <IconChevronDown size={12} />
            </span>
          </form>
        </div>

        {all === null ? (
          <p className="mt-4 text-sm text-muted">Could not read the accounts. Reload the page.</p>
        ) : (
          <>
            <div className="accounts-table mt-4">
              <div className="accounts-grid accounts-table-head" role="row">
                {/* The two headers that are also orders: the address toggles between its two
                    directions, the count has one. The chevron sits on whichever is in force. */}
                <span>
                  <Link href={hrefFor(query, { sort: query.sort === 'az' ? 'za' : 'az', page: 1 })} className={byEmail ? 'is-sorted' : undefined}>
                    Email
                    {query.sort === 'az' && <IconChevronUp size={11} />}
                    {query.sort === 'za' && <IconChevronDown size={11} />}
                  </Link>
                </span>
                <span className="text-center">Gift</span>
                <span>Plan</span>
                <span>Status</span>
                <span className="text-right">
                  <Link href={hrefFor(query, { sort: 'signins', page: 1 })} className={query.sort === 'signins' ? 'is-sorted' : undefined}>
                    Sign-ins
                    {query.sort === 'signins' && <IconChevronDown size={11} />}
                  </Link>
                </span>
                <span />
              </div>

              {pageRows.map(({ account, line, status }) => {
                const badge = line === null ? null : planBadge(line)
                const signIns =
                  account.signInCount === 0
                    ? 'Never signed in'
                    : `${account.signInCount} sign-in${account.signInCount === 1 ? '' : 's'}`

                return (
                  <div key={account.ownerEmail} className="accounts-grid accounts-row" role="row">
                    <span className="accounts-who">
                      {/* The monogram in the plan's own colour, so the row's two coloured
                          marks tell one story; `.plan-badge-none` (the ink ramp) while the
                          plan columns cannot be read, since there is nothing to colour by. */}
                      <span className={`accounts-avatar ${badge?.className ?? 'plan-badge-none'}`} aria-hidden>
                        {avatarInitials(account.ownerEmail)}
                      </span>
                      <span className="accounts-email">{account.ownerEmail}</span>
                    </span>
                    <span className="flex justify-center">
                      {line !== null && giftActive(line) && (
                        <span className="accounts-gift" title="Gift" aria-label="Gift">
                          <IconGift size={13} />
                        </span>
                      )}
                    </span>
                    <span>{badge !== null && <span className={`accounts-plan ${badge.className}`}>{badge.label}</span>}</span>
                    <span className={`accounts-status${status?.tone === 'alert' ? ' is-alert' : status?.tone === 'faint' ? ' is-faint' : ''}`}>
                      {status?.text ?? ''}
                    </span>
                    <span className="accounts-count" aria-label={signIns}>
                      {account.signInCount}
                    </span>
                    <span className="text-right">
                      <Link href={`/accounts/${encodeURIComponent(account.ownerEmail)}`} className="accounts-view">
                        View
                      </Link>
                    </span>
                  </div>
                )
              })}
            </div>

            {pageRows.length === 0 && (
              <p className="mt-3.5 text-sm text-muted">
                {query.view === 'all' ? 'No account matches this search.' : `No account under “${VIEW_LABEL[query.view]}” matches.`}
              </p>
            )}

            {totalPages > 1 && (
              <nav className="accounts-pager" aria-label="Accounts pages">
                {page > 1 ? (
                  <Link href={hrefFor(query, { page: page - 1 })} className="accounts-page-btn">
                    Previous
                  </Link>
                ) : (
                  <span className="accounts-page-btn is-off" aria-hidden>
                    Previous
                  </span>
                )}
                <span className="text-muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={hrefFor(query, { page: page + 1 })} className="accounts-page-btn">
                    Next
                  </Link>
                ) : (
                  <span className="accounts-page-btn is-off" aria-hidden>
                    Next
                  </span>
                )}
              </nav>
            )}
          </>
        )}

        {/* Below the list, on purpose, now that the pill in the header points here: these
            rows are rarely more than one or two, and the list is what the page is for. Same
            table, different columns — a registration has no plan to badge, only a date and
            whether its link still works. */}
        {pending !== null && pending.length > 0 && (
          <section id="pending" className="mt-7">
            <h2 className="section-title">Pending registrations</h2>
            <p className="mt-1 text-sm text-muted">
              Addresses that asked for an account and never followed the link. Confirming creates the account now.
            </p>
            <div className="accounts-table mt-3.5">
              <div className="accounts-grid is-pending accounts-table-head" role="row">
                <span>Email</span>
                <span>Requested</span>
                <span>Link</span>
                <span />
              </div>
              {pending.map((row) => (
                <div key={row.email} className="accounts-grid is-pending accounts-row" role="row">
                  <span className="accounts-who">
                    <span className="accounts-avatar plan-badge-none" aria-hidden>
                      {avatarInitials(row.email)}
                    </span>
                    <span className="accounts-email">{row.email}</span>
                  </span>
                  <span className="accounts-status">{row.createdAt.slice(0, 10)}</span>
                  <span className={`accounts-status${row.expired ? ' is-alert' : ''}`}>
                    {row.expired ? 'Expired' : `Valid until ${row.expiresAt.slice(0, 10)}`}
                  </span>
                  <span className="flex justify-end">
                    <ConfirmPendingRegistrationButton email={row.email} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
