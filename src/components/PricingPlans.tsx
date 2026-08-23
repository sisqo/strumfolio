'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useRole } from '@/components/RoleProvider'
import { activatePlanChoice } from '@/lib/plans/checkout'
import type { BillingPeriod } from '@/lib/plans/prices'

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
   * A plain, always-on action — `Start free`, pointed wherever registering happens. Free is
   * not something `checkout.ts` sells, so it has no `checkoutPlan` and needs this instead;
   * every other column's button comes from `checkoutPlan` below, never from this.
   */
  cta?: { href: string; label: string }
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
   * The "Start free" CTA (PLAN.md, v3.7): a plain link to `/register` for anyone
   * unknown or signed out, exactly as it has always been, but a real action for a reader
   * who is signed in and has not yet completed the mandatory plan-choice gate — the one
   * button on this page that has to know who is looking. Everything else on this page stays
   * static; this is the one place `useRole()` is read, and only to decide between two
   * harmless things one button does, never to gate anything server-side (see `(home)/page.tsx`
   * for the actual gate).
   */
  const router = useRouter()
  const { known, email, planChosen } = useRole()
  const [freeBusy, setFreeBusy] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)
  const pending = known && email !== null && !planChosen

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
                <Link
                  href={`/checkout/${column.checkoutPlan}?cycle=${period}`}
                  className="btn btn-primary btn-sm plan-cta w-full"
                >
                  Choose {column.name}
                </Link>
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

              {column.cta !== undefined && !pending && (
                <Link href={column.cta.href} className="btn btn-sm plan-cta w-full">
                  {column.cta.label}
                </Link>
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
