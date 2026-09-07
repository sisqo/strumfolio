import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  giftCell,
  giftDetail,
  giftHeadline,
  isPaying,
  outrankingSubscription,
  planBadge,
  rowStatus,
  subscriptionHeadline,
} from './planText'
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

describe('the detail page’s summary cells and strips', () => {
  const premium = line({
    plan: 'premium',
    effectivePlan: 'premium',
    subscriptionPlan: 'premium',
    untilOn: '2027-03-14',
    planExpiresOn: '2027-03-14',
  })

  /** The mock's own account: a live Premium subscription with a dormant Plus gift under it. */
  const mockAccount = line({
    ...premium,
    grantedPlan: 'plus',
    grantedUntilOn: '2026-12-31',
    grantedBy: 'op@example.com',
    grantedOn: '2026-06-02',
    grantedNote: 'Positive review',
  })

  it('draws no gift strip for an account that was never gifted, and one for a withdrawn gift', () => {
    assert.equal(giftHeadline(line()), null)
    assert.deepEqual(giftCell(line()), { plan: null, text: 'No gift' })

    const withdrawn = line({ grantedBy: 'op@example.com', grantedOn: '2026-04-01' })
    assert.equal(giftHeadline(withdrawn), 'No gift: the last one was removed')
    assert.deepEqual(giftCell(withdrawn), { plan: null, text: 'Gift removed' })
    // The whole reason a withdrawn gift still gets a strip: this audit has nowhere else to go.
    assert.equal(giftDetail(withdrawn), 'Removed by op@example.com on 2026-04-01.')
  })

  it('never calls a gift whose date has passed "no end", in either the cell or the heading', () => {
    const ended = line({ grantedPlan: 'plus', grantedUntilOn: '2026-05-05', grantEnded: true })
    assert.equal(giftHeadline(ended), 'Gift of Plus, ended 2026-05-05')
    assert.deepEqual(giftCell(ended), { plan: 'plus', text: 'ended 2026-05-05' })

    const endless = line({ grantedPlan: 'lifetime', effectivePlan: 'lifetime', source: 'grant' })
    assert.equal(giftHeadline(endless), 'Gift of Lifetime, with no end date')
    assert.deepEqual(giftCell(endless), { plan: 'lifetime', text: 'No end date' })
  })

  it('folds the reason into the audit as one decision, and says what keeps the gift dormant', () => {
    assert.equal(giftHeadline(mockAccount), 'Gift of Plus, active until 2026-12-31')
    assert.equal(
      giftDetail(mockAccount),
      'Given by op@example.com on 2026-06-02 — “Positive review”. Premium outranks it, so it only takes over once the subscription lapses.',
    )
  })

  it('reports a tie as outranked — a gift of the plan they already pay for changes nothing', () => {
    assert.equal(outrankingSubscription(line({ ...premium, grantedPlan: 'premium' })), 'premium')
    assert.equal(outrankingSubscription(line({ ...premium, grantedPlan: 'lifetime' })), null)
    // Nothing left to outrank it: the clause would promise a takeover that already happened.
    assert.equal(outrankingSubscription(line({ grantedPlan: 'plus', subscriptionPlan: null })), null)
  })

  it('never promises an ended gift will take over once the subscription lapses', () => {
    const dead = line({ ...mockAccount, grantEnded: true })
    assert.equal(outrankingSubscription(dead), null)
    assert.equal(giftDetail(dead), 'Given by op@example.com on 2026-06-02 — “Positive review”.')
  })

  it('says nothing at all when a gift records neither who, why, nor anything to outrank it', () => {
    assert.equal(giftDetail(line({ grantedPlan: 'plus', effectivePlan: 'plus', source: 'grant', subscriptionPlan: null })), null)
  })

  it('names the subscription alone, gift ignored, and never dates a retrying card', () => {
    assert.equal(subscriptionHeadline(mockAccount), 'Subscription: Premium until 2027-03-14')

    const downgrading = line({ ...premium, plan: 'standard', pendingPlan: 'free', planExpiresOn: '2026-11-02' })
    assert.equal(subscriptionHeadline(downgrading), 'Subscription: Standard until 2026-11-02, then Free')

    const retrying = line({ ...premium, status: 'grace' })
    assert.equal(subscriptionHeadline(retrying), 'Subscription: Premium, payment retrying')

    const expired = line({ plan: 'premium', status: 'expired', subscriptionPlan: null, planExpiresOn: '2026-08-01' })
    assert.equal(subscriptionHeadline(expired), 'Subscription: Premium, expired')

    const lifetime = line({ plan: 'lifetime', effectivePlan: 'lifetime', subscriptionPlan: 'lifetime' })
    assert.equal(subscriptionHeadline(lifetime), 'Subscription: Lifetime, no end')

    assert.equal(subscriptionHeadline(line()), 'No subscription')
  })
})
