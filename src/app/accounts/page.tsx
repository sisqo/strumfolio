import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ConfirmPendingRegistrationButton } from '@/components/ConfirmPendingRegistrationButton'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { auth } from '@/auth'
import { listAccountPlans, listAllAccounts, listPendingRegistrations } from '@/lib/accounts/read'
import type { AccountSummary } from '@/lib/accounts/read'
import { giftWithdrawn, noPlanYet, planBadge, planDetail, stillAwaitingChoice } from '@/lib/accounts/planText'
import { isOwner } from '@/lib/allowlist'
import { forcedPlanNotice, plansEnforced } from '@/lib/plans/resolve'
import { PLAN_LABEL, PLAN_VALUES } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

export const metadata: Metadata = { title: 'Accounts' }

/** Rendered per request: which accounts exist, and the search/sort/page state, both depend on the request. */
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type SortKey = 'email' | 'createdAt' | 'lastSignInAt'

interface Query {
  q: string
  plan: Plan | null
  unactivated: boolean
  /**
   * Accounts whose gift was given and then taken away (`giftWithdrawn`). Its own filter rather
   * than a value of the plan one, and in AND with it like `unactivated` already is: such a row
   * reads as an ordinary `free` account on every field the plan filter looks at, so there is no
   * plan value that could ever have selected it.
   */
  withdrawn: boolean
  sort: SortKey
  dir: 'asc' | 'desc'
  page: number
}

/** Reads the seven URL params into a typed, defaulted shape — an unrecognised or absent value always falls back to the least surprising default, never to an error. */
function readQuery(raw: {
  q?: string
  plan?: string
  unactivated?: string
  withdrawn?: string
  sort?: string
  dir?: string
  page?: string
}): Query {
  const plan = PLAN_VALUES.includes(raw.plan as Plan) ? (raw.plan as Plan) : null
  const sort: SortKey = raw.sort === 'createdAt' || raw.sort === 'lastSignInAt' ? raw.sort : 'email'
  const page = Math.max(1, Number.parseInt(raw.page ?? '1', 10) || 1)

  return {
    q: (raw.q ?? '').trim(),
    plan,
    unactivated: raw.unactivated === '1',
    withdrawn: raw.withdrawn === '1',
    sort,
    dir: raw.dir === 'desc' ? 'desc' : 'asc',
    page,
  }
}

/** The query string for a link that keeps every current param except the ones named in `overrides` — how every sort/page/pagination link on this page is built, so none of them can drop a filter the operator already set. */
function hrefFor(query: Query, overrides: Partial<Query>): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  if (merged.q !== '') params.set('q', merged.q)
  if (merged.plan !== null) params.set('plan', merged.plan)
  if (merged.unactivated) params.set('unactivated', '1')
  if (merged.withdrawn) params.set('withdrawn', '1')
  if (merged.sort !== 'email') params.set('sort', merged.sort)
  if (merged.dir !== 'asc') params.set('dir', merged.dir)
  if (merged.page !== 1) params.set('page', String(merged.page))

  const search = params.toString()
  return search === '' ? '/accounts' : `/accounts?${search}`
}

interface Props {
  searchParams: Promise<{
    q?: string
    plan?: string
    unactivated?: string
    withdrawn?: string
    sort?: string
    dir?: string
    page?: string
  }>
}

/**
 * Every account in the installation, searchable, sortable and paginated — a **global owner**
 * question through and through, with a single public now (v3.1). The old second audience, a
 * collaborator switching between accounts they were invited into, is gone along with
 * collaboration itself. `notFound()` rather than a role notice, same reasoning as every other
 * slug-reached page in this app — "this does not exist" and "this is not yours" should look
 * identical from outside.
 *
 * No longer offers creating an account (PLAN.md, v3.8, replacing the old "Create"
 * section): self-service registration and automatic provisioning on any first sign-in — Google
 * or password — cover every real case an admin-created account used to.
 *
 * Filtering by plan and sorting operate in memory, on the *resolved* plan `listAccountPlans`
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
   * plan clause and nothing else. Widening `listAllAccounts` instead would put the whole screen
   * behind those same migrations.
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
   * When `plans` is null (an unapplied migration — the same case `listAccountPlans` already
   * documents), the plan filter and the "Not activated" checkbox stay on screen but are
   * silently ignored: every account passes, exactly as if neither had been set. Failing the
   * whole search closed over a filter nobody can currently answer would be strictly worse than
   * showing the unfiltered list `AccountsPage` already fell back to before this feature existed.
   */
  const filterByPlan = plans !== null && (query.plan !== null || query.unactivated || query.withdrawn)

  const filtered = (all ?? []).filter((account) => {
    if (needle !== '' && !account.ownerEmail.toLowerCase().includes(needle)) return false
    if (filterByPlan) {
      const line = plans?.get(account.ownerEmail)
      if (line === undefined) return false
      if (query.plan !== null && line.effectivePlan !== query.plan) return false
      /*
       * An account with no plan is not a Free account, however the column reads — the badge
       * says "No plan" for exactly that reason (`noPlanYet`), and handing it back under a
       * Free filter would contradict the row the operator is looking at. Those accounts are
       * what the checkbox below finds.
       */
      if (query.plan === 'free' && noPlanYet(line)) return false
      if (query.unactivated && line.planChosen) return false
      if (query.withdrawn && !giftWithdrawn(line)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const cmp =
      query.sort === 'email'
        ? a.ownerEmail.localeCompare(b.ownerEmail)
        : query.sort === 'createdAt'
          ? a.createdAt.localeCompare(b.createdAt)
          : (a.lastSignInAt ?? '').localeCompare(b.lastSignInAt ?? '')
    return query.dir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const page = Math.min(query.page, totalPages)
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="accounts" />

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        <header className="mb-[1.125rem]">
          <h1 className="screen-title">Accounts</h1>
          <p className="mt-2 text-sm leading-[1.45] text-muted">
            Every account in the installation. Open one to manage its plan, password or removal.
          </p>
        </header>

        {/* The only place `SONGBOOK_PLANS` reaches a screen anywhere in this app. Without it,
            «I gifted premium and nothing changed» is a support call with no visible cause. */}
        {!plansEnforced() && (
          <p className="notice notice-accent mb-2.5" role="status">
            Plans are off in this deployment: every account gets everything, whatever it says here.
          </p>
        )}
        {forced !== null && (
          <p className="notice notice-error mb-2.5" role="status">
            SONGBOOK_PLANS is set: every account is being gated as <strong>{forced}</strong>, whatever it says here.
          </p>
        )}

        {/* Above the search form and its own filters, deliberately (`PLAN-account-admin.md`,
            point 11): the list below is paginated at 25, so a section appended after it
            would land at a different height on every page — the opposite of what this
            exists for, which is discoverability without already knowing the address. */}
        {pending !== null && pending.length > 0 && (
          <section className="card mb-2.5 p-3.5">
            <h2 className="section-title mb-2.5">Pending registrations</h2>
            <ul className="card-stack">
              {pending.map((row) => (
                <li key={row.email} className="card flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{row.email}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-muted">
                      Requested {row.createdAt.slice(0, 10)}
                      {row.expired && <span className="badge plan-badge-unchosen">Expired</span>}
                    </span>
                  </span>
                  <ConfirmPendingRegistrationButton email={row.email} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <form method="get" className="card flex flex-wrap items-end gap-2.5 p-3.5">
          <label className="min-w-0 flex-1 basis-40">
            <span className="mb-1 block text-[0.8125rem] text-muted">Search</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q}
              placeholder="person@example.com"
              className="form-field w-full"
            />
          </label>

          <label>
            <span className="mb-1 block text-[0.8125rem] text-muted">Plan</span>
            <select name="plan" defaultValue={query.plan ?? ''} className="form-field">
              <option value="">All plans</option>
              {PLAN_VALUES.map((plan) => (
                <option key={plan} value={plan}>
                  {PLAN_LABEL[plan]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 pb-2.5">
            <input type="checkbox" name="unactivated" value="1" defaultChecked={query.unactivated} />
            <span className="text-[0.8125rem] text-muted">Without a plan only</span>
          </label>

          {/* The only way to reach these rows from here: on every field the plan filter reads,
              a withdrawn gift is indistinguishable from a deliberate Free — see `giftWithdrawn`. */}
          <label className="flex items-center gap-1.5 pb-2.5">
            <input type="checkbox" name="withdrawn" value="1" defaultChecked={query.withdrawn} />
            <span className="text-[0.8125rem] text-muted">Gift withdrawn only</span>
          </label>

          <label>
            <span className="mb-1 block text-[0.8125rem] text-muted">Sort by</span>
            <select name="sort" defaultValue={query.sort} className="form-field">
              <option value="email">Email</option>
              <option value="createdAt">Registered</option>
              <option value="lastSignInAt">Last sign-in</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-[0.8125rem] text-muted">Direction</span>
            <select name="dir" defaultValue={query.dir} className="form-field">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>

          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>

        {all === null ? (
          <p className="mt-2.5 text-sm text-muted">Could not read the accounts. Reload the page.</p>
        ) : (
          <>
            <ul className="card-stack mt-2.5">
              {pageRows.map((account: AccountSummary) => {
                const line = plans?.get(account.ownerEmail) ?? null
                const badge = line === null ? null : planBadge(line)

                return (
                  <li key={account.ownerEmail} className="card flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{account.ownerEmail}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span
                          className="meta-chip"
                          aria-label={
                            account.signInCount === 0
                              ? 'Never signed in'
                              : `${account.signInCount} sign-in${account.signInCount === 1 ? '' : 's'}`
                          }
                        >
                          {account.signInCount}
                        </span>
                        {line !== null && badge !== null && (
                          <>
                            <span className={`badge ${badge.className}`}>{badge.label}</span>
                            {/* Only the residual row a plan was assigned to that still has not
                                passed the gate — see `stillAwaitingChoice`. */}
                            {stillAwaitingChoice(line) && (
                              <span className="badge plan-badge-unchosen">Awaiting choice</span>
                            )}
                            {/* Otherwise this row is byte-for-byte a deliberate Free account —
                                see `giftWithdrawn` on why the badge and the detail cannot say so.
                                A single letter, not the full word: this list can run to many
                                rows, and "G" beside the plan badge is enough to flag "there's a
                                gift history here, open the row for the story" — the full
                                sentence already lives on the detail page. */}
                            {giftWithdrawn(line) && (
                              <span className="badge plan-badge-unchosen" title="Gift withdrawn" aria-label="Gift withdrawn">
                                G
                              </span>
                            )}
                            {planDetail(line) !== '' && (
                              <span className="text-[0.8125rem] text-muted">{planDetail(line)}</span>
                            )}
                          </>
                        )}
                      </span>
                    </span>
                    <Link href={`/accounts/${encodeURIComponent(account.ownerEmail)}`} className="btn btn-sm">
                      View
                    </Link>
                  </li>
                )
              })}
            </ul>

            {pageRows.length === 0 && <p className="mt-2.5 text-sm text-muted">No account matches this search.</p>}

            {totalPages > 1 && (
              <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Accounts pages">
                {page > 1 ? (
                  <Link href={hrefFor(query, { page: page - 1 })} className="btn btn-sm">
                    Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-muted">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages ? (
                  <Link href={hrefFor(query, { page: page + 1 })} className="btn btn-sm">
                    Next
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </>
        )}

        <Footer />
      </main>
    </PrefsProvider>
  )
}
