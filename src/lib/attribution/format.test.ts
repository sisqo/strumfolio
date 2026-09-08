import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DIRECT_LABEL, channelLabel, conversionPercent } from './format'

describe('channelLabel', () => {
  it('names a fully tagged arrival with its campaign', () => {
    assert.equal(channelLabel({ source: 'instagram', medium: 'social', campaign: 'lancio' }), 'instagram / social · lancio')
  })

  it('drops the medium rather than inventing one', () => {
    assert.equal(channelLabel({ source: 'newsletter', medium: null, campaign: null }), 'newsletter')
  })

  it('names the word-of-mouth channel the way readTouch writes it', () => {
    assert.equal(channelLabel({ source: 'strum-together', medium: 'referral', campaign: null }), 'strum-together / referral')
  })

  it('falls back to the campaign when that is all there is', () => {
    assert.equal(channelLabel({ source: null, medium: null, campaign: 'autunno' }), 'autunno')
  })

  it('calls an arrival with no labels at all Direct, which is an answer and not a failure', () => {
    assert.equal(channelLabel({ source: null, medium: null, campaign: null }), DIRECT_LABEL)
  })

  it('treats an empty string like an absence, since a stale row may hold one', () => {
    assert.equal(channelLabel({ source: '', medium: '', campaign: '' }), DIRECT_LABEL)
  })
})

describe('conversionPercent', () => {
  it('divides accounts by every lead the repo knows about', () => {
    assert.equal(conversionPercent(3, 1), 75)
  })

  it('is 100 when every lead became an account', () => {
    assert.equal(conversionPercent(4, 0), 100)
  })

  it('is 0 when leads arrived and none converted — a measured failure', () => {
    assert.equal(conversionPercent(0, 5), 0)
  })

  it('is null when there is nothing to divide by, so the screen prints a dash and not a zero', () => {
    assert.equal(conversionPercent(0, 0), null)
  })

  it('rounds rather than trailing decimals onto a screen', () => {
    assert.equal(conversionPercent(1, 2), 33)
  })
})
