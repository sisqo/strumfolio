import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionRevoked } from './revocation'

describe('sessionRevoked', () => {
  const cut = new Date('2026-09-25T10:00:00Z')

  it('revokes nothing on an account that never revoked', () => {
    assert.equal(sessionRevoked(undefined, null), false)
    assert.equal(sessionRevoked(0, null), false)
  })

  it('refuses a session signed in before the cut and keeps one signed in after it', () => {
    assert.equal(sessionRevoked(cut.getTime() - 1, cut), true)
    assert.equal(sessionRevoked(cut.getTime(), cut), false)
    assert.equal(sessionRevoked(cut.getTime() + 1, cut), false)
  })

  it('treats a token from before the claim existed as the oldest there is', () => {
    assert.equal(sessionRevoked(undefined, cut), true)
    assert.equal(sessionRevoked('1790000000000', cut), true)
    assert.equal(sessionRevoked(Number.NaN, cut), true)
  })
})
