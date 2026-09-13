import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { changeCostLine, paddleAmountToEuro, readChangeCost, scheduledChangeLine } from './changePreview'

/* The real shape, copied from a sandbox preview of Standard monthly -> Plus monthly taken on
   2026-09-13. Kept verbatim rather than minimised: the fields this reads are the fields Paddle
   actually sends, and a hand-written object is where a mapping quietly stops matching. */
const CASE_A = {
  update_summary: {
    credit: { amount: '-349', currency_code: 'EUR' },
    charge: { amount: '699', currency_code: 'EUR' },
    result: { action: 'charge', amount: '350', currency_code: 'EUR' },
  },
  immediate_transaction: {
    details: {
      totals: { subtotal: '287', tax: '63', total: '350', credit: '0', grand_total: '350' },
      line_items: [
        { price_id: 'pri_plus_month', totals: { total: '699' } },
        { price_id: 'pri_standard_month', totals: { total: '-349' } },
      ],
    },
  },
}

describe('paddleAmountToEuro', () => {
  it('reads cents as euro, sign included', () => {
    assert.equal(paddleAmountToEuro('350'), '3.50')
    assert.equal(paddleAmountToEuro('9999'), '99.99')
    assert.equal(paddleAmountToEuro('-9985'), '-99.85')
    assert.equal(paddleAmountToEuro('5'), '0.05')
    assert.equal(paddleAmountToEuro('0'), '0.00')
  })

  /* A total this cannot read must reach the screen as "no amount", never as a number nobody
     was billed — `centsToEuro` makes the same argument about the payment history. */
  it('answers null for anything that is not an integer number of cents', () => {
    for (const raw of ['', '3.50', 'lots', '1e3', '--1', ' 350']) {
      assert.equal(paddleAmountToEuro(raw), null, JSON.stringify(raw))
    }
  })
})

describe('readChangeCost', () => {
  /* CASO A of the analysis document: the upgrade costs the prorated difference and nothing
     else. €6.99 for the rest of the period, less €3.49 of Standard not consumed, is €3.50. */
  it('reads a same-cycle upgrade as the prorated difference', () => {
    assert.deepEqual(readChangeCost(CASE_A), { action: 'charge', amount: '3.50', payNow: '3.50' })
  })

  /*
   * The other half of the same question, and the reason `payNow` is a separate field: an
   * account already carrying Paddle credit owes the same €3.50 and pays none of it today.
   * Printing only one of the two numbers is how somebody comes to believe they were billed
   * twice — or that the change was free.
   */
  it('keeps the price and the charge apart when credit covers the change', () => {
    const withCredit = {
      ...CASE_A,
      immediate_transaction: { details: { totals: { total: '350', credit: '350', grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(withCredit), { action: 'charge', amount: '3.50', payNow: '0.00' })
  })

  it('reads a downgrade as money coming back, never as a charge', () => {
    const down = {
      update_summary: { result: { action: 'credit', amount: '650', currency_code: 'EUR' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(down), { action: 'credit', amount: '6.50', payNow: '0.00' })
  })

  /* Paddle reports the size in `amount` and the direction in `action`. A negative `amount`
     alongside `action: 'credit'` is the same fact said twice, and this must not read it as
     minus-six-euros-fifty of charge. */
  it('takes the direction from `action`, not from the sign', () => {
    const signed = {
      update_summary: { result: { action: 'credit', amount: '-650' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(signed), { action: 'credit', amount: '6.50', payNow: '0.00' })
  })

  it('answers `nothing` rather than a zero charge', () => {
    const free = {
      update_summary: { result: { action: 'charge', amount: '0' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(free), { action: 'nothing', amount: '0.00', payNow: '0.00' })
    assert.deepEqual(readChangeCost({ immediate_transaction: null }), {
      action: 'nothing',
      amount: '0.00',
      payNow: '0.00',
    })
  })

  /*
   * **Null is not zero**, and this is the test that keeps it that way. A preview this cannot
   * parse means the amount is unknown; printing «you pay nothing» there would be a claim about
   * somebody's card made from a parse failure.
   */
  it('answers null for a preview it cannot read, so nothing can print it as free', () => {
    for (const bad of [null, undefined, 'nope', 42, { update_summary: { result: { action: 'charge', amount: 350 } } }, { update_summary: { result: { action: 'refund', amount: '350' } } }]) {
      assert.equal(readChangeCost(bad), null, JSON.stringify(bad))
    }
  })
})

describe('changeCostLine', () => {
  it('names the amount that leaves the card', () => {
    assert.equal(
      changeCostLine({ action: 'charge', amount: '3.50', payNow: '3.50' }),
      'You pay €3.50 now — the difference for the rest of the period you have already paid for.',
    )
  })

  it('says both numbers when credit covers the change', () => {
    const line = changeCostLine({ action: 'charge', amount: '3.50', payNow: '0.00' })
    assert.match(line, /€3\.50/)
    assert.match(line, /€0\.00 leaves your card/)
  })

  it('never says «you pay» for a change that gives money back', () => {
    const line = changeCostLine({ action: 'credit', amount: '6.50', payNow: '0.00' })
    assert.match(line, /pay nothing now/)
    assert.match(line, /€6\.50/)
  })
})

/**
 * `do_not_bill` produces no `update_summary` and no immediate transaction at all, so the cost
 * reader answers `nothing` — true, and on its own the wrong thing to show somebody who has just
 * arranged to lose a plan on a particular day.
 */
describe('scheduledChangeLine', () => {
  it('says what is kept, until when, and what comes after', () => {
    const line = scheduledChangeLine('Premium', 'Standard', '13 October 2026')

    assert.match(line, /Nothing to pay now/)
    assert.match(line, /keep Premium until 13 October 2026/)
    assert.match(line, /move to Standard/)
  })

  it('is not what a change with no date says', () => {
    assert.equal(
      changeCostLine({ action: 'nothing', amount: '0.00', payNow: '0.00' }),
      'There is nothing to pay for this change.',
    )
  })
})
