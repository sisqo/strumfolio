import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { END_SLACK, atScrollEnd } from './scrollEnd'

describe('atScrollEnd', () => {
  it('is false in the middle of a long song, however little the last frame moved', () => {
    // The zoom case: 1679 pixels still to scroll, and a frame that advanced by a
    // fraction the browser rounded away. Movement says "stuck", position says "playing".
    assert.equal(atScrollEnd(0, 2536, 857), false)
    assert.equal(atScrollEnd(1084, 2536, 857), false)
  })

  it('is true at the last scrollable pixel', () => {
    assert.equal(atScrollEnd(1679, 2536, 857), true)
  })

  it('accepts a scroll position a rounding short of the end', () => {
    // Under zoom the furthest scrollY reported can sit just below the room the two
    // integer heights describe; the end has still been reached.
    assert.equal(atScrollEnd(1679 - END_SLACK, 2536, 857), true)
    assert.equal(atScrollEnd(1678, 2536, 857), true)
  })

  it('is false a clear distance before the end', () => {
    assert.equal(atScrollEnd(1679 - END_SLACK - 1, 2536, 857), false)
  })

  it('is false on a page with nothing to scroll, which has no end to be at', () => {
    // A song that fits: the reading page leaves it exactly one screen tall, so the two
    // heights are equal. Answering true here is what used to stop play on the first frame.
    assert.equal(atScrollEnd(0, 1200, 1200), false)
  })

  it('is false when the page is shorter than the window', () => {
    // Belt and braces: a rounding that makes scrollHeight come back under clientHeight
    // must not read as an end either.
    assert.equal(atScrollEnd(0, 1199, 1200), false)
  })

  it('is true for a page with barely any room, once that room is used up', () => {
    // Room of 3 exceeds the slack, so this page has a real end and reaching it stops.
    assert.equal(atScrollEnd(3, 1203, 1200), true)
    assert.equal(atScrollEnd(0, 1203, 1200), false)
  })
})
