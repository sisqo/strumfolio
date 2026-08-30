import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_MESSAGE,
  MESSAGE_MAX,
  MESSAGE_MIN,
  SCREENSHOT_MAX_BYTES,
  excerpt,
  feedbackProblem,
  screenshotTooLarge,
} from './types'

describe('feedbackProblem', () => {
  it('accepts a message with something in it', () => {
    assert.equal(feedbackProblem('Setlists I can reorder before a gig'), null)
  })

  it('refuses an empty field and a stray keystroke alike', () => {
    assert.equal(feedbackProblem(''), 'too-short')
    assert.equal(feedbackProblem('   '), 'too-short')
    assert.equal(feedbackProblem('a'.repeat(MESSAGE_MIN - 1)), 'too-short')
    assert.equal(feedbackProblem('a'.repeat(MESSAGE_MIN)), null)
  })

  it('measures the message after trimming, not before', () => {
    // Otherwise a field holding nothing but spaces passes on its length.
    assert.equal(feedbackProblem(`  ${'a'.repeat(MESSAGE_MAX)}  `), null)
    assert.equal(feedbackProblem('a'.repeat(MESSAGE_MAX + 1)), 'too-long')
  })

  it('has wording for every reason a screen can be handed', () => {
    // `plan-required` is deliberately absent: it is the one refusal answered by
    // `FeaturePaywallModal` rather than by a line under the field, and the type says so.
    for (const reason of ['too-short', 'too-long', 'no-session', 'rate-limited', 'failed'] as const) {
      assert.equal(typeof FEEDBACK_MESSAGE[reason], 'string')
      assert.ok(FEEDBACK_MESSAGE[reason].length > 0, `${reason} has no wording`)
    }
  })
})

describe('FEEDBACK_CATEGORY_LABEL', () => {
  it('names every category `FEEDBACK_CATEGORIES` lists', () => {
    for (const category of FEEDBACK_CATEGORIES) {
      assert.equal(typeof FEEDBACK_CATEGORY_LABEL[category], 'string')
      assert.ok(FEEDBACK_CATEGORY_LABEL[category].length > 0)
    }
  })
})

describe('screenshotTooLarge', () => {
  it('accepts a small attachment and refuses one over the cap', () => {
    assert.equal(screenshotTooLarge('a'.repeat(100)), false)
    // Each char is 6 bits, so this many chars decode to just over the cap.
    const overCap = Math.ceil((SCREENSHOT_MAX_BYTES / 0.75) * 1.1)
    assert.equal(screenshotTooLarge('a'.repeat(overCap)), true)
  })
})

describe('excerpt', () => {
  it('leaves a short line untouched', () => {
    assert.equal(excerpt('Setlists I can reorder', 60), 'Setlists I can reorder')
  })

  it('trims and collapses whitespace before measuring', () => {
    assert.equal(excerpt('  Setlists   I can   reorder  ', 60), 'Setlists I can reorder')
  })

  it('cuts with an ellipsis only once it actually had to', () => {
    const long = 'a'.repeat(80)
    const cut = excerpt(long, 60)
    assert.equal(cut, `${'a'.repeat(60)}...`)
    assert.equal(excerpt('a'.repeat(60), 60), 'a'.repeat(60))
  })
})
