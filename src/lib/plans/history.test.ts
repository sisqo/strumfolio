import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mostRecentCycleFor } from './history'
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
