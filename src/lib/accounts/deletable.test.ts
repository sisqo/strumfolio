import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { subscriptionBlocksDeletion } from './deletable'

describe('subscriptionBlocksDeletion', () => {
  it('lets an account with no subscription, or a finished one, go', () => {
    assert.equal(subscriptionBlocksDeletion(null), false)
    assert.equal(subscriptionBlocksDeletion({ status: 'canceled', scheduledAction: null }), false)
  })

  it('lets one already cancelling at the end of its period go', () => {
    assert.equal(subscriptionBlocksDeletion({ status: 'active', scheduledAction: 'cancel' }), false)
  })

  it('holds one that will bill again, a card in trouble or a pause included', () => {
    for (const status of ['active', 'trialing', 'past_due', 'paused']) {
      assert.equal(subscriptionBlocksDeletion({ status, scheduledAction: null }), true, status)
    }
    assert.equal(subscriptionBlocksDeletion({ status: 'paused', scheduledAction: 'resume' }), true)
    assert.equal(subscriptionBlocksDeletion({ status: 'active', scheduledAction: 'pause' }), true)
  })
})
