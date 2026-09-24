import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { NAME_MAX, cleanName } from './names'

describe('cleanName', () => {
  it('trims what it keeps', () => {
    assert.equal(cleanName('  Live set  '), 'Live set')
    assert.equal(cleanName('a'.repeat(NAME_MAX)), 'a'.repeat(NAME_MAX))
  })

  it('refuses nothing, too much, and anything that is not text', () => {
    assert.equal(cleanName('   '), null)
    assert.equal(cleanName('a'.repeat(NAME_MAX + 1)), null)
    assert.equal(cleanName(42), null)
    assert.equal(cleanName(undefined), null)
  })
})
