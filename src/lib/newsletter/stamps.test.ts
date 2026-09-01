import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { nextStamps } from './stamps'

const NOW = new Date('2026-08-31T12:00:00Z')

describe('nextStamps', () => {
  it('stamps subscribedAt when a never-provisioned row subscribes for the first time', () => {
    assert.deepEqual(nextStamps(null, true, NOW), { subscribedAt: NOW, unsubscribedAt: undefined })
  })

  it('stamps subscribedAt on the unsubscribed → subscribed transition', () => {
    assert.deepEqual(nextStamps(false, true, NOW), { subscribedAt: NOW, unsubscribedAt: undefined })
  })

  it('stamps unsubscribedAt on the subscribed → unsubscribed transition', () => {
    assert.deepEqual(nextStamps(true, false, NOW), { subscribedAt: undefined, unsubscribedAt: NOW })
  })

  it('stamps neither when already subscribed and staying subscribed (a frequency-only change)', () => {
    assert.deepEqual(nextStamps(true, true, NOW), { subscribedAt: undefined, unsubscribedAt: undefined })
  })

  it('stamps neither when already unsubscribed and staying unsubscribed', () => {
    assert.deepEqual(nextStamps(false, false, NOW), { subscribedAt: undefined, unsubscribedAt: undefined })
  })

  it('stamps neither for a never-provisioned row that is written as unsubscribed', () => {
    assert.deepEqual(nextStamps(null, false, NOW), { subscribedAt: undefined, unsubscribedAt: undefined })
  })
})
