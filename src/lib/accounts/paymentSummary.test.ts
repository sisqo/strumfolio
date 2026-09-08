import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { paymentSummary } from './paymentSummary'
import type { PaymentHistoryLine } from '@/lib/plans/history'

/** One ledger row — a monthly Standard purchase, the cheapest thing this app sells. */
function row(overrides: Partial<PaymentHistoryLine> = {}): PaymentHistoryLine {
  return {
    id: 'e1',
    occurredAt: new Date('2026-08-23T09:14:00.000Z'),
    action: 'purchase',
    plan: 'standard',
    cycle: 'month',
    amount: '4.90',
    couponCode: null,
    couponPercent: null,
    fullAmount: null,
    ...overrides,
  }
}

describe('the Payments strip', () => {
  it('answers zero-but-real for an account that never bought anything', () => {
    assert.deepEqual(paymentSummary([]), { collected: '0.00', events: 0, lastPaymentOn: null })
  })

  it('adds in cents, so twelve monthly payments do not drift into a fraction of a cent', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => row({ id: `e${index}` }))
    assert.equal(paymentSummary(twelve).collected, '58.80')
  })

  it('counts every event but collects only what was actually charged', () => {
    /*
     * The three actions that log a catalogue price for money that never moved — the whole
     * reason this function exists rather than a `reduce` over `amount` in the page.
     */
    const history = [
      row({ id: 'e1', amount: '34.30' }),
      row({ id: 'e2', action: 'kept_current', amount: '99.99' }),
      row({ id: 'e3', action: 'force_expired', amount: '99.99' }),
      row({ id: 'e4', action: 'cancelled_now', amount: '99.99' }),
      row({ id: 'e5', action: 'scheduled_change', amount: null }),
    ]
    assert.deepEqual(paymentSummary(history), { collected: '34.30', events: 5, lastPaymentOn: '2026-08-23' })
  })

  it('dates the last payment from the newest purchase, not the newest event', () => {
    const history = [
      row({ id: 'e1', action: 'scheduled_change', amount: null, occurredAt: new Date('2026-09-01T10:00:00.000Z') }),
      row({ id: 'e2', occurredAt: new Date('2026-06-04T10:00:00.000Z') }),
      row({ id: 'e3', occurredAt: new Date('2025-11-04T10:00:00.000Z') }),
    ]
    assert.deepEqual(paymentSummary(history), { collected: '9.80', events: 3, lastPaymentOn: '2026-06-04' })
  })

  it('lets one unparseable amount cost its own row and nothing else', () => {
    // A row this app did not write, which `PaymentHistoryLine` says must still show up.
    const history = [row({ id: 'e1', action: 'unknown', amount: 'gratis' }), row({ id: 'e2', amount: '199.99' })]
    assert.deepEqual(paymentSummary(history), { collected: '199.99', events: 2, lastPaymentOn: '2026-08-23' })
  })

  it('carries the whole euros over correctly past a hundred', () => {
    const history = [row({ id: 'e1', amount: '99.99' }), row({ id: 'e2', amount: '0.02' })]
    assert.equal(paymentSummary(history).collected, '100.01')
  })

  it('refuses a negative amount rather than mis-signing it into the total', () => {
    // A row this app did not write (`toCents`'s own comment): a real refund event would
    // carry a minus sign `toCents`'s regex was never built to admit, and a stray amount
    // this app itself never charged must cost that row's contribution, not the sign of
    // some other purchase's cents.
    const history = [row({ id: 'e1', action: 'unknown', amount: '-4.90' }), row({ id: 'e2', amount: '10.00' })]
    assert.deepEqual(paymentSummary(history), { collected: '10.00', events: 2, lastPaymentOn: '2026-08-23' })
  })
})
