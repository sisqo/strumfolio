import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BillingPeriod, CheckoutPlan } from '@/lib/plans/prices'

import { discountIdFor, discountKindFor, discountSpecs } from './paddleDiscount'
import type { DiscountIds, DiscountableCampaign, PriceIdResolver } from './paddleDiscount'

const CAMPAIGN: DiscountableCampaign = {
  code: 'HAPPYSONG',
  discountPercent: '30',
  discountMonths: 3,
  appliesToLifetime: false,
  expiresAt: new Date('2026-12-03T00:00:00.000Z'),
}

/** The sandbox catalogue's own shape: three plans on two cycles, plus the Lifetime. */
const everyPrice: PriceIdResolver = (plan, cycle) =>
  plan === 'lifetime' ? (cycle === null ? 'pri_lifetime' : null) : cycle === null ? null : `pri_${plan}_${cycle}`

/** A deployment that can name some prices and not others — the half-filled `PADDLE_PRICE_IDS`. */
function allBut(missing: { plan: CheckoutPlan; cycle: BillingPeriod | null }): PriceIdResolver {
  return (plan, cycle) => (plan === missing.plan && cycle === missing.cycle ? null : everyPrice(plan, cycle))
}

const NO_IDS: DiscountIds = {
  paddleDiscountIdMonthly: null,
  paddleDiscountIdAnnual: null,
  paddleDiscountIdLifetime: null,
}

describe('discountKindFor', () => {
  it('maps a plan and a cycle onto the column that holds its discount', () => {
    assert.equal(discountKindFor('standard', 'month'), 'monthly')
    assert.equal(discountKindFor('premium', 'year'), 'annual')
    assert.equal(discountKindFor('lifetime', null), 'lifetime')
  })

  /* `paddlePriceId`'s own refusal, restated: a cycle for the Lifetime, or none for a plan that
     renews, is a caller bug and must not resolve to whichever entity is nearest. */
  it('refuses the mismatch in either direction rather than guessing', () => {
    assert.equal(discountKindFor('lifetime', 'month'), null)
    assert.equal(discountKindFor('lifetime', 'year'), null)
    assert.equal(discountKindFor('standard', null), null)
  })
})

describe('discountIdFor', () => {
  it('reads the column the purchase belongs to', () => {
    const ids: DiscountIds = {
      paddleDiscountIdMonthly: 'dsc_month',
      paddleDiscountIdAnnual: 'dsc_year',
      paddleDiscountIdLifetime: 'dsc_life',
    }

    assert.equal(discountIdFor(ids, 'plus', 'month'), 'dsc_month')
    assert.equal(discountIdFor(ids, 'plus', 'year'), 'dsc_year')
    assert.equal(discountIdFor(ids, 'lifetime', null), 'dsc_life')
  })

  /*
   * **The refusal is the feature.** A campaign whose sync has never run, or covers no Lifetime,
   * has nothing to charge against — and the caller turns this `null` into `coupon-unsupported`
   * rather than into a sale at the listino, which is the price the reader was not shown.
   */
  it('answers null for a campaign with no discount behind it', () => {
    assert.equal(discountIdFor(NO_IDS, 'standard', 'month'), null)
    assert.equal(discountIdFor({ ...NO_IDS, paddleDiscountIdMonthly: 'dsc_month' }, 'standard', 'year'), null)
    assert.equal(discountIdFor({ ...NO_IDS, paddleDiscountIdMonthly: 'dsc_month' }, 'lifetime', null), null)
  })

  /* A column holding something that is not a Paddle discount id is a column nothing should be
     charged against — `paddlePriceId` says the same of `pri_`. */
  it('reads anything that is not a `dsc_` as absent', () => {
    for (const held of ['', 'pri_01m2avn0g2xgpv2hhz14gqrm7s', 'HAPPYSONG', 'null']) {
      assert.equal(discountIdFor({ ...NO_IDS, paddleDiscountIdMonthly: held }, 'standard', 'month'), null, held)
    }
  })
})

describe('discountSpecs', () => {
  /*
   * The whole reason three entities exist: `maximum_recurring_intervals` counts billing periods,
   * so three months is `3` monthly and `1` yearly. The same campaign row, told in the unit each
   * entity needs — `discountCycles`' own pair of consumers.
   */
  it('counts the campaign months in each cycle, not in months', () => {
    const specs = discountSpecs(CAMPAIGN, everyPrice)

    assert.deepEqual(
      specs.map((spec) => [spec.kind, spec.maximumRecurringIntervals]),
      [
        ['monthly', 3],
        ['annual', 1],
      ],
    )
  })

  it('restricts each entity to the three prices of its own cycle', () => {
    const specs = discountSpecs(CAMPAIGN, everyPrice)

    assert.deepEqual(specs[0]?.restrictTo, ['pri_standard_month', 'pri_plus_month', 'pri_premium_month'])
    assert.deepEqual(specs[1]?.restrictTo, ['pri_standard_year', 'pri_plus_year', 'pri_premium_year'])
  })

  it('carries the percentage and the expiry through unchanged', () => {
    const [monthly] = discountSpecs(CAMPAIGN, everyPrice)

    assert.equal(monthly?.amount, '30')
    assert.equal(monthly?.recur, true)
    assert.deepEqual(monthly?.expiresAt, CAMPAIGN.expiresAt)
    assert.match(monthly?.description ?? '', /HAPPYSONG/)
  })

  /*
   * **The rule with money behind it.** A monthly discount restricted to Standard and Plus
   * attaches to a Premium transaction without complaint, matches no item, and charges €9.99 to
   * somebody shown €6.99. Paddle reports nothing, because from its side nothing went wrong. So
   * the kind is not built at all, its column stays empty, and `discountIdFor` refuses.
   */
  it('builds no entity for a cycle whose every price cannot be named', () => {
    const specs = discountSpecs(CAMPAIGN, allBut({ plan: 'premium', cycle: 'month' }))

    assert.deepEqual(
      specs.map((spec) => spec.kind),
      ['annual'],
    )
  })

  it('leaves the Lifetime out unless the campaign covers it', () => {
    assert.deepEqual(
      discountSpecs(CAMPAIGN, everyPrice).map((spec) => spec.kind),
      ['monthly', 'annual'],
    )

    const covering = discountSpecs({ ...CAMPAIGN, appliesToLifetime: true }, everyPrice)
    const lifetime = covering.find((spec) => spec.kind === 'lifetime')

    assert.deepEqual(
      covering.map((spec) => spec.kind),
      ['monthly', 'annual', 'lifetime'],
    )
    /* Bought once: there is no billing period for a number of periods to mean anything about. */
    assert.equal(lifetime?.recur, false)
    assert.equal(lifetime?.maximumRecurringIntervals, null)
    assert.deepEqual(lifetime?.restrictTo, ['pri_lifetime'])
  })

  it('leaves it out too when the Lifetime price cannot be named', () => {
    const specs = discountSpecs({ ...CAMPAIGN, appliesToLifetime: true }, allBut({ plan: 'lifetime', cycle: null }))

    assert.deepEqual(
      specs.map((spec) => spec.kind),
      ['monthly', 'annual'],
    )
  })

  /* `null` months is a discount that never lapses, and Paddle spells that `recur` with no
     interval count — not `0`, which would be a discount that covers nothing. */
  it('passes a discount that never ends as a recurrence with no count', () => {
    const forever = discountSpecs({ ...CAMPAIGN, discountMonths: null }, everyPrice)

    for (const spec of forever) {
      assert.equal(spec.recur, true)
      assert.equal(spec.maximumRecurringIntervals, null)
    }
  })

  /* The yearly cycle rounds **up**, always in the customer's favour: fourteen months is two
     whole years. `discountCycles` owns that decision; this is the entity it produces. */
  it('rounds the yearly entity up, as the campaign promises', () => {
    const specs = discountSpecs({ ...CAMPAIGN, discountMonths: 14 }, everyPrice)

    assert.deepEqual(
      specs.map((spec) => [spec.kind, spec.maximumRecurringIntervals]),
      [
        ['monthly', 14],
        ['annual', 2],
      ],
    )
  })
})
