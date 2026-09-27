import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { hashToken, idleDeadline, looksLikeToken, mintToken, TOKEN_IDLE_DAYS, tokenState } from './tokens'

const DAY = 24 * 60 * 60 * 1000

describe('mintToken', () => {
  it('mints a secret the resolver will accept, and stores only its hash', () => {
    const token = mintToken()
    assert.equal(looksLikeToken(token.secret), true)
    assert.equal(token.hash, hashToken(token.secret))
    assert.equal(token.hash.includes(token.secret), false)
    assert.equal(token.secret.startsWith(token.prefix), true)
  })

  it('never mints the same secret twice', () => {
    assert.notEqual(mintToken().secret, mintToken().secret)
  })
})

describe('looksLikeToken', () => {
  it('refuses anything else before it costs a query', () => {
    assert.equal(looksLikeToken(''), false)
    assert.equal(looksLikeToken('sfm_short'), false)
    assert.equal(looksLikeToken(`xyz_${'a'.repeat(43)}`), false)
  })
})

describe('tokenState', () => {
  const created = new Date('2026-01-01T00:00:00Z')

  it('keeps a token in use alive indefinitely', () => {
    const lastUsedAt = new Date(created.getTime() + 1000 * DAY)
    assert.equal(tokenState({ createdAt: created, lastUsedAt, revokedAt: null }, new Date(lastUsedAt.getTime() + DAY)), 'live')
  })

  it('ends a token after six months without use, counting from birth when never used', () => {
    const token = { createdAt: created, lastUsedAt: null, revokedAt: null }
    assert.equal(idleDeadline(token).getTime(), created.getTime() + TOKEN_IDLE_DAYS * DAY)
    assert.equal(tokenState(token, new Date(created.getTime() + (TOKEN_IDLE_DAYS - 1) * DAY)), 'live')
    assert.equal(tokenState(token, new Date(created.getTime() + TOKEN_IDLE_DAYS * DAY)), 'idle')
  })

  it('reports a revoked token as revoked, whatever its use', () => {
    assert.equal(tokenState({ createdAt: created, lastUsedAt: created, revokedAt: created }, created), 'revoked')
  })
})
