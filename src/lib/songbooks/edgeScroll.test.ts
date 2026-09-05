import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { edgeScrollStep } from './edgeScroll'

describe('scrolling the page for a pointer parked near an edge', () => {
  /** A 640px viewport with a 64px bar over the top of it, at a 16ms frame. */
  const step = (y: number, elapsed = 16) => edgeScrollStep(y, 64, 640, elapsed)

  it('scrolls nothing while the pointer is in the middle', () => {
    assert.equal(step(200), 0)
    assert.equal(step(400), 0)
  })

  it('scrolls up near the top and down near the bottom', () => {
    assert.ok(step(70) < 0)
    assert.ok(step(630) > 0)
  })

  it('counts the top zone from under the bar, not from the edge of the screen', () => {
    assert.ok(step(104) < 0)
    assert.equal(edgeScrollStep(104, 0, 640, 16), 0)
  })

  it('is faster at the edge than deeper inside the list', () => {
    assert.ok(step(639) > step(600))
    assert.ok(Math.abs(step(65)) > Math.abs(step(100)))
  })

  it('is no faster past the edge than on it', () => {
    assert.ok(Math.abs(step(900) - step(640)) < 1e-9)
    assert.ok(Math.abs(step(-300) - step(64)) < 1e-9)
  })

  it('scales with the time the frame took, up to a cap', () => {
    assert.ok(Math.abs(step(630, 32) - 2 * step(630, 16)) < 1e-9)
    assert.equal(step(630, 50), step(630, 5000))
    assert.equal(step(630, 0), 0)
  })
})
