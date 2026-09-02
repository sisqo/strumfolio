import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_GLOBAL_PREFS, NOTATIONS, readNotation } from './types'

/**
 * The guard the four inline narrowings could not be.
 *
 * Each of those asked whether the stored value was `int` and answered `it` if it was not,
 * which is a correct pair of answers for two notations and silently the wrong one for
 * four: a reader who had chosen German would have been handed Italian by their own cache,
 * their own database row, and the Strum Together broadcast, with nothing anywhere
 * reporting a problem. The second case below is that bug, written down.
 */
describe('readNotation', () => {
  it('keeps every notation a reader can actually pick', () => {
    for (const notation of NOTATIONS) {
      assert.equal(readNotation(notation), notation)
    }
  })

  it('does not quietly hand a German reader the Italian alphabet', () => {
    assert.equal(readNotation('de'), 'de')
    assert.equal(readNotation('nash'), 'nash')
  })

  it('falls back to the default for anything it does not recognise', () => {
    for (const value of [undefined, null, '', 'IT', 'german', 'nashville', 42, {}, []]) {
      assert.equal(readNotation(value), 'int')
    }
  })

  /* The fallback is the column's default and the in-memory default at once, which is what
     makes a row written before this preference existed and a corrupted cache agree. */
  it('falls back to the same answer a reader who never chose already gets', () => {
    assert.equal(readNotation('nonsense'), DEFAULT_GLOBAL_PREFS.notation)
  })
})
