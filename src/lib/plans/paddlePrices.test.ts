import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { paddlePriceId, parsePriceIds } from './paddlePrices'
import { LIFETIME, PAID_PLANS, PRICES } from './prices'

const IDS = JSON.stringify({
  standard: { year: 'pri_standard_year', month: 'pri_standard_month' },
  plus: { year: 'pri_plus_year', month: 'pri_plus_month' },
  premium: { year: 'pri_premium_year', month: 'pri_premium_month' },
  lifetime: 'pri_lifetime',
})

describe('parsePriceIds', () => {
  /* A checkout that cannot name its price refuses anyway; a 500 on the page somebody
     reached with a card in their hand is the worse of the two failures. */
  it('answers an empty map for anything it cannot read, rather than throwing', () => {
    for (const raw of [undefined, '', '{oops', '[]not json', 'null', '"a string"', '42']) {
      assert.deepEqual(parsePriceIds(raw), {})
    }
  })

  it('reads a well-formed map', () => {
    assert.equal(parsePriceIds(IDS).premium?.month, 'pri_premium_month')
    assert.equal(parsePriceIds(IDS).lifetime, 'pri_lifetime')
  })
})

describe('paddlePriceId', () => {
  it('names a price for every row of the listino', () => {
    for (const plan of PAID_PLANS) {
      assert.equal(paddlePriceId(plan, 'year', IDS), `pri_${plan}_year`)
      assert.equal(paddlePriceId(plan, 'month', IDS), `pri_${plan}_month`)
    }
    assert.equal(paddlePriceId('lifetime', null, IDS), 'pri_lifetime')
  })

  /*
   * Lifetime is bought once and every other plan renews, so the cycle is not optional in
   * either direction: one without a cycle and the others with one are both caller bugs, and
   * guessing which price was meant is how somebody gets charged for the wrong thing.
   */
  it('refuses a cycle for Lifetime, and a missing cycle for everything else', () => {
    assert.equal(paddlePriceId('lifetime', 'year', IDS), null)
    assert.equal(paddlePriceId('premium', null, IDS), null)
  })

  it('refuses when the environment names no id for that row', () => {
    const partial = JSON.stringify({ standard: { year: 'pri_standard_year' } })

    assert.equal(paddlePriceId('standard', 'year', partial), 'pri_standard_year')
    assert.equal(paddlePriceId('standard', 'month', partial), null)
    assert.equal(paddlePriceId('plus', 'year', partial), null)
    assert.equal(paddlePriceId('lifetime', null, partial), null)
  })

  /* An id-shaped string is the one value a checkout could pass to Paddle without noticing —
     `prices.ts` chose `''` over `'pri_TODO'` for exactly this reason. */
  it('refuses a value that is not a Paddle price id', () => {
    const junk = JSON.stringify({ premium: { year: 'TODO' }, lifetime: 'pro_not_a_price' })

    assert.equal(paddlePriceId('premium', 'year', junk), null)
    assert.equal(paddlePriceId('lifetime', null, junk), null)
  })

  /*
   * The environment is consulted *because* the committed ids are empty, never instead of
   * them. All seven are empty today, which is what makes the branch above reachable at all —
   * this asserts the premise rather than the consequence, so the day a live id is written in,
   * this test says out loud that the fallback has stopped applying to that row.
   */
  it('is only reachable while the code holds no live id', () => {
    for (const plan of PAID_PLANS) {
      assert.equal(PRICES[plan].year.paddleId, '')
      assert.equal(PRICES[plan].month.paddleId, '')
    }
    assert.equal(LIFETIME.paddleId, '')
  })
})
