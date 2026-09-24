import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deletionBlockOf, subscriptionBlocksDeletion } from './deletable'

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

describe('deletionBlockOf', () => {
  const active = { status: 'active', scheduledAction: null }
  const cancelling = { status: 'active', scheduledAction: 'cancel' }

  it('answers for every subscription, not only the latest', () => {
    assert.equal(deletionBlockOf([]), 'clear')
    assert.equal(deletionBlockOf([cancelling]), 'clear')
    assert.equal(deletionBlockOf([cancelling, active]), 'running')
  })

  it('says «stuck» where the reader cannot cancel from here, whatever else is running', () => {
    assert.equal(deletionBlockOf([{ status: 'past_due', scheduledAction: null }]), 'stuck')
    assert.equal(deletionBlockOf([active, { status: 'paused', scheduledAction: 'resume' }]), 'stuck')
    assert.equal(deletionBlockOf([{ status: 'past_due', scheduledAction: 'cancel' }]), 'clear')
  })
})
