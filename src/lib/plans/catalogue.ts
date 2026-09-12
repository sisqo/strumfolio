/**
 * Comparing Paddle's catalogue against the listino this app prints.
 *
 * `prices.ts` states the problem this module exists for: «this table and Paddle's catalogue
 * are two things that must agree, and nothing in this repository can check that they do» —
 * Paddle holds the prices that are actually charged, `PRICES` holds the prices that are
 * shown, and until a checkout existed there was no call to compare them with. This is the
 * comparison, as a pure function, so `scripts/verify-paddle-catalogue.ts` is only the I/O
 * around it and the rules themselves are covered by `catalogue.test.ts`.
 *
 * It checks more than the amount, because the amount is not the only way the shown price and
 * the charged price come apart. `tax_mode` is the sharpest of them: the euro figure here is
 * tax-*inclusive*, so a price that says `account_setting` on an account configured
 * tax-exclusive charges the same number plus VAT, and every assertion about the amount still
 * passes while the customer pays more than the page promised. A trial period and a regional
 * override are the same kind of divergence in a different direction, which is why neither may
 * exist and both are asserted rather than assumed.
 *
 * **Two ways to identify a price, one per environment, and that is the decided shape rather
 * than an accident.** `PlanPrice.paddleId` is a single string and cannot hold two
 * environments' ids, so it holds the *live* ones — the catalogue that takes real money is the
 * one whose agreement with this table matters. Sandbox prices are matched on their
 * `custom_data` instead (`{plan, cycle}`, stamped at creation), which is why checking sandbox
 * needs no ids in the code and no environment variable at all.
 */

import { LIFETIME, PAID_PLANS, PRICES, type BillingPeriod } from './prices'
import { type Plan } from './types'

/** A price as either source hands it over, normalised. Amounts stay strings, as Paddle sends them. */
export interface CataloguePrice {
  id: string
  /** `custom_data.plan`, absent on anything created outside this repo's own setup. */
  plan: string | null
  /** `custom_data.cycle`; null on a one-time price, and on anything unstamped. */
  cycle: string | null
  /** Lowest denomination, so cents for euro: `'3499'` is €34.99. */
  amount: string
  currency: string
  taxMode: string
  /** `billing_cycle.interval`, or null when the price is one-time. */
  interval: string | null
  frequency: number | null
  hasTrial: boolean
  /** How many `unit_price_overrides` the price carries. Must be zero: the listino is euro-only. */
  overrides: number
  /** Paddle's per-price purchase limits. Must be exactly one — see the check below. */
  quantity: { minimum: number; maximum: number }
  status: string
}

/** One row of the listino, as it must appear in Paddle. */
export interface ExpectedPrice {
  plan: Plan
  /** null for Lifetime, which is bought once and has no billing cycle. */
  cycle: BillingPeriod | null
  /** Euro as `/pricing` prints it, for the failure message a person reads. */
  euro: string
  /** The same amount in cents, which is what Paddle stores. */
  cents: string
  /** The live price id, or `''` while the live catalogue does not exist yet. */
  paddleId: string
}

export interface CatalogueReport {
  /** Rows that were found in Paddle and fully checked. */
  checked: number
  /** Rows whose `paddleId` is still `''` — not a pass, and never silently one. */
  unwired: ExpectedPrice[]
  /** One line per disagreement, already phrased for a terminal. */
  failures: string[]
}

/**
 * `'34.99'` → `'3499'`. Over cents rather than `toFixed`, for the reason
 * `yearlyTotalOfMonthly` gives: 2.49 × 100 in binary is not 249 until it is rounded.
 */
export function euroToCents(amount: string): string {
  return String(Math.round(Number(amount) * 100))
}

/**
 * The listino as rows, read from `PRICES` and `LIFETIME` rather than restated — a second
 * literal table here would be one more thing to keep in step, which is the failure this whole
 * module exists to catch.
 *
 * `free` contributes nothing, and that is the shape rather than an omission: it is what an
 * account already is, so there is no Paddle price it could disagree with.
 */
export function expectedCatalogue(): ExpectedPrice[] {
  const rows: ExpectedPrice[] = []

  for (const plan of PAID_PLANS) {
    for (const cycle of ['year', 'month'] as const) {
      const price = PRICES[plan][cycle]
      rows.push({ plan, cycle, euro: price.amount, cents: euroToCents(price.amount), paddleId: price.paddleId })
    }
  }

  rows.push({
    plan: 'lifetime',
    cycle: null,
    euro: LIFETIME.amount,
    cents: euroToCents(LIFETIME.amount),
    paddleId: LIFETIME.paddleId,
  })

  return rows
}

/** How a row is found among Paddle's prices: by the id in the code, or by the stamp on the price. */
export type MatchBy = 'id' | 'custom-data'

function label(row: ExpectedPrice): string {
  return row.cycle ? `${row.plan}/${row.cycle}` : row.plan
}

function find(row: ExpectedPrice, actual: CataloguePrice[], matchBy: MatchBy): CataloguePrice | undefined {
  if (matchBy === 'id') return actual.find((price) => price.id === row.paddleId)
  return actual.find((price) => price.plan === row.plan && price.cycle === row.cycle)
}

/**
 * Every disagreement between the listino and a catalogue, as lines a person can act on.
 *
 * An empty `paddleId` is reported as `unwired` and never as a pass. A run where every row is
 * unwired would otherwise be indistinguishable from a run where everything agrees, which is
 * the one outcome a check like this must not be able to produce.
 */
export function compareCatalogue(
  expected: ExpectedPrice[],
  actual: CataloguePrice[],
  matchBy: MatchBy,
): CatalogueReport {
  const report: CatalogueReport = { checked: 0, unwired: [], failures: [] }

  for (const row of expected) {
    if (matchBy === 'id' && row.paddleId === '') {
      report.unwired.push(row)
      continue
    }

    const price = find(row, actual, matchBy)
    if (!price) {
      report.failures.push(
        matchBy === 'id'
          ? `${label(row)}: no price ${row.paddleId} in the catalogue`
          : `${label(row)}: no price stamped with that plan and cycle`,
      )
      continue
    }

    const fail = (what: string, got: unknown, want: unknown) =>
      report.failures.push(`${label(row)} ${what}: catalogue has ${JSON.stringify(got)}, listino says ${JSON.stringify(want)}`)

    if (price.amount !== row.cents) fail(`amount (€${row.euro})`, price.amount, row.cents)
    if (price.currency !== 'EUR') fail('currency', price.currency, 'EUR')

    /* The tax argument in full is in the root CLAUDE.md: anything but `internal` means the
       customer can be charged the listino plus VAT while every amount above still matches. */
    if (price.taxMode !== 'internal') fail('tax_mode', price.taxMode, 'internal')

    if (price.interval !== row.cycle) fail('billing cycle', price.interval, row.cycle)
    if (row.cycle && price.frequency !== 1) fail('billing frequency', price.frequency, 1)
    if (price.hasTrial) fail('trial period', 'present', 'none')

    /*
     * **A plan is bought once per account, and nothing downstream enforces that.** Omitting
     * `quantity` at creation makes Paddle default to 1-100, so the checkout offers to buy up to
     * a hundred subscriptions — and `planOfItems` reads the first item's price and grants the
     * plan whatever the quantity says. Five would be charged five times and grant exactly the
     * same Premium. The cap belongs on the price because that is where the overlay reads it;
     * this asserts it has not drifted back.
     */
    if (price.quantity.minimum !== 1 || price.quantity.maximum !== 1) {
      fail('quantity', `${price.quantity.minimum}-${price.quantity.maximum}`, '1-1')
    }
    if (price.overrides !== 0) fail('regional overrides', price.overrides, 0)
    if (price.status !== 'active') fail('status', price.status, 'active')

    report.checked += 1
  }

  return report
}
