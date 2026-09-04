import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LIFETIME, PRICES } from '@/lib/plans/prices'

import {
  bannerCopy,
  campaignStatus,
  cookieMaxAge,
  discountCycles,
  discountEnd,
  discountedAmount,
  discountedMonths,
  durationCopy,
  firstYearCopy,
  firstYearTotal,
  liveDiscount,
} from './discount'
import type { CampaignFacts } from './discount'
import { COUPON_COOKIE_MAX_DAYS, isCodeShape, normalizeCode, readLimit, readMonths, readPercent } from './types'

/**
 * The promo column of `Strumfolio_Configurazione_Commerciale.pdf` v1.0, page 02 — the listino
 * less the 30% campaign, as that deck computed it by hand.
 *
 * A fixture rather than a set of numbers invented for this test, and that is the point: the
 * deck and this code are two independent calculations of the same seven figures, so agreement
 * is evidence and not a tautology. If a rounding change ever breaks one of these, the failure
 * names the row of the deck that stopped being true.
 */
const DECK_PROMO_30: { label: string; full: string; promo: string }[] = [
  { label: 'standard monthly', full: '3.49', promo: '2.44' },
  { label: 'plus monthly', full: '6.99', promo: '4.89' },
  { label: 'premium monthly', full: '9.99', promo: '6.99' },
  { label: 'standard yearly', full: '34.99', promo: '24.49' },
  { label: 'plus yearly', full: '69.99', promo: '48.99' },
  { label: 'premium yearly', full: '99.99', promo: '69.99' },
  { label: 'lifetime', full: '199.99', promo: '139.99' },
]

describe('discountedAmount', () => {
  it('reproduces every figure in the commercial deck’s 30% promo column', () => {
    for (const row of DECK_PROMO_30) {
      assert.equal(discountedAmount(row.full, '30'), row.promo, row.label)
    }
  })

  /*
   * The other half of the fixture's value: the deck's *listino* column has to be the listino
   * this app actually charges, or the promo figures above are right about prices nobody pays.
   * This is the assertion that fails if somebody re-prices `PRICES` without revisiting the deck.
   */
  it('is computing those from the prices this app actually charges', () => {
    assert.equal(PRICES.standard.month.amount, '3.49')
    assert.equal(PRICES.standard.year.amount, '34.99')
    assert.equal(PRICES.plus.month.amount, '6.99')
    assert.equal(PRICES.plus.year.amount, '69.99')
    assert.equal(PRICES.premium.month.amount, '9.99')
    assert.equal(PRICES.premium.year.amount, '99.99')
    assert.equal(LIFETIME.amount, '199.99')
  })

  it('rounds half a cent up', () => {
    /* 10.01 × 50% = 5.005 exactly — the one case where the direction of the rule is visible. */
    assert.equal(discountedAmount('10.01', '50'), '5.01')
  })

  it('accepts a fractional percentage', () => {
    assert.equal(discountedAmount('100', '12.5'), '87.50')
  })

  it('drops a trailing .00, the way PRICES writes its amounts', () => {
    assert.equal(discountedAmount('20', '50'), '10')
  })

  it('takes everything off at 100% and nothing at the smallest step', () => {
    assert.equal(discountedAmount('34.99', '100'), '0')
    assert.equal(discountedAmount('34.99', '0.01'), '34.99')
  })

  /* A refusal reads as "no discount", never as a free plan — the direction that matters. */
  it('leaves the amount alone when the percentage is nonsense', () => {
    for (const bad of ['', '0', '-30', '101', 'thirty', '30%']) {
      assert.equal(discountedAmount('34.99', bad), '34.99', bad)
    }
  })

  it('leaves a malformed amount alone rather than inventing a price', () => {
    for (const bad of ['', '34,99', '€34.99', 'free']) {
      assert.equal(discountedAmount(bad, '30'), bad, bad)
    }
  })
})

describe('discountCycles and discountedMonths', () => {
  /*
   * The decision this whole feature turns on: one figure in months, and the yearly cycle
   * always rounds up to whole years in the customer's favour. It is why `coupon_campaigns` has
   * no `applies_to_monthly`/`applies_to_annual` — with at least one month, both cycles are
   * covered by construction.
   */
  it('rounds the yearly cycle up to whole years', () => {
    assert.equal(discountCycles(1, 'year'), 1, 'one month buys a whole first year')
    assert.equal(discountCycles(3, 'year'), 1)
    assert.equal(discountCycles(12, 'year'), 1)
    assert.equal(discountCycles(13, 'year'), 2)
    assert.equal(discountCycles(14, 'year'), 2, 'the plan’s own worked example')
    assert.equal(discountCycles(24, 'year'), 2)
    assert.equal(discountCycles(25, 'year'), 3)
  })

  it('counts a month as a month on the monthly cycle', () => {
    for (const months of [1, 3, 14, 24]) {
      assert.equal(discountCycles(months, 'month'), months)
    }
  })

  it('covers both cycles for any campaign that names a duration at all', () => {
    for (const months of [1, 2, 3, 6, 12, 14, 36]) {
      assert.ok((discountCycles(months, 'month') ?? 0) >= 1, `${months} on monthly`)
      assert.ok((discountCycles(months, 'year') ?? 0) >= 1, `${months} on yearly`)
    }
  })

  it('carries "forever" through both', () => {
    assert.equal(discountCycles(null, 'month'), null)
    assert.equal(discountCycles(null, 'year'), null)
    assert.equal(discountedMonths(null, 'year'), null)
  })

  /*
   * The pair whose names are adjacent and whose consumers are not: cycles feed the copy,
   * months feed the date. Getting them the wrong way round is silent, so it is pinned here.
   */
  it('tells the same duration in the unit each consumer needs', () => {
    assert.equal(discountCycles(3, 'year'), 1, 'the copy says “the first year”')
    assert.equal(discountedMonths(3, 'year'), 12, 'the date is twelve months out')
    assert.equal(discountCycles(3, 'month'), 3)
    assert.equal(discountedMonths(3, 'month'), 3)
  })
})

describe('discountEnd', () => {
  it('lands a yearly campaign a whole year out even when its months say three', () => {
    const end = discountEnd(3, 'year', new Date('2026-09-04T10:00:00Z'))
    assert.equal(end?.toISOString().slice(0, 10), '2027-09-04')
  })

  it('counts calendar months, not thirty-day blocks', () => {
    const end = discountEnd(2, 'month', new Date('2026-09-04T10:00:00Z'))
    assert.equal(end?.toISOString().slice(0, 10), '2026-11-04')
  })

  /*
   * `setMonth` overflows rather than clamping: 31 January plus three months is 1 May, not 30
   * April, because 31 April does not exist. Pinned rather than corrected, because `periodEnd`
   * (`prices.ts`) computes `planExpiresAt` with exactly the same idiom — a discount that
   * clamped while the renewal it sits on overflowed would be the two dates disagreeing by a
   * day on the one account unlucky enough to buy on a 31st. The day goes to the customer.
   */
  it('overflows a short month the same way periodEnd does, not clamping', () => {
    const end = discountEnd(3, 'month', new Date('2026-01-31T10:00:00Z'))
    assert.equal(end?.toISOString().slice(0, 10), '2026-05-01')
  })

  it('never ends when the campaign never does', () => {
    assert.equal(discountEnd(null, 'month', new Date()), null)
  })
})

describe('firstYearTotal', () => {
  /*
   * The number the plan works out by hand: three months at €2.44 plus nine at €3.49. The whole
   * reason `yearlyTotalOfMonthly(discounted)` could not be reused — €29.28 would sit two
   * centimetres under a line reading «then €3.49».
   */
  it('blends the discounted months with the full ones', () => {
    assert.equal(firstYearTotal('3.49', '2.44', 3), '38.73')
    assert.equal(firstYearTotal('3.49', '3.49', 3), '41.88', 'the listino, for the comparison')
  })

  it('is still a saving, and still less than the listino', () => {
    const real = Number(firstYearTotal('3.49', '2.44', 3))
    assert.ok(real < 41.88 && real > 0)
  })

  it('caps at twelve months, so a longer campaign shows the same first year', () => {
    assert.equal(firstYearTotal('3.49', '2.44', 12), firstYearTotal('3.49', '2.44', 24))
    assert.equal(firstYearTotal('3.49', '2.44', 12), '29.28')
  })

  it('treats "forever" as a full discounted year', () => {
    assert.equal(firstYearTotal('3.49', '2.44', null), '29.28')
  })
})

/** A campaign with nothing in its way — the base every case below varies one field of. */
function campaign(overrides: Partial<CampaignFacts> = {}): CampaignFacts {
  return {
    code: 'FOUNDER30',
    discountPercent: '30',
    discountMonths: 3,
    appliesToLifetime: false,
    startsAt: new Date('2026-09-01T00:00:00Z'),
    expiresAt: new Date('2026-12-03T23:59:59Z'),
    usageLimitSubscription: 500,
    usageLimitLifetime: null,
    archivedAt: null,
    ...overrides,
  }
}

const DURING = new Date('2026-10-01T12:00:00Z')

describe('campaignStatus', () => {
  it('is active inside the window and under the ceiling', () => {
    assert.equal(campaignStatus(campaign(), DURING, 0), 'active')
    assert.equal(campaignStatus(campaign(), DURING, 499), 'active')
  })

  it('is scheduled before it starts, and active on the instant it does', () => {
    assert.equal(campaignStatus(campaign(), new Date('2026-08-31T23:59:59Z'), 0), 'scheduled')
    assert.equal(campaignStatus(campaign(), new Date('2026-09-01T00:00:00Z'), 0), 'active')
  })

  it('is expired past its expiry, and active on the instant of it', () => {
    assert.equal(campaignStatus(campaign(), new Date('2026-12-03T23:59:59Z'), 0), 'active')
    assert.equal(campaignStatus(campaign(), new Date('2026-12-04T00:00:00Z'), 0), 'expired')
  })

  it('never expires without an expiry date', () => {
    assert.equal(campaignStatus(campaign({ expiresAt: null }), new Date('2099-01-01T00:00:00Z'), 0), 'active')
  })

  it('is exhausted at the ceiling', () => {
    assert.equal(campaignStatus(campaign(), DURING, 500), 'exhausted')
    assert.equal(campaignStatus(campaign({ usageLimitSubscription: null }), DURING, 10_000), 'active')
  })

  /*
   * The Lifetime ceiling is deliberately not allowed to close a campaign on its own: 50
   * Lifetimes gone with 450 subscriptions left to sell is not an exhausted campaign, and the
   * per-plan refusal for that case belongs where the plan being bought is known.
   */
  it('does not let the Lifetime ceiling close a campaign that still has subscriptions to sell', () => {
    const facts = campaign({ appliesToLifetime: true, usageLimitLifetime: 50 })
    assert.equal(campaignStatus(facts, DURING, 50), 'active')
    assert.equal(campaignStatus(facts, DURING, 500), 'exhausted')
  })

  it('ignores a Lifetime ceiling on a campaign that does not cover the Lifetime', () => {
    const facts = campaign({ appliesToLifetime: false, usageLimitLifetime: 5, usageLimitSubscription: null })
    assert.equal(campaignStatus(facts, DURING, 100), 'active')
  })

  it('reads archived before anything the clock could say', () => {
    const archived = campaign({ archivedAt: new Date('2026-09-15T00:00:00Z') })
    assert.equal(campaignStatus(archived, DURING, 0), 'archived')
    assert.equal(campaignStatus(archived, new Date('2026-08-01T00:00:00Z'), 0), 'archived')
    assert.equal(campaignStatus(archived, new Date('2027-01-01T00:00:00Z'), 900), 'archived')
  })
})

describe('cookieMaxAge', () => {
  it('caps at the attribution window when the campaign outlasts it', () => {
    const far = new Date('2027-12-31T00:00:00Z')
    assert.equal(cookieMaxAge(far, DURING, COUPON_COOKIE_MAX_DAYS), COUPON_COOKIE_MAX_DAYS * 86_400)
  })

  /* A cookie must never outlive its offer — otherwise a reader returns, sees a struck price,
     presses «Choose», and has the code refused at the checkout. */
  it('stops at the campaign’s own end when that comes first', () => {
    const soon = new Date('2026-10-03T12:00:00Z')
    assert.equal(cookieMaxAge(soon, DURING, COUPON_COOKIE_MAX_DAYS), 2 * 86_400)
  })

  it('expires immediately for a campaign already over', () => {
    assert.equal(cookieMaxAge(new Date('2026-01-01T00:00:00Z'), DURING, COUPON_COOKIE_MAX_DAYS), 0)
  })

  it('gives an endless campaign the full window and no more', () => {
    assert.equal(cookieMaxAge(null, DURING, COUPON_COOKIE_MAX_DAYS), COUPON_COOKIE_MAX_DAYS * 86_400)
  })
})

describe('liveDiscount', () => {
  const columns = {
    couponCode: 'FOUNDER30',
    couponPercent: '30',
    discountEndsAt: new Date('2026-12-04T00:00:00Z'),
  }

  it('answers while the discount holds', () => {
    assert.deepEqual(liveDiscount(columns, DURING), {
      code: 'FOUNDER30',
      percent: '30',
      endsAt: columns.discountEndsAt,
    })
  })

  /*
   * The reason this function exists at all: nothing writes to those columns on the day the
   * discount ends, so a screen reading them raw would go on promising it. Same relationship
   * `liveSubscription` has with `plan`/`planExpiresAt`.
   */
  it('goes quiet the moment the end date passes, with nothing having been written', () => {
    assert.equal(liveDiscount(columns, new Date('2026-12-04T00:00:01Z')), null)
  })

  it('holds forever with no end date', () => {
    const endless = liveDiscount({ ...columns, discountEndsAt: null }, new Date('2099-01-01T00:00:00Z'))
    assert.equal(endless?.endsAt, null)
  })

  it('is nothing at all when the columns are empty or unreadable', () => {
    assert.equal(liveDiscount({ couponCode: null, couponPercent: null, discountEndsAt: null }, DURING), null)
    assert.equal(liveDiscount({ ...columns, couponPercent: 'thirty' }, DURING), null)
    assert.equal(liveDiscount({ ...columns, couponCode: null }, DURING), null)
  })
})

describe('durationCopy', () => {
  it('names cycles, never the campaign’s raw months', () => {
    assert.equal(durationCopy('34.99', '24.49', 3, 'year'), '€24.49 for the first year, then €34.99.')
    assert.equal(durationCopy('3.49', '2.44', 3, 'month'), '€2.44 for the first 3 months, then €3.49.')
  })

  it('pluralises a multi-year lock', () => {
    assert.equal(durationCopy('34.99', '24.49', 14, 'year'), '€24.49 for the first 2 years, then €34.99.')
  })

  it('promises no reversion when there is none', () => {
    assert.match(durationCopy('34.99', '24.49', null, 'year'), /as long as you stay subscribed/)
    assert.doesNotMatch(durationCopy('34.99', '24.49', null, 'year'), /then/)
  })

  /* The sentence has to name the price it reverts to, or the reader has no way to know it. */
  it('always names the full price a finite discount reverts to', () => {
    for (const cycle of ['month', 'year'] as const) {
      assert.match(durationCopy('34.99', '24.49', 3, cycle), /€34\.99/, cycle)
    }
  })
})

describe('firstYearCopy', () => {
  it('states the blended total against the listino', () => {
    assert.equal(firstYearCopy('3.49', '2.44', 3), '€38.73 over the first year, instead of €41.88.')
  })

  /* Nothing to add when every month of the year costs the same: the price line said it. */
  it('says nothing when the discount never lapses', () => {
    assert.equal(firstYearCopy('3.49', '2.44', null), null)
  })
})

describe('bannerCopy', () => {
  const day = (value: Date) => value.toISOString().slice(0, 10)

  it('is composed of the campaign’s own facts', () => {
    assert.equal(
      bannerCopy({ code: 'FOUNDER30', discountPercent: '30', appliesToLifetime: true, expiresAt: null }, true, day),
      'FOUNDER30 — 30% off',
    )
  })

  it('carries the expiry when there is one', () => {
    assert.equal(
      bannerCopy(
        {
          code: 'FOUNDER30',
          discountPercent: '30',
          appliesToLifetime: true,
          expiresAt: new Date('2026-12-03T00:00:00Z'),
        },
        true,
        day,
      ),
      'FOUNDER30 — 30% off, until 2026-12-03',
    )
  })

  /*
   * The only real work in that function: with the Lifetime on sale and not covered, its block
   * on `/pricing` is the one card still showing a full price while the banner talks about a
   * discount. The word is what closes that gap.
   */
  it('says "subscriptions" only when an uncovered Lifetime is actually on sale', () => {
    const facts = { code: 'ABC', discountPercent: '30', appliesToLifetime: false, expiresAt: null }
    assert.equal(bannerCopy(facts, true, day), 'ABC — 30% off subscriptions')
    assert.equal(bannerCopy(facts, false, day), 'ABC — 30% off', 'nothing to exclude, so no qualifier')
    assert.equal(bannerCopy({ ...facts, appliesToLifetime: true }, true, day), 'ABC — 30% off')
  })
})

describe('the vocabulary parsers', () => {
  it('normalizes a code the way the unique index expects it', () => {
    assert.equal(normalizeCode('  founder30 '), 'FOUNDER30')
  })

  /* No hyphens: the Paddle terna derives `-Y` and `-LT` by appending them to a public code. */
  it('refuses a shape that would collide with a derived Paddle code', () => {
    assert.equal(isCodeShape('FOUNDER30'), true)
    assert.equal(isCodeShape('founder30'), true, 'normalized before testing')
    assert.equal(isCodeShape('FOUNDER-30'), false)
    assert.equal(isCodeShape('AB'), false)
    assert.equal(isCodeShape('A'.repeat(25)), false)
    assert.equal(isCodeShape(''), false)
  })

  it('reads a percentage only inside the range a discount can mean', () => {
    assert.equal(readPercent('30'), '30')
    assert.equal(readPercent('12.5'), '12.5')
    assert.equal(readPercent('100'), '100')
    assert.equal(readPercent('0.01'), '0.01')
    assert.equal(readPercent('0'), null)
    assert.equal(readPercent('100.01'), null)
    assert.equal(readPercent('-5'), null)
    assert.equal(readPercent(30), null, 'a number is not what the column stores')
  })

  it('reads months with a floor of one, and an empty field as forever', () => {
    assert.deepEqual(readMonths('3'), { ok: true, months: 3 })
    assert.deepEqual(readMonths(''), { ok: true, months: null })
    assert.deepEqual(readMonths('forever'), { ok: true, months: null })
    assert.deepEqual(readMonths(null), { ok: true, months: null })
    assert.deepEqual(readMonths('0'), { ok: false })
    assert.deepEqual(readMonths('-1'), { ok: false })
    assert.deepEqual(readMonths('601'), { ok: false })
    assert.deepEqual(readMonths('3.5'), { ok: false })
  })

  it('reads a ceiling, with an empty field meaning no ceiling', () => {
    assert.deepEqual(readLimit('500'), { ok: true, limit: 500 })
    assert.deepEqual(readLimit(''), { ok: true, limit: null })
    assert.deepEqual(readLimit('0'), { ok: false })
    assert.deepEqual(readLimit('abc'), { ok: false })
  })
})
