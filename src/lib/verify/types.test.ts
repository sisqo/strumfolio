import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { verifyPassword } from '@/lib/auth/password'
import { MAX_PASSWORD, MIN_PASSWORD } from '@/lib/auth/types'

import { NO_PENDING_PASSWORD, VERIFY_MESSAGE, passwordProblem } from './types'

describe('passwordProblem', () => {
  const good = 'a'.repeat(MIN_PASSWORD)

  it('takes a long enough password typed twice alike', () => {
    assert.equal(passwordProblem(good, good), null)
    assert.equal(passwordProblem('a'.repeat(MAX_PASSWORD), 'a'.repeat(MAX_PASSWORD)), null)
  })

  it('refuses one too short or too long, before it looks at the second', () => {
    assert.equal(passwordProblem('a'.repeat(MIN_PASSWORD - 1), 'x'), 'weak-password')
    assert.equal(passwordProblem('a'.repeat(MAX_PASSWORD + 1), 'a'.repeat(MAX_PASSWORD + 1)), 'weak-password')
  })

  it('refuses two that differ', () => {
    assert.equal(passwordProblem(good, `${good}b`), 'password-mismatch')
  })

  it('refuses anything a form would not send', () => {
    assert.equal(passwordProblem(null, null), 'failed')
    assert.equal(passwordProblem(good, undefined), 'failed')
  })

  it('has a sentence for every answer', () => {
    for (const reason of ['invalid-link', 'weak-password', 'password-mismatch', 'failed'] as const) {
      assert.ok(VERIFY_MESSAGE[reason].length > 0)
    }
  })
})

describe('NO_PENDING_PASSWORD', () => {
  /* The property the whole change rests on: what registration stores can never be matched. */
  it('is not a hash any password verifies against', async () => {
    assert.equal(await verifyPassword('', NO_PENDING_PASSWORD), false)
    assert.equal(await verifyPassword('anything at all', NO_PENDING_PASSWORD), false)
  })
})
