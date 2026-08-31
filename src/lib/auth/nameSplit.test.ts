import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { splitName } from './nameSplit'

describe('splitName', () => {
  it('splits a plain two-word name', () => {
    assert.deepEqual(splitName('Francesco Limberti'), { firstName: 'Francesco', lastName: 'Limberti' })
  })

  it('keeps a double surname together as the last name', () => {
    assert.deepEqual(splitName('Maria De Filippi'), { firstName: 'Maria', lastName: 'De Filippi' })
  })

  it('treats a single word as a first name with no last name', () => {
    assert.deepEqual(splitName('Cher'), { firstName: 'Cher', lastName: '' })
  })

  it('collapses internal whitespace and trims the ends', () => {
    assert.deepEqual(splitName('  Anna   Bianchi  '), { firstName: 'Anna', lastName: 'Bianchi' })
  })

  it('degrades an empty, null or undefined name to two empty strings', () => {
    assert.deepEqual(splitName(''), { firstName: '', lastName: '' })
    assert.deepEqual(splitName('   '), { firstName: '', lastName: '' })
    assert.deepEqual(splitName(null), { firstName: '', lastName: '' })
    assert.deepEqual(splitName(undefined), { firstName: '', lastName: '' })
  })
})
