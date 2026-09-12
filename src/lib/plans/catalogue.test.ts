import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  compareCatalogue,
  euroToCents,
  expectedCatalogue,
  type CataloguePrice,
  type ExpectedPrice,
} from './catalogue'
import { PAID_PLANS } from './prices'

/** The catalogue Paddle would return if it agreed with the listino in every respect. */
function agreeing(): CataloguePrice[] {
  return expectedCatalogue().map((row) => ({
    id: `pri_${row.plan}${row.cycle ?? ''}`,
    plan: row.plan,
    cycle: row.cycle,
    amount: row.cents,
    currency: 'EUR',
    taxMode: 'internal',
    interval: row.cycle,
    frequency: row.cycle ? 1 : null,
    hasTrial: false,
    overrides: 0,
    status: 'active',
  }))
}

/** The same, with one price altered — the shape every disagreement test below takes. */
function withPrice(change: Partial<CataloguePrice>, matches: (p: CataloguePrice) => boolean): CataloguePrice[] {
  return agreeing().map((price) => (matches(price) ? { ...price, ...change } : price))
}

const isStandardYear = (p: CataloguePrice) => p.plan === 'standard' && p.cycle === 'year'

/** Every row wired, so `id` matching has something to match on. */
function wired(): ExpectedPrice[] {
  return expectedCatalogue().map((row) => ({ ...row, paddleId: `pri_${row.plan}${row.cycle ?? ''}` }))
}

describe('euroToCents', () => {
  /*
   * The listino ends every amount in `.99` or `.49`, and those are exactly the values a
   * naive `Number(x) * 100` gets wrong: 34.99 × 100 is 3498.9999999999995 in binary, which
   * truncates to 3498 and undercharges by a cent. `Math.round` is the whole fix, asserted
   * here so nobody simplifies it away.
   */
  it('converts the listino endings without floating-point drift', () => {
    assert.equal(euroToCents('34.99'), '3499')
    assert.equal(euroToCents('3.49'), '349')
    assert.equal(euroToCents('69.99'), '6999')
    assert.equal(euroToCents('199.99'), '19999')
  })
})

describe('expectedCatalogue', () => {
  it('covers every paid plan in both cycles, plus Lifetime, and nothing else', () => {
    const rows = expectedCatalogue()

    assert.equal(rows.length, PAID_PLANS.length * 2 + 1)
    assert.equal(rows.filter((row) => row.plan === 'lifetime').length, 1)
    /* `free` is what an account already is, so there is no price it could disagree with. */
    assert.equal(rows.filter((row) => row.plan === 'free').length, 0)
  })

  it('gives Lifetime no billing cycle, because it is bought once', () => {
    assert.equal(expectedCatalogue().find((row) => row.plan === 'lifetime')?.cycle, null)
  })
})

describe('compareCatalogue', () => {
  it('passes a catalogue that agrees, matching on the stamp rather than on ids', () => {
    const report = compareCatalogue(expectedCatalogue(), agreeing(), 'custom-data')

    assert.deepEqual(report.failures, [])
    assert.deepEqual(report.unwired, [])
    assert.equal(report.checked, PAID_PLANS.length * 2 + 1)
  })

  /*
   * The case the whole module exists for. An empty `paddleId` means the live catalogue was
   * never wired into `prices.ts`, and a run where every row is empty must not be reportable
   * as agreement — otherwise this check reads as a pass at exactly the moment it is verifying
   * nothing at all.
   */
  it('reports an unwired row rather than passing it', () => {
    const report = compareCatalogue(expectedCatalogue(), agreeing(), 'id')

    assert.equal(report.checked, 0)
    assert.deepEqual(report.failures, [])
    assert.equal(report.unwired.length, PAID_PLANS.length * 2 + 1)
  })

  it('checks the rows that are wired', () => {
    const report = compareCatalogue(wired(), agreeing(), 'id')

    assert.deepEqual(report.failures, [])
    assert.equal(report.checked, PAID_PLANS.length * 2 + 1)
  })

  it('catches an amount that has moved in Paddle', () => {
    const report = compareCatalogue(expectedCatalogue(), withPrice({ amount: '3999' }, isStandardYear), 'custom-data')

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /standard\/year amount/)
  })

  /*
   * The divergence a check on the amount alone cannot see: `account_setting` on a
   * tax-exclusive account charges the listino *plus* VAT, so every amount still matches
   * while the customer pays more than `/pricing` promised.
   */
  it('catches a price that stopped being tax-inclusive', () => {
    const report = compareCatalogue(
      expectedCatalogue(),
      withPrice({ taxMode: 'account_setting' }, isStandardYear),
      'custom-data',
    )

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /tax_mode/)
  })

  it('catches a trial period, which no price here may carry', () => {
    const report = compareCatalogue(expectedCatalogue(), withPrice({ hasTrial: true }, isStandardYear), 'custom-data')

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /trial period/)
  })

  it('catches a regional override, which would break the euro-only claim', () => {
    const report = compareCatalogue(expectedCatalogue(), withPrice({ overrides: 2 }, isStandardYear), 'custom-data')

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /regional overrides/)
  })

  /* Lifetime turning into a subscription is the one change that would charge a reader again. */
  it('catches Lifetime having grown a billing cycle', () => {
    const report = compareCatalogue(
      expectedCatalogue(),
      withPrice({ interval: 'year', frequency: 1 }, (p) => p.plan === 'lifetime'),
      'custom-data',
    )

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /lifetime billing cycle/)
  })

  it('catches a price that is no longer in the catalogue', () => {
    const report = compareCatalogue(
      expectedCatalogue(),
      agreeing().filter((price) => !isStandardYear(price)),
      'custom-data',
    )

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /no price stamped/)
  })

  it('catches an archived price still carrying the right amount', () => {
    const report = compareCatalogue(expectedCatalogue(), withPrice({ status: 'archived' }, isStandardYear), 'custom-data')

    assert.equal(report.failures.length, 1)
    assert.match(report.failures[0], /status/)
  })
})
