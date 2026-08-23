'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { activatePlanChoice, mockCancel } from '@/lib/plans/checkout'
import type { BillingPeriod } from '@/lib/plans/prices'

/**
 * The same order `PLAN_RANK` (`lib/plans/types.ts`) states, copied rather than imported —
 * this file's own header explains why that module never crosses into the client bundle.
 * Read only against `column.slug` and the reader's own `plan`, both bare strings for the
 * same reason, so a rank comparison never needs the real `Plan` type at all. Five entries,
 * matching `PLAN_VALUES`: a plan missing here compares as `undefined < number`, which is
 * always `false` — an upgrade-shaped default for a mistake this codebase tests never
 * happens, rather than a downgrade sentence for a plan that turns out unranked.
 */
const RANK: Record<string, number> = { free: 0, standard: 1, plus: 2, premium: 3, lifetime: 4 }

/**
 * A column's price slot: the number, and the small suffix beside it — never a whole worded
 * sentence, and that is a deliberate narrowing rather than the shape this used to be. The
 * v3.4 design draws «€2.49» and «/mo» as two different sizes in the same line, which a single
 * pre-worded string («€2.49 per month») could not do; and it draws no third line under either
 * — the renewal disclosure that line used to carry («Billed once a year, and renews each year
 * until you cancel.») has no home in this design at all, on any column, so it is gone rather
 * than kept and left unrendered.
 */
export interface ColumnPrice {
  /** «€19», «€2.49», «€0» — the number alone, with no unit attached. */
  amount: string
  /** «/yr», «/mo», or `''` for Free, which has nothing to bill and so nothing to suffix. */
  suffix: string
}

export interface PlanColumn {
  name: string
  /**
   * `'free' | 'standard' | 'plus' | 'premium'` as a bare string, for the same reason
   * `checkoutPlan` below is one: comparing it against the reader's own plan (`useRole().plan`,
   * itself typed `Plan | null` only because that flows in from a context this file never
   * imports from) is what decides whether a card is the one already held, an upgrade, or a
   * downgrade — see `RANK` above. Every column needs one, including Free, which is why this
   * is separate from `checkoutPlan` rather than reusing it: Free has no checkout plan at all.
   */
  slug: string
  /**
   * Both states, always. Free's two are identical rather than absent, so this component
   * never asks whether a column has a monthly form — a column that opted out of the toggle
   * would be the one place the layout could shift under a tap.
   */
  price: Record<BillingPeriod, ColumnPrice>
  /** Who the plan is for, in one sentence. */
  audience: string
  /**
   * Raised above the other three, with a "Most popular" ribbon — true for exactly one
   * column, `Plus`. A reversal of what this file's CSS used to say on purpose ("no accent
   * border, no ribbon... not something to fix later"): the v3.4 redesign decided a page
   * that only lets somebody choose still benefits from naming the one most people pick.
   */
  featured?: boolean
  /**
   * The middle tier's own faint tint (`.is-paid`) — true for Standard and Premium, false for
   * Free (nothing bought) and unset for Plus, which gets `.is-featured` instead and must
   * never carry both classes at once. A separate field from `featured` rather than inferred
   * from "not free and not featured", because that inference is exactly the kind of thing a
   * fifth plan could get quietly wrong.
   */
  paid?: boolean
  /**
   * True on the Free column and nowhere else — a marker rather than a descriptor, unlike it
   * used to be (`{ href, label }`, back when this rendered one plain link and nothing had to
   * ask who was looking). Free's four states — not signed in, mid the mandatory plan-choice
   * gate, already on Free, or a paid reader downgrading to it — each pick their own wording
   * and their own action now (`switchToFree`, `startFree`, …), none of which a generic
   * `href`/`label` pair could have named; every other column's action comes from
   * `checkoutPlan` below instead, never from this.
   */
  cta?: true
  /**
   * The route slug for the mock checkout (`lib/plans/checkout.ts`'s `CheckoutPlan`), or
   * absent when there is nothing to buy yet. A bare string rather than that type imported
   * here: this file's own header explains why it must never import `@/lib/plans/types`, and
   * `checkout.ts` sits downstream of that module, so pulling in its type would reopen the
   * exact bundle-size door this file exists to keep shut. The page decides whether this is
   * set at all — see `mockCheckoutEnabled()` in `pricing/page.tsx` — so its mere presence is
   * the only thing this component has to check.
   *
   * When it is absent on a paid column, the card simply ends after `audience` with no
   * button at all — the design has no notice anywhere for "not on sale yet" and neither
   * does this component; the absence of a button is the whole of what is said.
   */
  checkoutPlan?: string
}

/** One row of the comparison table below the cards. */
export interface ComparisonRow {
  label: string
  /** One small sentence saying what living without this row is like. */
  note: string
  /** Free, Standard, Plus, Premium — in `columns` order. `null` is "no part of this plan". */
  cells: (string | null)[]
}

const PERIODS: { value: BillingPeriod; label: string }[] = [
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
]

/**
 * The four price columns and the one control on the page that has state.
 *
 * The only client component /pricing loads, and now holds the comparison table as well as
 * the cards (v3.4) — the design repeats each plan's price in the table's own header, and
 * that only reads correctly if it moves with the same toggle the cards already answer to.
 * The headline, the lede, the notice, the lifetime block and the closing block stay
 * server-rendered by the page itself; only the parts that actually say a price crossed the
 * boundary. The page stays statically prerendered either way — a client child is rendered
 * into the HTML with `'month'` already chosen and merely hydrates — so what this boundary
 * costs is one small bundle, and what it buys is a toggle whose selected state a screen
 * reader can actually read, now reaching the table too.
 *
 * The words arrive as props and are not written here, `PlanColumn` by `PlanColumn`,
 * `ComparisonRow` by `ComparisonRow`. Two reasons, and the second is the one that would be
 * missed: the page owns its own copy, so a reader looking for a sentence on /pricing finds
 * every sentence in one file; and this file must never import `@/lib/plans/types`, because
 * importing `PLANS` into a client component ships that whole module to the browser —
 * `LIMIT_MESSAGE`, `limitSentence`, `capWorthNaming` and every paragraph of commentary with
 * them. The numbers are read from `PLANS` on the server and arrive here as strings that have
 * already been made into sentences. `BillingPeriod` is a type import, which erases.
 *
 * Rejected: a CSS-only toggle — two radios and `:has()`, which needs no JavaScript at all
 * and is what the `<details>` FAQ on /login argues for in a comparable spot. It would put
 * both price sets in the DOM at once, which is fine, and leave the *selected* state
 * unspeakable, which is not: a radio that visually swaps other elements' visibility
 * announces itself as a radio and says nothing about the prices that changed. Here one tap
 * changes what four columns say, so the control has to be able to say that it did.
 *
 * `aria-pressed` on two buttons in a `role="group"` rather than a radiogroup with arrow-key
 * semantics: there are two options, both always visible, and the pair reads as two toggles
 * that happen to be exclusive. A radiogroup would promise keyboard behaviour this does not
 * implement.
 *
 * Opens on `'month'`, the v3.4 redesign's own choice — a departure from the previous default
 * of `'year'`, which `prices.test.ts`'s "makes a year cheaper than twelve months" test was
 * the reason for. That invariant still holds and still matters: whichever tab opens first,
 * the other one has to still read as the better deal once tapped.
 */
export function PricingPlans({
  columns,
  rows,
  tableTitle,
}: {
  columns: PlanColumn[]
  /** The comparison table's own rows, rendered below the cards. */
  rows: ComparisonRow[]
  /** The table's own heading — plain text, not a slot, since it is never anything but one line. */
  tableTitle: string
}) {
  const [period, setPeriod] = useState<BillingPeriod>('month')

  /*
   * `useRole()` is what makes this the one page that also serves an existing customer
   * changing plans, not only a visitor choosing one for the first time — every card reads
   * `known`/`email`/`plan`/`planChosen` now, not only Free's own (PLAN.md, v3.7) mandatory
   * plan-choice gate that used to be the sole reason this file read a role at all. None of
   * it gates anything server-side, here or in `(home)/page.tsx`'s own gate: a reader who
   * turns out signed out after clicking "Upgrade to Plus" is stopped by the middleware on
   * `/checkout/plus`, not by this component second-guessing what it already decided to
   * show — the same trust every other page in this app already puts in a role read on the
   * client, and the reason `signedIn`/`isCurrent`/`isDowngrade` below only ever change
   * which sentence a card shows, never what pressing it is allowed to do.
   */
  const router = useRouter()
  const { known, email, planChosen, plan } = useRole()
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)
  const signedIn = known && email !== null
  const pending = signedIn && !planChosen
  /* `null` while the role is still loading or nobody is signed in — `RANK[column.slug] <
     null` is always `false` in JS, which is what keeps every column reading as "not a
     downgrade" (never a real claim, since `isDowngrade` is only read once `signedIn` is
     already true) rather than needing its own guard at each call site. */
  const currentRank = plan === null ? null : RANK[plan]

  const startFree = async () => {
    setFreeBusy(true)
    setFreeError(null)

    const result = await activatePlanChoice()
    if (result.ok) {
      router.push('/')
      return
    }

    setFreeBusy(false)
    setFreeError('Something went wrong. Try again.')
  }

  /*
   * The Free card's own action for a signed-in reader currently on a paid plan — "downgrade
   * to Free" is cancellation, and `mockCancel` (the same action `/billing`'s "Cancel my
   * plan" already calls) is the only path there: `mockPurchase` refuses `'free'` outright,
   * since it is not one of `CHECKOUT_PLANS`. Always a *scheduled* change, never immediate —
   * there is no "downgrade to Free right now" — so this redirects to `/billing` rather than
   * trying to word a "scheduled" state inline here the way `CheckoutScreen` does for a paid
   * downgrade: `/billing` already reads `pendingPlan` and renders exactly that sentence, and
   * duplicating it here would be the second copy this file already avoids elsewhere.
   */
  const switchToFree = async () => {
    setFreeBusy(true)
    setFreeError(null)

    const result = await mockCancel()
    if (result.ok) {
      router.push('/billing')
      return
    }

    setFreeBusy(false)
    setFreeError(
      result.reason === 'not-applicable' ? 'Nothing to change — this account is already on Free.' : "That didn't go through. Try again.",
    )
  }

  return (
    <div>
      <div className="segment mx-auto w-fit" role="group" aria-label="Billing period">
        {PERIODS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            /* px-4: `.segment-button` sets a 44px minimum and no horizontal padding, because
             * every other call site in the app puts a glyph or a number in it. A word needs
             * the padding, and a utility is safe here precisely because the class declares
             * none of its own — there is no coin flip over which rule wins. */
            className={entry.value === period ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={entry.value === period}
            onClick={() => setPeriod(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="plan-columns mt-6">
        {columns.map((column) => {
          const cardClass = column.featured
            ? 'card plan-card is-featured'
            : column.paid
              ? 'card plan-card is-paid'
              : 'card plan-card'

          /*
           * Three ways a signed-in reader's own plan relates to this column — computed once
           * per column and read by both the `checkoutPlan` block below and the `cta` (Free)
           * one, since Free is exactly as much a destination as any paid column now.
           * `isCurrent`/`isDowngrade` are meaningless while `!signedIn` and are never read
           * then; `currentRank`'s own comment says why neither needs its own guard for it.
           */
          const isCurrent = signedIn && column.slug === plan
          const isDowngrade = currentRank !== null && RANK[column.slug] < currentRank

          return (
            <article key={column.name} className={cardClass}>
              {column.featured && <span className="plan-badge">Most popular</span>}

              <h3 className="plan-name">{column.name}</h3>
              <p className="plan-price">
                {column.price[period].amount}
                {column.price[period].suffix !== '' && (
                  <span className="plan-price-period">{column.price[period].suffix}</span>
                )}
              </p>
              <p className="plan-audience">{column.audience}</p>

              {column.checkoutPlan !== undefined && (
                !signedIn ? (
                  <Link href="/register" className="btn btn-primary btn-sm plan-cta w-full">
                    Sign up
                  </Link>
                ) : isCurrent ? (
                  <p className="plan-current w-full">
                    Your plan · <Link href="/billing">Manage</Link>
                  </p>
                ) : (
                  <Link
                    href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                    className="btn btn-primary btn-sm plan-cta w-full"
                  >
                    {isDowngrade ? `Switch to ${column.name}` : `Upgrade to ${column.name}`}
                  </Link>
                )
              )}

              {column.cta !== undefined && pending && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm plan-cta w-full"
                    onClick={() => void startFree()}
                    disabled={freeBusy}
                  >
                    {freeBusy ? 'Activating…' : 'Continue with Free'}
                  </button>
                  {freeError !== null && (
                    <p className="notice notice-error mt-2 text-xs" role="alert">
                      {freeError}
                    </p>
                  )}
                </>
              )}

              {/*
                * Free's other three states, beside `pending` above: not signed in gets the
                * same "Sign up" every paid column does; already on Free gets the same "Your
                * plan" indicator, with no `/billing` link — there is nothing there to manage
                * on a plan with no payment, no expiry and no history; signed in on a *paid*
                * plan gets `switchToFree`, the one card whose downgrade cannot go through
                * `checkoutPlan` at all (see that function's own comment).
                */}
              {column.cta !== undefined && !pending && !signedIn && (
                <Link href="/register" className="btn btn-sm plan-cta w-full">
                  Sign up
                </Link>
              )}

              {column.cta !== undefined && !pending && signedIn && isCurrent && (
                <p className="plan-current w-full">Your plan</p>
              )}

              {column.cta !== undefined && !pending && signedIn && !isCurrent && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm plan-cta w-full"
                    onClick={() => void switchToFree()}
                    disabled={freeBusy}
                  >
                    {freeBusy ? 'Switching…' : 'Switch to Free'}
                  </button>
                  {freeError !== null && (
                    <p className="notice notice-error mt-2 text-xs" role="alert">
                      {freeError}
                    </p>
                  )}
                </>
              )}
            </article>
          )
        })}
      </div>

      <section className="mt-16">
        <h2 className="landing-feature-title">{tableTitle}</h2>

        <div className="plan-table-frame mt-5">
          <div className="plan-table-scroll">
            <table className="plan-table">
              <caption className="sr-only">The four plans compared, feature by feature.</caption>

              <thead>
                <tr>
                  {/* The row-header column has no heading of its own to give. */}
                  <th scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  {columns.map((column) => (
                    <th
                      key={column.name}
                      scope="col"
                      className={column.featured ? 'plan-table-featured' : undefined}
                    >
                      <span className="plan-table-name">{column.name}</span>
                      <span className="plan-table-price">
                        {column.price[period].amount}
                        {column.price[period].suffix}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">
                      <span className="plan-row-label">{row.label}</span>
                      <span className="plan-row-note">{row.note}</span>
                    </th>

                    {row.cells.map((cell, index) => {
                      const featured = columns[index].featured
                      const cellClass =
                        cell === null
                          ? featured
                            ? 'plan-cell-none plan-table-featured'
                            : 'plan-cell-none'
                          : featured
                            ? 'plan-table-featured'
                            : undefined

                      return (
                        <td key={columns[index].name} className={cellClass}>
                          {cell === null ? (
                            <>
                              {/*
                                * A dash is a glyph, not a word: read aloud it is either silence
                                * or "em dash", and neither says what the cell means. The word
                                * goes to a screen reader, the glyph to the eye.
                                */}
                              <span aria-hidden>—</span>
                              <span className="sr-only">Not included</span>
                            </>
                          ) : (
                            cell
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * The Lifetime panel's own button — split out from the panel itself, which stays
 * server-rendered in `pricing/page.tsx` (its title, price and trust note need nothing from
 * a session). Only the one thing that has to know who is looking moves here, into a
 * component that already reads `useRole()`, rather than a second `'use client'` boundary
 * opened just to ask the same question again.
 *
 * `href` is `/checkout/lifetime` for a signed-in reader, exactly as before; a reader with
 * no session yet gets `/register` instead, for the same reason every column above does —
 * a click on `/checkout/lifetime` with no session redirects through `/login` and loses
 * which purchase they meant, and Lifetime is not exempt from that just because it renders
 * outside the four-card grid.
 *
 * Already on Lifetime gets the same "Your plan" indicator the four cards show for their
 * own current plan, rather than a live "Choose Lifetime" that would only reach checkout to
 * be refused — `mockPurchase` already answers `not-applicable` there ("This account is
 * already on Lifetime — there is nothing left to buy."), so this is the one-step-earlier
 * version of the same fact, not a new rule.
 */
export function LifetimeCta({ href }: { href: string }) {
  const { known, email, plan } = useRole()
  const signedIn = known && email !== null

  if (!signedIn) {
    return (
      <Link href="/register" className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
        Sign up
      </Link>
    )
  }

  if (plan === 'lifetime') {
    return <p className="plan-current mt-4">Your plan</p>
  }

  return (
    <Link href={href} className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
      Choose Lifetime
    </Link>
  )
}
