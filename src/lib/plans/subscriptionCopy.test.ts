import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MockSubscriptionState } from './checkout'
import { liveSubscription, resolveSubscription } from './entitlements'
import { periodEnd } from './prices'
import type { PaymentHistoryLine } from './history'
import { formatPlanDate, lastPaymentLine, subscriptionStatusLine } from './subscriptionCopy'
import type { Plan, PlanStatus } from './types'

const NOW = new Date('2026-08-23T12:00:00Z')
const PAST = new Date('2026-05-03T00:00:00Z')
const FUTURE = new Date('2027-05-03T00:00:00Z')

function state(over: Partial<MockSubscriptionState> = {}): MockSubscriptionState {
  return { plan: 'standard', status: 'active', expiresAt: FUTURE, pendingPlan: null, ...over }
}

/**
 * The `live` a screen is actually handed — `liveSubscription`'s own answer over the same row,
 * rather than a hand-picked argument. That is the whole point of these tests: the sentence and
 * the gate have to be reading one rule, so the fixture derives the parameter instead of
 * asserting a wording against a value nothing in the app would ever pass.
 */
function liveFor(current: MockSubscriptionState): Plan | null {
  return liveSubscription({ ...current, pendingCycle: null }, NOW)
}

function line(current: MockSubscriptionState): string {
  return subscriptionStatusLine(current, liveFor(current))
}

describe('the subscription sentence', () => {
  it('names a running plan with the day it renews', () => {
    assert.equal(line(state()), `Standard, active until ${formatPlanDate(FUTURE)}.`)
  })

  it('names a scheduled change ahead of its date', () => {
    assert.equal(line(state({ plan: 'premium', pendingPlan: 'standard' })), `Premium until ${formatPlanDate(FUTURE)}, then Standard.`)
  })

  /*
   * The one this file was written for. Nothing in this repository renews anything, so every
   * plan bought through the mock ends up here: `planStatus` still says `active` — no webhook
   * ever wrote otherwise — while `planExpiresAt` has gone by and the gates have already dropped
   * the account to free. The sentence used to read "Standard, active until 3 May 2026", a date
   * months in the past presented as the future, on the screen a customer opens to find out
   * where they stand.
   */
  it('does not call a plan active past its own date', () => {
    const lapsed = state({ expiresAt: PAST })

    assert.equal(liveFor(lapsed), null, 'the gate already treats this account as having nothing')
    assert.equal(line(lapsed), `Standard, ended ${formatPlanDate(PAST)}.`)
  })

  it('keeps a retrying card in force rather than mourning it', () => {
    const retrying = state({ status: 'grace', expiresAt: PAST })

    assert.equal(liveFor(retrying), 'standard', 'grace ignores dates — a failing card is not a lapsed customer')
    assert.equal(line(retrying), 'Standard, payment retrying.')
  })

  it('reports a stored expiry as expired, whichever plan it was', () => {
    for (const plan of ['standard', 'lifetime'] as const) {
      const stored = state({ plan, status: 'expired' as PlanStatus, expiresAt: null })
      assert.equal(line(stored), `${plan === 'lifetime' ? 'Lifetime' : 'Standard'}, expired.`)
    }
  })

  it('says nothing about renewal for the two plans that have no end', () => {
    assert.equal(line(state({ plan: 'free', expiresAt: null })), 'Free — nothing bought yet.')
    assert.equal(line(state({ plan: 'lifetime', expiresAt: null })), 'Lifetime — bought once, nothing to renew or cancel.')
  })

  /*
   * What a fired scheduled change leaves behind: the new plan, stored with no expiry because
   * nothing here models renewals. It is live, so it must not read as ended.
   */
  it('reads a dateless live plan as having no end', () => {
    const settled = state({ plan: 'plus', expiresAt: null })

    assert.equal(liveFor(settled), 'plus')
    assert.equal(line(settled), 'Plus, no end.')
  })
})

/**
 * The row both sides of the checkout have to read the same way. `/checkout/[plan]` decides
 * whether to promise a purchase or a scheduled change from the **resolved** row it is handed;
 * `mockPurchase` and `mockCancel` decide the same thing server-side, and used to ask the raw
 * column, which on this row still holds the old date the resolved view has already collapsed
 * away. The screen promised "Complete purchase" and got a scheduled change back.
 */
describe('what a fired scheduled change leaves behind', () => {
  const fired = {
    plan: 'premium' as Plan,
    status: 'active' as PlanStatus,
    expiresAt: PAST,
    pendingPlan: 'plus' as Plan,
    pendingCycle: null,
  }

  it('resolves to the new plan with no date left to schedule against', () => {
    const resolved = resolveSubscription(fired, NOW)

    assert.equal(resolved.plan, 'plus')
    assert.equal(resolved.expiresAt, null, 'both sides key on this — a raw read still sees the old, past date')
    assert.equal(liveSubscription(fired, NOW), 'plus')
  })

  it('keeps a retrying card on its date, so a downgrade there is still scheduled', () => {
    const retrying = { ...fired, status: 'grace' as PlanStatus }

    assert.equal(resolveSubscription(retrying, NOW).expiresAt, PAST, 'grace never fires a pending change')
  })
})

describe('a billing period', () => {
  it('counts calendar months and calendar years, not fixed day counts', () => {
    assert.equal(periodEnd('month', new Date('2026-01-31T00:00:00Z')).toISOString().slice(0, 10), '2026-03-03')
    assert.equal(periodEnd('year', new Date('2026-08-23T00:00:00Z')).toISOString().slice(0, 10), '2027-08-23')
  })

  /* The comparison `/checkout/[plan]` warns on: a monthly re-buy ten months into a yearly plan
     moves the renewal *earlier*, giving up the difference. */
  it('lands before a yearly period bought earlier', () => {
    assert.ok(periodEnd('month', NOW).getTime() < FUTURE.getTime())
  })
})

/**
 * The ledger row `lastPaymentLine` reads, in the shape `loadMyPaymentHistory` returns —
 * newest first, which is the ordering that function's own comment relies on.
 */
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

describe('what was last paid', () => {
  it('names the amount, the day and the period', () => {
    assert.equal(
      lastPaymentLine(state(), [paidRow()]),
      `€19 paid on ${formatPlanDate(PAST)}, for a year.`,
    )
  })

  it('says a month when the purchase was monthly', () => {
    assert.equal(
      lastPaymentLine(state(), [paidRow({ cycle: 'month', amount: '2.49' })]),
      `€2.49 paid on ${formatPlanDate(PAST)}, for a month.`,
    )
  })

  /* No cycle is `lifetime`'s own shape, not a gap — so the sentence must not invent a period. */
  it('says once for a lifetime purchase', () => {
    assert.equal(
      lastPaymentLine(state({ plan: 'lifetime', expiresAt: null }), [
        paidRow({ plan: 'lifetime', cycle: null, amount: '149' }),
      ]),
      `€149 paid once, on ${formatPlanDate(PAST)}.`,
    )
  })

  /*
   * The reason the match is on the plan and not only on the action. An upgrade leaves both
   * rows in the ledger, and quoting the older one would print the cheaper plan's price beside
   * the name of the plan actually running.
   */
  it('quotes the purchase of the plan running now, not an older one', () => {
    assert.equal(
      lastPaymentLine(state({ plan: 'premium' }), [
        paidRow({ id: '2', plan: 'premium', amount: '99' }),
        paidRow({ id: '1', plan: 'standard', amount: '19' }),
      ]),
      `€99 paid on ${formatPlanDate(PAST)}, for a year.`,
    )
  })

  it('takes the most recent of two purchases of the same plan', () => {
    assert.equal(
      lastPaymentLine(state(), [
        paidRow({ id: '2', occurredAt: NOW, cycle: 'month', amount: '2.49' }),
        paidRow({ id: '1', occurredAt: PAST }),
      ]),
      `€2.49 paid on ${formatPlanDate(NOW)}, for a month.`,
    )
  })

  /* Silence, not a hedge — see the function's own comment on why `null` is the answer to all
     three of these rather than a sentence with a hole in it. */
  it('says nothing for a free account', () => {
    assert.equal(lastPaymentLine(state({ plan: 'free' }), [paidRow()]), null)
  })

  it('says nothing when no purchase of this plan is on record', () => {
    assert.equal(lastPaymentLine(state({ plan: 'plus' }), [paidRow()]), null)
    assert.equal(lastPaymentLine(state(), []), null)
  })

  it('says nothing when the row carries no amount', () => {
    assert.equal(lastPaymentLine(state(), [paidRow({ amount: null })]), null)
  })

  /* A scheduled change is not a payment: it is logged with a plan and a cycle and no money,
     and reading it as one would date the purchase to the day the downgrade was booked. */
  it('ignores a scheduled change even when it names this plan', () => {
    assert.equal(
      lastPaymentLine(state(), [paidRow({ action: 'scheduled_change', amount: null })]),
      null,
    )
  })
})
