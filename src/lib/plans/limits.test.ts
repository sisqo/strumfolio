import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { limitLabel } from './limits'
import { PLANS } from './types'

describe('limitLabel', () => {
  it('agrees with the number', () => {
    assert.equal(limitLabel(1, 'songbook'), '1 songbook')
    assert.equal(limitLabel(3, 'songbook'), '3 songbooks')
    assert.equal(limitLabel(30, 'song'), '30 songs')
  })

  /* Zero is plural in English, which is the case a naive `> 1` check gets wrong. */
  it('treats zero as plural', () => {
    assert.equal(limitLabel(0, 'device'), '0 devices')
  })

  it('says the word rather than a digit when there is no cap', () => {
    assert.equal(limitLabel(null, 'song'), 'unlimited songs')
    assert.equal(limitLabel(null, 'songbook'), 'unlimited songbooks')
  })

  /* The reason this module exists: the free plan's caps are what the promotional panel
   * promises, and they must come from the table rather than from prose. */
  it('describes the free plan as the panel prints it', () => {
    assert.equal(limitLabel(PLANS.free.songbooks, 'songbook'), '1 songbook')
    assert.equal(limitLabel(PLANS.free.songs, 'song'), '30 songs')
  })
})
