import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pinLanded } from './paddleApply'

/**
 * The check that decides whether the second of the two calls worked — and, when it says no,
 * whether a change that has already been made is rolled back.
 *
 * **It used to be exact equality**, on a value that makes a round trip through Paddle. That
 * fails in the expensive direction: a pin that worked would read as failed, and the rollback
 * would undo a change that had gone through while telling the reader it had not.
 */
describe('pinLanded', () => {
  const wanted = new Date('2027-09-13T08:35:00.000Z')

  it('accepts the date it asked for', () => {
    assert.equal(pinLanded('2027-09-13T08:35:00.000Z', wanted), true)
  })

  /* Paddle may hand back more precision than was sent, or round it away. Neither is a failure
     to pin, and one measurement in one direction is not a promise that it never will. */
  it('accepts a date Paddle has normalised by seconds', () => {
    for (const reported of [
      '2027-09-13T08:35:00.123456Z',
      '2027-09-13T08:34:20.000Z',
      '2027-09-13T08:35:59.000Z',
    ]) {
      assert.equal(pinLanded(reported, wanted), true, reported)
    }
  })

  /*
   * What this actually detects is a date that never moved — and an unpinned one is a whole
   * cycle away, a month or a year, never a minute. So the tolerance can be enormous relative to
   * the noise and still leave no room for the real failure to slip through.
   */
  it('refuses a date that is a cycle away, which is the only failure there is', () => {
    for (const reported of ['2027-10-13T08:35:00.000Z', '2028-09-13T08:35:00.000Z', '2026-09-13T08:35:00.000Z']) {
      assert.equal(pinLanded(reported, wanted), false, reported)
    }
    /* And an hour out is still refused: a billing date is not approximately right. */
    assert.equal(pinLanded('2027-09-13T09:35:00.000Z', wanted), false)
  })

  /* No date and an unreadable one both mean «it did not land» — never «near enough». */
  it('refuses an answer it cannot read at all', () => {
    for (const reported of [null, undefined, '', 'soon']) {
      assert.equal(pinLanded(reported, wanted), false, String(reported))
    }
  })
})
