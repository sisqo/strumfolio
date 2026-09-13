import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { planOfPrice, statusOf, subscriptionEffect, transactionEffect, transactionPeriodEnd, type PaddleSubscriptionData, type PaddleTransactionData } from './webhook'

const priced = (plan: string, cycle?: string) => ({
  price: { id: 'pri_x', custom_data: cycle ? { plan, cycle } : { plan } },
})

function subscription(over: Partial<PaddleSubscriptionData> = {}): PaddleSubscriptionData {
  return {
    id: 'sub_1',
    customer_id: 'ctm_1',
    status: 'active',
    current_billing_period: { ends_at: '2027-01-01T00:00:00Z' },
    items: [priced('plus', 'year')],
    ...over,
  }
}

function transaction(over: Partial<PaddleTransactionData> = {}): PaddleTransactionData {
  return { id: 'txn_1', customer_id: 'ctm_1', items: [priced('lifetime')], ...over }
}

describe('planOfPrice', () => {
  it('reads the plan and cycle stamped on the price', () => {
    assert.deepEqual(planOfPrice({ id: 'pri_x', custom_data: { plan: 'premium', cycle: 'month' } }), {
      plan: 'premium',
      cycle: 'month',
    })
  })

  it('reads a one-time price as a plan with no cycle', () => {
    assert.deepEqual(planOfPrice({ id: 'pri_x', custom_data: { plan: 'lifetime' } }), {
      plan: 'lifetime',
      cycle: null,
    })
  })

  /*
   * The revocation trap. `readPlan` answers `'free'` for anything it cannot read, and a
   * webhook writing `'free'` because a price arrived without a stamp would take a paying
   * customer's plan away on the strength of a missing field.
   */
  it('answers null — never free — for a price it cannot read', () => {
    for (const price of [
      { id: 'pri_x', custom_data: null },
      { id: 'pri_x', custom_data: { plan: 'enterprise' } },
      { id: 'pri_x', custom_data: { plan: 42 } },
      undefined,
    ]) {
      assert.equal(planOfPrice(price as never), null)
    }
  })
})

describe('statusOf', () => {
  it('keeps the entitlements of a failing card and of a pause', () => {
    assert.equal(statusOf('past_due'), 'grace')
    assert.equal(statusOf('paused'), 'grace')
  })

  it('ends a canceled subscription', () => {
    assert.equal(statusOf('canceled'), 'expired')
  })

  /* An unreadable status must never revoke — `readPlanStatus`'s own asymmetry. */
  it('reads an unknown status as active rather than revoking', () => {
    assert.equal(statusOf('active'), 'active')
    assert.equal(statusOf('trialing'), 'active')
    assert.equal(statusOf('something_paddle_added_later'), 'active')
  })
})

describe('subscriptionEffect', () => {
  it('writes the end of the period being paid for as the expiry', () => {
    const { columns } = subscriptionEffect(subscription())

    assert.equal(columns?.plan, 'plus')
    assert.equal(columns?.status, 'active')
    assert.equal(columns?.expiresAt?.toISOString(), '2027-01-01T00:00:00.000Z')
    assert.equal(columns?.pendingPlan, null)
  })

  it('reads a scheduled cancellation as a pending downgrade to free', () => {
    const { columns } = subscriptionEffect(
      subscription({ scheduled_change: { action: 'cancel', effective_at: '2027-01-01T00:00:00Z' } }),
    )

    assert.equal(columns?.pendingPlan, 'free')
  })

  /* A pause is not a change of plan; the status arriving as `paused` already answers it. */
  it('ignores a scheduled pause', () => {
    const { columns } = subscriptionEffect(subscription({ scheduled_change: { action: 'pause' } }))

    assert.equal(columns?.pendingPlan, null)
  })

  it('changes nothing when no item names a plan, but still identifies the account', () => {
    const effect = subscriptionEffect(subscription({ items: [{ price: { id: 'pri_x', custom_data: null } }] }))

    assert.equal(effect.columns, null)
    assert.equal(effect.account.paddleSubscriptionId, 'sub_1')
    assert.equal(effect.account.paddleCustomerId, 'ctm_1')
  })

  it('takes the account id out of custom_data, as a string or a number', () => {
    assert.equal(subscriptionEffect(subscription({ custom_data: { account_id: '17' } })).account.accountId, 17)
    assert.equal(subscriptionEffect(subscription({ custom_data: { account_id: 17 } })).account.accountId, 17)
  })

  it('refuses an account id that is not a positive integer', () => {
    for (const account_id of ['abc', 0, -3, 1.5, null]) {
      assert.equal(subscriptionEffect(subscription({ custom_data: { account_id } })).account.accountId, null)
    }
  })
})

describe('transactionEffect', () => {
  it('grants the Lifetime, with no expiry at all', () => {
    const { columns } = transactionEffect(transaction())

    assert.equal(columns?.plan, 'lifetime')
    assert.equal(columns?.status, 'active')
    assert.equal(columns?.expiresAt, null)
  })

  /*
   * Every renewal completes a transaction too. Acting on both it and the subscription event
   * would have two writes racing over one row, and the loser could be the newer expiry.
   */
  it('ignores a transaction that belongs to a subscription', () => {
    const effect = transactionEffect(transaction({ subscription_id: 'sub_1', items: [priced('plus', 'year')] }))

    assert.equal(effect.columns, null)
    assert.equal(effect.account.paddleSubscriptionId, 'sub_1')
  })

  it('ignores a one-off that is not the Lifetime', () => {
    assert.equal(transactionEffect(transaction({ items: [priced('premium', 'year')] })).columns, null)
  })
})

describe('transactionPeriodEnd', () => {
  it('reads the period this payment bought', () => {
    const end = transactionPeriodEnd({
      id: 'txn_1',
      billing_period: { ends_at: '2027-09-12T19:15:54.036229Z' },
    })
    assert.equal(end?.toISOString(), '2027-09-12T19:15:54.036Z')
  })

  /*
   * A one-time purchase buys no period, and an unreadable one is not a date. Both answer null,
   * which the confirmation email has a dateless sentence for — «until Invalid Date» being the
   * outcome this guards against.
   */
  it('answers null for a purchase with no period, and for anything unreadable', () => {
    assert.equal(transactionPeriodEnd({ id: 'txn_1' }), null)
    assert.equal(transactionPeriodEnd({ id: 'txn_1', billing_period: null }), null)
    assert.equal(transactionPeriodEnd({ id: 'txn_1', billing_period: { ends_at: null } }), null)
    assert.equal(transactionPeriodEnd({ id: 'txn_1', billing_period: { ends_at: 'soon' } }), null)
  })
})
