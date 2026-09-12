import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mostRecentCycleFor, readLine } from './history'
import type { PaymentHistoryLine } from './history'

const PAST = new Date('2026-05-03T00:00:00Z')
const NOW = new Date('2026-08-23T12:00:00Z')

/** The ledger row this file reads, in the shape `loadMyPaymentHistory` returns — newest
    first, which `mostRecentCycleFor`'s own comment relies on, same as `lastPaymentLine`'s. */
function paidRow(over: Partial<PaymentHistoryLine> = {}): PaymentHistoryLine {
  return {
    id: '1',
    occurredAt: PAST,
    action: 'purchase',
    plan: 'standard',
    cycle: 'year',
    amount: '19',
    couponCode: null,
    couponPercent: null,
    fullAmount: null,
    ...over,
  }
}

describe('the cycle a plan was last actually bought on', () => {
  it('reads it off the one purchase on record', () => {
    assert.equal(mostRecentCycleFor('standard', [paidRow()]), 'year')
  })

  it('takes the most recent of two purchases of the same plan', () => {
    assert.equal(
      mostRecentCycleFor('standard', [
        paidRow({ id: '2', occurredAt: NOW, cycle: 'month' }),
        paidRow({ id: '1', occurredAt: PAST, cycle: 'year' }),
      ]),
      'month',
    )
  })

  /* The reason the match is on the plan and not only on the action — an upgrade leaves both
     rows in the ledger, and reading the older one would answer with a cycle for a plan no
     longer held. */
  it('skips a purchase of a different plan to find an older one that matches', () => {
    assert.equal(
      mostRecentCycleFor('standard', [
        paidRow({ id: '2', plan: 'premium', cycle: 'month' }),
        paidRow({ id: '1', plan: 'standard', cycle: 'year' }),
      ]),
      'year',
    )
  })

  /* A scheduled change is not a purchase: reading it would answer with the cycle of a change
     that has not happened yet, or that undid itself before it landed. */
  it('ignores a scheduled change even when it names this plan', () => {
    assert.equal(
      mostRecentCycleFor('standard', [paidRow({ action: 'scheduled_change', cycle: 'month' })]),
      null,
    )
  })

  it('says nothing when no purchase of this plan is on record', () => {
    assert.equal(mostRecentCycleFor('plus', [paidRow()]), null)
    assert.equal(mostRecentCycleFor('standard', []), null)
  })
})

describe('readLine — reading a stored payload as a ledger line', () => {
  /* The real shape, trimmed to the fields this reads: everything lives under `data`. */
  const subscriptionCreated = JSON.stringify({
    event_id: 'evt_1',
    event_type: 'subscription.created',
    data: {
      id: 'sub_1',
      items: [{ price: { id: 'pri_1', custom_data: { plan: 'premium', cycle: 'year' } } }],
    },
  })

  const transactionCompleted = JSON.stringify({
    event_id: 'evt_2',
    event_type: 'transaction.completed',
    data: {
      id: 'txn_1',
      subscription_id: 'sub_1',
      items: [{ price: { id: 'pri_1', custom_data: { plan: 'premium', cycle: 'year' } } }],
      details: { totals: { subtotal: '8196', tax: '1803', total: '9999', currency_code: 'EUR' } },
    },
  })

  /*
   * The defect this whole branch exists for. Before it, every field was read off the top level
   * — the mock's shape — so a real event produced no plan, no amount and action `'unknown'`,
   * which the table prints as a bare «Event» and the Payments strip totals as €0.00.
   */
  it('reads the plan and cycle out of `data`, not off the top level', () => {
    const line = readLine('subscription.created', subscriptionCreated)

    assert.equal(line.action, 'started')
    assert.equal(line.plan, 'premium')
    assert.equal(line.cycle, 'year')
  })

  it('reads the charged total, tax included, off a completed transaction', () => {
    const line = readLine('transaction.completed', transactionCompleted)

    assert.equal(line.action, 'payment')
    /* `total`, not `subtotal`: these prices are tax-inclusive, so it is what was actually paid. */
    assert.equal(line.amount, '99.99')
  })

  /* A subscription event describes a state, not a charge — reading a figure off one would
     invent money that never moved, and double-count the transaction that did. */
  it('gives a subscription event no amount even when one could be computed', () => {
    assert.equal(readLine('subscription.created', subscriptionCreated).amount, null)
  })

  it('refuses a non-euro total rather than stamping a € on it', () => {
    const inDollars = transactionCompleted.replace('"EUR"', '"USD"')

    assert.equal(readLine('transaction.completed', inDollars).amount, null)
  })

  it('still yields a line for a payload it cannot read at all', () => {
    for (const payload of ['not json', 'null', '[]', '{}']) {
      const line = readLine('subscription.created', payload)
      assert.equal(line.plan, null)
      assert.equal(line.amount, null)
    }
  })

  it('keeps reading the mock shape, which is flat', () => {
    const line = readLine('mock.purchase', JSON.stringify({ plan: 'plus', cycle: 'month', amount: '6.99' }))

    assert.equal(line.action, 'purchase')
    assert.equal(line.plan, 'plus')
    assert.equal(line.amount, '6.99')
  })
})
