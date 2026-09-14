import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PaymentHistoryLine } from './history'
import { isPaidLine, lastPaidFor } from './paidLines'

function paidRow(over: Partial<PaymentHistoryLine> = {}): PaymentHistoryLine {
  return {
    id: 'evt_1',
    occurredAt: new Date('2026-09-14T09:14:00Z'),
    action: 'payment',
    plan: 'standard',
    cycle: 'year',
    amount: '34.99',
    fullAmount: null,
    couponCode: null,
    couponPercent: null,
    moneyBack: false,
    ...over,
  }
}

/**
 * The bug this predicate ended, kept as a test so the next event name is added once.
 *
 * Between the mock's demolition on 2026-09-13 and this, three readers matched `'purchase'`
 * alone — the word the mock wrote — while every real Paddle purchase lands as `'payment'`. So
 * `/billing` printed neither what had been paid nor what a discount came off, and nothing
 * failed anywhere: `find` answered `undefined`, which all three treat as «nothing to quote».
 */
describe('which ledger lines are money', () => {
  it('counts both the mock word and the one Paddle writes', () => {
    assert.equal(isPaidLine(paidRow({ action: 'purchase' })), true)
    assert.equal(isPaidLine(paidRow({ action: 'payment' })), true)
  })

  it('counts nothing else, in either direction', () => {
    for (const action of ['started', 'activated', 'changed', 'cancelled', 'refunded', 'chargeback'] as const) {
      assert.equal(isPaidLine(paidRow({ action })), false, action)
    }
  })

  it('finds a real Paddle purchase, which is what used to be missed', () => {
    const paid = lastPaidFor('standard', [paidRow({ action: 'payment', amount: '3.49', cycle: 'month' })])

    assert.equal(paid?.amount, '3.49')
    assert.equal(paid?.cycle, 'month')
  })

  /* Newest-first, and matched on the plan too: an upgrade's own row has to win over the cheaper
     plan underneath it, or a screen names the price of a plan no longer held. */
  it('takes the newest row for that plan and no other plan', () => {
    const history = [
      paidRow({ action: 'payment', plan: 'premium', amount: '99.99' }),
      paidRow({ action: 'payment', plan: 'standard', amount: '34.99' }),
    ]

    assert.equal(lastPaidFor('standard', history)?.amount, '34.99')
    assert.equal(lastPaidFor('plus', history), null)
  })
})
