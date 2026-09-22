import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isMissingReference } from './ids'

describe('isMissingReference', () => {
  /* The shape measured against dev: drizzle's wrapper, the Neon driver's error as its cause. */
  const neon = (column: string) => ({ message: 'Failed query', cause: { code: '23502', column_name: column } })

  it('recognises a lookup that found nothing, through the wrapper', () => {
    assert.equal(isMissingReference(neon('song_id'), ['song_id', 'account_id']), true)
    assert.equal(isMissingReference({ code: '23502', column: 'account_id' }, ['song_id', 'account_id']), true)
  })

  /* Anything else is a write that might yet succeed, and must stay `failed`. */
  it('leaves every other failure alone', () => {
    assert.equal(isMissingReference(neon('body'), ['song_id', 'account_id']), false)
    assert.equal(isMissingReference({ cause: { code: '23505', column_name: 'song_id' } }, ['song_id']), false)
    assert.equal(isMissingReference(new Error('fetch failed'), ['song_id']), false)
    assert.equal(isMissingReference(null, ['song_id']), false)
  })
})
