import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isPaying, planBadge, rowStatus } from './planText'
import type { AccountPlanLine } from './read'

/** A deliberately chosen Free account — the baseline every other row is one or two fields away from. */
function line(overrides: Partial<AccountPlanLine> = {}): AccountPlanLine {
  return {
    plan: 'free',
    status: 'active',
    planExpiresOn: null,
    pendingPlan: null,
    grantedPlan: null,
    grantedUntilOn: null,
    grantedBy: null,
    grantedOn: null,
    grantedNote: null,
    grantEnded: false,
    effectivePlan: 'free',
    source: 'subscription',
    subscriptionPlan: 'free',
    untilOn: null,
    planChosen: true,
    ...overrides,
  }
}

describe('the Status column', () => {
  it('prints a dated subscription as «Until», with the scheduled change after it', () => {
    const premium = line({ plan: 'premium', effectivePlan: 'premium', subscriptionPlan: 'premium', untilOn: '2027-03-14', planExpiresOn: '2027-03-14' })
    assert.deepEqual(rowStatus(premium, 42), { text: 'Until 2027-03-14', tone: 'normal' })

    const downgrading = line({ ...premium, plan: 'standard', effectivePlan: 'standard', subscriptionPlan: 'standard', pendingPlan: 'free', untilOn: '2026-11-02' })
    assert.deepEqual(rowStatus(downgrading, 7), { text: 'Until 2026-11-02, then Free', tone: 'normal' })
  })

  it('says «No end» for a lifetime, and for a gift without a date', () => {
    const lifetime = line({ plan: 'lifetime', effectivePlan: 'lifetime', subscriptionPlan: 'lifetime' })
    assert.deepEqual(rowStatus(lifetime, 118), { text: 'No end', tone: 'normal' })

    const gifted = line({ grantedPlan: 'lifetime', grantedBy: 'op@example.com', grantedOn: '2026-01-01', effectivePlan: 'lifetime', source: 'grant' })
    assert.deepEqual(rowStatus(gifted, 3), { text: 'No end', tone: 'normal' })
  })

  it('never spells out "gift": the Gift column does, so a dated gift reads like a dated subscription', () => {
    const gifted = line({ grantedPlan: 'plus', grantedUntilOn: '2026-12-31', grantedBy: 'op@example.com', grantedOn: '2026-01-01', effectivePlan: 'plus', source: 'grant', untilOn: '2026-12-31' })
    assert.deepEqual(rowStatus(gifted, 23), { text: 'Until 2026-12-31', tone: 'normal' })
  })

  it('is red only for the two states an operator has to act on', () => {
    const residual = line({ plan: 'premium', effectivePlan: 'premium', subscriptionPlan: 'premium', planChosen: false })
    assert.deepEqual(rowStatus(residual, 3), { text: 'Awaiting choice', tone: 'alert' })

    const retrying = line({ plan: 'standard', status: 'grace', effectivePlan: 'standard', subscriptionPlan: 'standard', untilOn: '2026-06-30', planExpiresOn: '2026-06-30' })
    assert.deepEqual(rowStatus(retrying, 61), { text: 'Payment retrying', tone: 'alert' })
  })

  it('tells a registration that went nowhere from a reader who left /pricing undecided', () => {
    const none = line({ planChosen: false, subscriptionPlan: null, source: 'none' })
    assert.deepEqual(rowStatus(none, 0), { text: 'Never signed in', tone: 'faint' })
    assert.deepEqual(rowStatus(none, 2), { text: 'Awaiting choice', tone: 'normal' })
  })

  it('keeps the three rows that look like a chosen Free apart from it', () => {
    assert.deepEqual(rowStatus(line(), 5), { text: '', tone: 'normal' })

    const withdrawn = line({ grantedBy: 'op@example.com', grantedOn: '2026-05-05' })
    assert.deepEqual(rowStatus(withdrawn, 5), { text: 'Gift withdrawn', tone: 'normal' })

    const ended = line({ grantedPlan: 'premium', grantedUntilOn: '2026-05-05', grantedBy: 'op@example.com', grantedOn: '2026-01-01', grantEnded: true })
    assert.deepEqual(rowStatus(ended, 5), { text: 'Gift ended 2026-05-05', tone: 'normal' })

    const expired = line({ plan: 'premium', status: 'expired', planExpiresOn: '2026-08-01', subscriptionPlan: null })
    assert.deepEqual(rowStatus(expired, 5), { text: 'Premium expired 2026-08-01', tone: 'normal' })
  })
})

describe('the badge and the Paying tab', () => {
  it('names "No plan" in the neutral colour, not the danger one', () => {
    assert.deepEqual(planBadge(line({ planChosen: false, subscriptionPlan: null, source: 'none' })), { label: 'No plan', className: 'plan-badge-none' })
    assert.deepEqual(planBadge(line()), { label: 'Free', className: 'plan-badge-free' })
  })

  it('counts a live paid subscription, retrying or not — never a gift, never Free', () => {
    assert.equal(isPaying(line({ plan: 'standard', effectivePlan: 'standard', subscriptionPlan: 'standard' })), true)
    assert.equal(isPaying(line({ plan: 'standard', status: 'grace', effectivePlan: 'standard', subscriptionPlan: 'standard' })), true)
    assert.equal(isPaying(line({ grantedPlan: 'premium', grantedBy: 'op@example.com', grantedOn: '2026-01-01', effectivePlan: 'premium', source: 'grant' })), false)
    assert.equal(isPaying(line()), false)
    assert.equal(isPaying(line({ plan: 'premium', status: 'expired', subscriptionPlan: null })), false)
  })
})
