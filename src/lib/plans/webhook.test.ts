import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  adjustmentEffect,
  couponCampaignOf,
  downgradeStamp,
  isNewPurchase,
  isSecondSubscription,
  mayWritePlan,
  planOfPrice,
  readDowngradeStamp,
  statusOf,
  subscriptionEffect,
  transactionEffect,
  transactionPeriodEnd,
  type PaddleAdjustmentData,
  type PaddleSubscriptionData,
  type PaddleTransactionData,
} from './webhook'

const priced = (plan: string, cycle?: string) => ({
  price: { id: 'pri_x', custom_data: cycle ? { plan, cycle } : { plan } },
})

function subscription(over: Partial<PaddleSubscriptionData> = {}): PaddleSubscriptionData {
  return {
    id: 'sub_1',
    customer_id: 'ctm_1',
    status: 'active',
    current_billing_period: { starts_at: '2026-12-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' },
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

/**
 * The whole of case B2 lives in these, because there is nowhere else it can be seen: Paddle's
 * items say the cheaper plan from the moment of the change, and every claim that the customer
 * still holds the dearer one rests on this stamp being read correctly.
 */
describe('the downgrade stamp', () => {
  const stamped = (over: Partial<PaddleSubscriptionData> = {}) =>
    subscription({
      items: [priced('standard', 'month')],
      custom_data: { account_id: 7, downgrade: downgradeStamp({ plan: 'premium', cycle: 'month' }, new Date('2027-01-01T00:00:00Z')) },
      ...over,
    })

  it('writes the plan that was paid for, with the cheaper one behind it', () => {
    const { columns } = subscriptionEffect(stamped())

    assert.equal(columns?.plan, 'premium')
    assert.equal(columns?.expiresAt?.toISOString(), '2027-01-01T00:00:00.000Z')
    assert.equal(columns?.pendingPlan, 'standard')
    assert.equal(columns?.pendingCycle, 'month')
  })

  /*
   * **The case nobody will exercise by hand for a month.** Nothing clears a stamp out of
   * `custom_data`, so the renewal — a period that begins exactly where the paid one ended —
   * has to retire it by itself. Reading it as still standing here would write `premium` with
   * last month's date on every renewal for ever.
   */
  it('is spent once the period it named has begun', () => {
    const renewed = stamped({
      current_billing_period: { starts_at: '2027-01-01T00:00:00Z', ends_at: '2027-02-01T00:00:00Z' },
    })
    const { columns } = subscriptionEffect(renewed)

    assert.equal(columns?.plan, 'standard')
    assert.equal(columns?.expiresAt?.toISOString(), '2027-02-01T00:00:00.000Z')
    assert.equal(columns?.pendingPlan, null)
  })

  /* C4: a cancellation on top of a scheduled downgrade. `free` is where the subscription is
     actually going, and scheduling Standard instead would name a plan nobody will ever reach —
     but the period is still paid at the old price, so the plan held is unchanged. */
  it('lets a cancellation take the place of the downgrade it sits on', () => {
    const { columns } = subscriptionEffect(
      stamped({ scheduled_change: { action: 'cancel', effective_at: '2027-01-01T00:00:00Z' } }),
    )

    assert.equal(columns?.plan, 'premium')
    assert.equal(columns?.pendingPlan, 'free')
    assert.equal(columns?.pendingCycle, null)
  })

  it('believes the items when the stamp cannot be read', () => {
    for (const downgrade of [null, 'tomorrow', {}, { from_plan: 'premium' }, { from_plan: 'free', at: '2027-01-01T00:00:00Z' }, { from_plan: 'premium', at: 'never' }]) {
      const { columns } = subscriptionEffect(stamped({ custom_data: { account_id: 7, downgrade } }))
      assert.equal(columns?.plan, 'standard', JSON.stringify(downgrade))
      assert.equal(columns?.pendingPlan, null)
    }
  })

  /* The stamp is written by this app and read by this app, and a round trip through both is
     the only thing that holds the two spellings together — `from_plan` on the wire is Paddle's
     convention, `fromPlan` is this file's. */
  it('reads back exactly what it writes', () => {
    const at = new Date('2027-03-04T05:06:07.000Z')
    const read = readDowngradeStamp({ downgrade: downgradeStamp({ plan: 'plus', cycle: 'year' }, at) }, null)

    assert.deepEqual(read, { fromPlan: 'plus', fromCycle: 'year', at })
  })

  /* A period with no start at all cannot retire anything, so the stamp stands — and the row it
     produces resolves itself anyway, since `resolveSubscription` collapses a pending plan the
     moment its date is past. Believing a stamp too long is recoverable; dropping the tier of
     somebody who has paid for it is not. */
  it('stands when the period says nothing about when it began', () => {
    const { columns } = subscriptionEffect(stamped({ current_billing_period: { ends_at: '2027-01-01T00:00:00Z' } }))

    assert.equal(columns?.plan, 'premium')
    assert.equal(columns?.pendingPlan, 'standard')
  })

  /* This app writes the stamp from the paid period's own end, so one dated past it came from
     somewhere else — a checkout opened with a hand-written `customData` — and granting the
     higher plan until whatever date it names would sell Premium for a Standard price. */
  it('is not believed past the period Paddle says is paid for', () => {
    const at = new Date('2099-01-01T00:00:00Z')
    const custom = { downgrade: downgradeStamp({ plan: 'premium', cycle: 'year' }, at) }

    assert.equal(readDowngradeStamp(custom, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z'), null)
    assert.notEqual(readDowngradeStamp(custom, '2026-09-01T00:00:00Z', '2099-01-01T00:00:00Z'), null)
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

/**
 * The two readers that decide what a purchase does to the account's three `coupon*` columns.
 *
 * They answer different questions on purpose. `couponCampaignOf` says which campaign the
 * transaction was stamped with; `isNewPurchase` says whether this is somebody buying or a
 * subscription billing itself. Neither on its own is "a coupon was redeemed" — that is the
 * `coupon_redemptions_once` insert, in `webhookApply.ts`, and these two only choose between
 * writing the columns, clearing them, and leaving them alone.
 */
describe('couponCampaignOf', () => {
  it('reads the campaign the checkout stamped on the transaction', () => {
    assert.equal(
      couponCampaignOf({ id: 'txn_1', custom_data: { account_id: 7, coupon_campaign_id: 'cmp-abc' } }),
      'cmp-abc',
    )
  })

  it('answers null for a transaction that carries none', () => {
    assert.equal(couponCampaignOf({ id: 'txn_1' }), null)
    assert.equal(couponCampaignOf({ id: 'txn_1', custom_data: null }), null)
    assert.equal(couponCampaignOf({ id: 'txn_1', custom_data: { account_id: 7 } }), null)
  })

  /* Every campaign id this app mints is a UUID string. Anything else is not one, and a value
     that is not a campaign must not be looked up as though it might be. */
  it('reads anything that is not a non-empty string as absent', () => {
    for (const raw of ['', 0, 42, true, null, {}, ['cmp-abc']]) {
      assert.equal(couponCampaignOf({ id: 'txn_1', custom_data: { coupon_campaign_id: raw } }), null, String(raw))
    }
  })
})

describe('isNewPurchase', () => {
  it('reads a checkout as a purchase', () => {
    assert.equal(isNewPurchase({ id: 'txn_1', origin: 'web' }), true)
    assert.equal(isNewPurchase({ id: 'txn_1', origin: 'api' }), true)
  })

  /*
   * **A renewal is not a purchase, and this is the whole reason the reader exists.** The columns
   * are cleared on a purchase that carries no coupon; clearing on a renewal would take a live
   * discount away at the first period, while Paddle went on applying it for two more.
   */
  it('reads everything a subscription generates by itself as not a purchase', () => {
    for (const origin of [
      'subscription_recurring',
      'subscription_update',
      'subscription_charge',
      'subscription_payment_method_change',
    ]) {
      assert.equal(isNewPurchase({ id: 'txn_1', origin }), false, origin)
    }
  })

  /* The asymmetry this whole file follows: an unreadable payload must never take something
     away, so «no origin» leaves the columns exactly as they are. */
  it('answers false for an origin it cannot read, so nothing is cleared on a guess', () => {
    assert.equal(isNewPurchase({ id: 'txn_1' }), false)
    assert.equal(isNewPurchase({ id: 'txn_1', origin: null }), false)
    assert.equal(isNewPurchase({ id: 'txn_1', origin: '' }), false)
  })
})

/**
 * The guard that stands between a Lifetime customer and the events that would take it away.
 */
describe('mayWritePlan', () => {
  /*
   * Buying Lifetime while still paying for a subscription leaves that subscription to run to
   * the end of the period, so its cancellation lands *after* the Lifetime — carrying the
   * subscription's own plan and, at the end, `expired`. `.canceled` is the dangerous one: it
   * would leave somebody who has just made the largest payment this app takes on nothing at
   * all, with no later event to put it back.
   */
  it('lets no subscription event write over a Lifetime', () => {
    for (const eventType of [
      'subscription.updated',
      'subscription.canceled',
      'subscription.created',
      'subscription.past_due',
    ]) {
      assert.equal(mayWritePlan('lifetime', 'active', eventType), false, eventType)
    }
  })

  /* The Lifetime's own transaction has to be able to write it in the first place. */
  it('lets a transaction write one', () => {
    assert.equal(mayWritePlan('lifetime', 'active', 'transaction.completed'), true)
  })

  /* Every other plan is ordinary: a subscription event is exactly what maintains it. */
  it('leaves every other plan alone', () => {
    for (const plan of ['free', 'standard', 'plus', 'premium'] as const) {
      assert.equal(mayWritePlan(plan, 'active', 'subscription.updated'), true, plan)
    }
  })

  /*
   * A refunded or charged-back Lifetime keeps `plan = 'lifetime'` with an `expired` status.
   * Protecting that from subscription events meant a reader who then bought Standard paid every
   * month and stayed on the free plan.
   */
  it('lets a subscription write over a Lifetime that was taken back', () => {
    for (const eventType of ['subscription.created', 'subscription.updated', 'subscription.canceled']) {
      assert.equal(mayWritePlan('lifetime', 'expired', eventType), true, eventType)
    }
  })

  it('still protects a Lifetime that is merely in grace', () => {
    assert.equal(mayWritePlan('lifetime', 'grace', 'subscription.canceled'), false)
  })
})

/**
 * Money going back. The only path by which a **Lifetime** can ever be taken away — everything
 * else Paddle revokes on our behalf by cancelling the subscription, which arrives as
 * `subscription.canceled`.
 */
describe('adjustmentEffect', () => {
  const adjustment = (over: Partial<PaddleAdjustmentData> = {}): PaddleAdjustmentData => ({
    id: 'adj_1',
    action: 'refund',
    status: 'approved',
    customer_id: 'ctm_1',
    transaction_id: 'txn_1',
    items: [{ type: 'full' }],
    ...over,
  })

  it('revokes on a fully approved refund, and on a chargeback', () => {
    assert.equal(adjustmentEffect(adjustment()).statusOnly, 'expired')
    for (const action of ['chargeback', 'chargeback_warning']) {
      assert.equal(adjustmentEffect(adjustment({ action, status: 'approved' })).statusOnly, 'expired', action)
    }
  })

  /*
   * **The gate that keeps this off every subscription.** Paddle cancels a subscription itself
   * when one of its transactions is charged back or withdrawn from, and that cancellation
   * already arrives as `subscription.canceled`. Acting here as well would end a live
   * subscription over a partial refund of one renewal — a goodwill gesture read as a
   * cancellation.
   */
  it('leaves every adjustment that belongs to a subscription alone', () => {
    for (const action of ['refund', 'chargeback', 'chargeback_reverse']) {
      const effect = adjustmentEffect(adjustment({ action, subscription_id: 'sub_1' }))
      assert.equal(effect.statusOnly, null, action)
      assert.equal(effect.columns, null, action)
      /* Still recognised, so the event is recorded against the account rather than as
         `unmatched` — it is a fact about them even where it changes nothing. */
      assert.equal(effect.account.paddleSubscriptionId, 'sub_1', action)
    }
  })

  /*
   * A refund is `pending_approval` when it is created and only becomes `approved` on a later
   * `adjustment.updated`. Acting on the first would take a plan away over a request Paddle may
   * yet turn down.
   */
  it('waits for Paddle to approve a refund, and never acts on one it refused', () => {
    for (const status of ['pending_approval', 'rejected', 'reversed']) {
      assert.equal(adjustmentEffect(adjustment({ status })).statusOnly, null, status)
    }
  })

  /* `type` is per item and there is no adjustment-level «full», so full means every item says
     so. A partial refund that happens to add up to the whole price does not revoke: that is the
     safe side, and it is stated rather than left to be discovered. */
  it('revokes only when every item was refunded in full', () => {
    for (const items of [[{ type: 'partial' }], [{ type: 'full' }, { type: 'partial' }], [], null]) {
      assert.equal(adjustmentEffect(adjustment({ items })).statusOnly, null, JSON.stringify(items))
    }
    assert.equal(adjustmentEffect(adjustment({ items: [{ type: 'full' }, { type: 'full' }] })).statusOnly, 'expired')
  })

  /* Contested and won: the money is ours again, so the plan is theirs again. It works because
     revoking never cleared `plan` — one column wide in both directions. */
  it('gives the plan back when Paddle wins the dispute', () => {
    for (const action of ['chargeback_reverse', 'chargeback_warning_reverse']) {
      assert.equal(adjustmentEffect(adjustment({ action })).statusOnly, 'active', action)
    }
  })

  /* While the Lifetime was `expired` a subscription event may have written its own plan, so the
     reverse writes the Lifetime back rather than only its status. */
  it('writes the Lifetime itself back, not only the status', () => {
    assert.equal(adjustmentEffect(adjustment({ action: 'chargeback_reverse' })).restoresLifetime, true)
    assert.equal(adjustmentEffect(adjustment({ action: 'refund', status: 'approved' })).restoresLifetime, undefined)
  })

  /* Explicit no-ops rather than omissions: a credit adjusts an invoice instead of returning
     money to a card, and its reversal undoes that. Neither is a purchase being undone. */
  it('does nothing for a credit, or for an action it has never heard of', () => {
    for (const action of ['credit', 'credit_reverse', 'something_paddle_added_later', null]) {
      assert.equal(adjustmentEffect(adjustment({ action })).statusOnly, null, String(action))
    }
  })

  it('never writes the other four columns, whatever it decides', () => {
    for (const action of ['refund', 'chargeback_reverse', 'credit']) {
      assert.equal(adjustmentEffect(adjustment({ action })).columns, null, action)
    }
  })
})

describe('isSecondSubscription', () => {
  const running = { plan: 'standard' as const, planStatus: 'active', paddleSubscriptionId: 'sub_old' }

  /* Two checkouts open, both paid: the second `subscription.created` names a new id while the
     account still records a live one. */
  it('flags a new subscription beside one that is still running', () => {
    assert.equal(isSecondSubscription(running, 'subscription.created', 'sub_new'), true)
    assert.equal(isSecondSubscription({ ...running, planStatus: 'grace' }, 'subscription.created', 'sub_new'), true)
  })

  it('does not flag a subscription that replaces one already over', () => {
    assert.equal(isSecondSubscription({ ...running, planStatus: 'expired' }, 'subscription.created', 'sub_new'), false)
  })

  it('does not flag the first subscription, the same one again, or any other event', () => {
    assert.equal(isSecondSubscription({ ...running, paddleSubscriptionId: null }, 'subscription.created', 'sub_new'), false)
    assert.equal(isSecondSubscription(running, 'subscription.created', 'sub_old'), false)
    assert.equal(isSecondSubscription(running, 'subscription.updated', 'sub_new'), false)
  })

  /* A Lifetime buyer's old subscription is ended by the webhook itself; a free account has none. */
  it('ignores an account on free or on Lifetime', () => {
    assert.equal(isSecondSubscription({ ...running, plan: 'lifetime' }, 'subscription.created', 'sub_new'), false)
    assert.equal(isSecondSubscription({ ...running, plan: 'free' }, 'subscription.created', 'sub_new'), false)
  })
})
