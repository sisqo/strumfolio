import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { MockSubscriptionState } from './checkout'
import { liveSubscription } from './entitlements'
import { periodEnd } from './prices'
import { formatPlanDate, subscriptionStatusLine } from './subscriptionCopy'
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
