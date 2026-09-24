import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { courtesySendable } from './sendable'

describe('courtesySendable', () => {
  it('sends to anybody from production', () => {
    assert.equal(courtesySendable('production', 'someone@example.com'), true)
  })

  /* The local database is a copy of production's real addresses. */
  it('sends only to a QA address anywhere else', () => {
    for (const env of [undefined, '', 'preview', 'development']) {
      assert.equal(courtesySendable(env, 'someone@example.com'), false, String(env))
      assert.equal(courtesySendable(env, 'qa-abc123@strumfolio.test'), true, String(env))
    }
  })
})
