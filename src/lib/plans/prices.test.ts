import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bookletBrandLine, entitlementsFor } from './entitlements'
import { euro, LIFETIME, PAID_PLANS, PRICES, yearlyTotalOfMonthly } from './prices'
import { PLAN_VALUES, PLANS } from './types'
import type { Plan } from './types'

/** A live subscription on `plan`, with an empty repertoire so no cap and no freeze is in play. */
function subscribed(plan: Plan) {
  return entitlementsFor(
    { plan, expiresAt: null, status: 'active', pendingPlan: null, pendingCycle: null, grantedPlan: null, grantedUntil: null },
    new Date('2026-08-21T12:00:00Z'),
    { songbooks: 0, songs: 0 },
  )
}

describe('PRICES', () => {
  /*
   * The catalogue's shape, asserted rather than trusted, for the reason `GIVEABLE` in
   * `GiftForm` derives its list instead of typing it: the day a sixth plan is added,
   * this is what says whether it needs a price. A `Record<PaidPlan, …>` already makes a
   * *missing* row a type error — what it cannot notice is a new plan that nobody priced.
   */
  it('prices every plan that is sold and nothing else', () => {
    const priced = new Set<string>(PAID_PLANS)
    const notSold = new Set<string>(['free', 'lifetime'])

    for (const plan of PLAN_VALUES) {
      assert.equal(
        priced.has(plan) === notSold.has(plan),
        false,
        `${plan} is either priced and not for sale at once, or accounted for nowhere — give it a row in PRICES, or list it here as one of the plans that is never sold`,
      )
    }

    assert.equal(priced.size + notSold.size, PLAN_VALUES.length, 'every stored plan is on exactly one of the two lists')
    assert.equal(Object.keys(PRICES).length, PAID_PLANS.length)
  })

  /*
   * The claim the pricing page's default rests on: it opens on the yearly column because a
   * yearly subscriber pays less than twelve monthly ones. If a re-price ever inverted that,
   * the page would be preselecting the more expensive option while presenting it as the
   * obvious one — a copy decision quietly turned into a wrong one by a number.
   */
  it('makes a year cheaper than twelve months, on every plan', () => {
    for (const plan of PAID_PLANS) {
      const year = Number(PRICES[plan].year.amount)
      const twelveMonths = Number(PRICES[plan].month.amount) * 12
      assert.ok(year < twelveMonths, `${plan}: ${year} is not less than ${twelveMonths}`)
    }
  })

  /* Every amount is a printable decimal. A stray space or a comma would render verbatim. */
  it('writes every amount as a bare number with a dot', () => {
    for (const plan of PAID_PLANS) {
      for (const price of [PRICES[plan].year, PRICES[plan].month]) {
        assert.match(price.amount, /^\d+(\.\d{2})?$/, `${plan}: ${price.amount}`)
      }
    }
    assert.match(LIFETIME.amount, /^\d+(\.\d{2})?$/)
  })

  it('ranks the plans by price in the order PLAN_RANK ranks them by generosity', () => {
    assert.ok(Number(PRICES.standard.year.amount) < Number(PRICES.plus.year.amount))
    assert.ok(Number(PRICES.plus.year.amount) < Number(PRICES.premium.year.amount))
    assert.ok(Number(PRICES.premium.year.amount) < Number(LIFETIME.amount), 'lifetime is premium, bought once')
  })
})

describe('LIFETIME', () => {
  /*
   * Three fields left this constant when coupons landed — `originalAmount`, `closesOn` and
   * `closesOnLabel` — and the two tests that pinned them left with them, deliberately rather
   * than being adapted: there is nothing they could assert now. The struck anchor beside the
   * Lifetime price is a coupon campaign's doing (`lib/coupons/`), and whether the plan is in
   * the catalogue at all is the `lifetime.on_sale` row in `app_settings`. The facts moved, so
   * the assertions moved: `discount.test.ts` holds the first, and there is no date left to
   * parse for the second.
   */
  it('is a plain one-time price, with no promotional mechanism of its own', () => {
    assert.match(LIFETIME.amount, /^\d+(\.\d{2})?$/)
    assert.equal('originalAmount' in LIFETIME, false, 'the struck anchor comes from a campaign now')
    assert.equal('closesOn' in LIFETIME, false, 'the catalogue switch is a setting now')
  })
})

describe('yearlyTotalOfMonthly', () => {
  it('multiplies by twelve without the float dust', () => {
    // 2.49 * 12 is 29.880000000000003 in binary floating point.
    assert.equal(yearlyTotalOfMonthly('2.49'), '€29.88')
    assert.equal(yearlyTotalOfMonthly('4.49'), '€53.88')
    assert.equal(yearlyTotalOfMonthly('9.99'), '€119.88')
  })

  it('drops the cents when there are none, rather than printing .00', () => {
    assert.equal(yearlyTotalOfMonthly('3'), '€36')
    assert.equal(yearlyTotalOfMonthly('2.50'), '€30')
  })

  it('pads a single-digit remainder', () => {
    assert.equal(yearlyTotalOfMonthly('1.75'), '€21')
    assert.equal(yearlyTotalOfMonthly('0.34'), '€4.08')
  })
})

describe('euro', () => {
  it('puts the symbol before the amount, with nothing between', () => {
    assert.equal(euro('19'), '€19')
  })
})

/*
 * Not a test about prices, and here rather than in `types.test.ts` because it is the pricing
 * page it protects: what it holds is the gap between what that page *promises* about the
 * booklet and what this code can currently *tell apart*.
 *
 * The page used to print one identical booklet cell for plus and premium on the ground that
 * `custom` behaves exactly like `plain` today. It no longer does — premium's cell now says
 * «With your custom line», a deliberate roadmap claim alongside the two "Printed booklet
 * themes" rows, made on request. So the first test below is no longer protecting an identical
 * cell; it is recording that the code still cannot distinguish the two tiers, which is exactly
 * what makes that cell a promise rather than a description. It fails the day something starts
 * gating on `custom` — at which point the promise has been kept and the note beside the cell
 * should stop calling itself one.
 */
describe('the booklet the pricing page promises', () => {
  it('cannot tell plus and premium apart', () => {
    const plus = subscribed('plus')
    const premium = subscribed('premium')

    assert.equal(bookletBrandLine(plus), bookletBrandLine(premium))
    assert.equal(bookletBrandLine(premium), false, 'neither prints the «Printed with Strumfolio» line')
    assert.equal(plus.refused.booklet, premium.refused.booklet)
    assert.equal(premium.refused.booklet, null, 'both include the booklet')
  })

  it('leaves premium exactly three advantages over plus to describe', () => {
    const differing = Object.keys(PLANS.premium).filter(
      (field) => PLANS.premium[field as keyof typeof PLANS.premium] !== PLANS.plus[field as keyof typeof PLANS.plus],
    )

    assert.deepEqual(
      differing.sort(),
      ['booklet', 'devices', 'featureRequests'],
      'premium and plus differ on the device ceiling, on a booklet tier, and on how a feature request is answered — each has a row on /pricing, and a fourth field would be one the page does not fill in',
    )
  })
})
