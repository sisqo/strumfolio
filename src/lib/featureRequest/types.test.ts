import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DETAIL_MAX,
  FEATURE_REQUEST_MESSAGE,
  SUMMARY_MAX,
  SUMMARY_MIN,
  featureRequestProblem,
} from './types'

describe('featureRequestProblem', () => {
  it('accepts a request with something in it', () => {
    assert.equal(featureRequestProblem('Setlists', ''), null)
    assert.equal(featureRequestProblem('A metronome', 'Tap tempo would be enough.'), null)
  })

  it('refuses an empty field and a stray keystroke alike', () => {
    assert.equal(featureRequestProblem('', ''), 'too-short')
    assert.equal(featureRequestProblem('   ', 'plenty of detail here'), 'too-short')
    assert.equal(featureRequestProblem('a'.repeat(SUMMARY_MIN - 1), ''), 'too-short')
    assert.equal(featureRequestProblem('a'.repeat(SUMMARY_MIN), ''), null)
  })

  it('measures the summary after trimming, not before', () => {
    // Otherwise a field holding nothing but spaces passes on its length.
    assert.equal(featureRequestProblem(`  ${'a'.repeat(SUMMARY_MAX)}  `, ''), null)
    assert.equal(featureRequestProblem('a'.repeat(SUMMARY_MAX + 1), ''), 'too-long')
  })

  it('answers for the detail as well as the summary', () => {
    assert.equal(featureRequestProblem('Setlists', 'a'.repeat(DETAIL_MAX)), null)
    assert.equal(featureRequestProblem('Setlists', 'a'.repeat(DETAIL_MAX + 1)), 'too-long')
  })

  it('has wording for every reason a screen can be handed', () => {
    // `plan-required` is deliberately absent: it is the one refusal answered by
    // `PlanUpgradeModal` rather than by a line under the field, and the type says so.
    for (const reason of ['too-short', 'too-long', 'no-session', 'rate-limited', 'failed'] as const) {
      assert.equal(typeof FEATURE_REQUEST_MESSAGE[reason], 'string')
      assert.ok(FEATURE_REQUEST_MESSAGE[reason].length > 0, `${reason} has no wording`)
    }
  })
})
