import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isEmailShape, isOwner, normalizeEmail, parseAllowlist } from './allowlist'

describe('parseAllowlist', () => {
  it('splits, trims and lowercases', () => {
    assert.deepEqual(parseAllowlist(' A@x.it , B@Y.IT '), ['a@x.it', 'b@y.it'])
  })

  it('drops empty entries left by stray commas', () => {
    assert.deepEqual(parseAllowlist('a@x.it,,'), ['a@x.it'])
  })

  it('treats missing configuration as an empty list', () => {
    assert.deepEqual(parseAllowlist(undefined), [])
    assert.deepEqual(parseAllowlist(''), [])
  })
})

describe('isOwner', () => {
  it('is true only for the environment half', () => {
    assert.equal(isOwner('a@x.it', 'a@x.it'), true)
    assert.equal(isOwner('A@X.it', ' a@x.it '), true)
    assert.equal(isOwner('b@x.it', 'a@x.it'), false)
    assert.equal(isOwner('b@x.it', undefined), false)
    assert.equal(isOwner(null, 'a@x.it'), false)
  })
})

describe('isEmailShape', () => {
  it('accepts an address', () => {
    assert.equal(isEmailShape('qualcuno@example.com'), true)
    assert.equal(isEmailShape(' Qualcuno@Example.Com '), true)
  })

  it('refuses an address longer than SMTP carries before the pattern sees it', () => {
    const started = Date.now()
    assert.equal(isEmailShape('a@' + '.'.repeat(30000) + '@'), false)
    assert.ok(Date.now() - started < 50)
  })

  it('rejects what is plainly not one', () => {
    assert.equal(isEmailShape('qualcuno'), false)
    assert.equal(isEmailShape('qualcuno@example'), false)
    assert.equal(isEmailShape('qualcuno@'), false)
    assert.equal(isEmailShape('@example.com'), false)
    assert.equal(isEmailShape('due indirizzi@example.com'), false)
    assert.equal(isEmailShape(''), false)
  })
})

describe('normalizeEmail', () => {
  it('is what every comparison goes through', () => {
    assert.equal(normalizeEmail('  Qualcuno@Example.COM '), 'qualcuno@example.com')
  })
})
