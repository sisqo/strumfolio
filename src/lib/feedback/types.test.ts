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
  isFeedbackCategory,
  screenshotAcceptable,
  screenshotAttachment,
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

describe('screenshotAcceptable', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString('base64')
  const ok = { filename: 'shot.png', mimeType: 'image/png', base64: png }

  it('takes an image of a size a request can carry', () => {
    assert.equal(screenshotAcceptable(ok), true)
  })

  it('refuses bytes that are not the image they claim to be', () => {
    assert.equal(screenshotAcceptable({ ...ok, base64: Buffer.from('<html><script>').toString('base64') }), false)
    assert.equal(screenshotAcceptable({ ...ok, mimeType: 'image/jpeg' }), false)
    assert.equal(screenshotAcceptable({ ...ok, base64: `${png}<b>` }), false)
  })

  it('sends the checked type under its own extension, whatever the name said', () => {
    const sent = screenshotAttachment({ ...ok, filename: 'invoice.exe' })
    assert.deepEqual(sent, { filename: 'invoice.png', content: png, contentType: 'image/png' })
    assert.equal(screenshotAttachment({ ...ok, filename: '../../<x>.html' }).filename, 'x.png')
    assert.equal(screenshotAttachment({ ...ok, filename: '.png' }).filename, 'screenshot.png')
  })

  it('refuses anything that is not an image, or not the shape the sheet sends', () => {
    assert.equal(screenshotAcceptable({ ...ok, mimeType: 'application/x-msdownload' }), false)
    assert.equal(screenshotAcceptable({ ...ok, filename: '' }), false)
    assert.equal(screenshotAcceptable({ ...ok, filename: 'a'.repeat(201) }), false)
    assert.equal(screenshotAcceptable({ ...ok, base64: 42 }), false)
    assert.equal(screenshotAcceptable(null), false)
    assert.equal(screenshotAcceptable({ ...ok, base64: 'A'.repeat(Math.ceil((SCREENSHOT_MAX_BYTES + 1) / 0.75)) }), false)
  })
})

describe('isFeedbackCategory', () => {
  it('knows the four and nothing else', () => {
    for (const category of FEEDBACK_CATEGORIES) assert.equal(isFeedbackCategory(category), true)
    assert.equal(isFeedbackCategory('toString'), false)
    assert.equal(isFeedbackCategory(undefined), false)
  })
})
