import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { runAsToken } from './actor'
import { accessTo } from './session'

describe('a token actor', () => {
  it('reaches no account but its own — an owner’s token included', async () => {
    const previous = process.env.ALLOWED_EMAILS
    process.env.ALLOWED_EMAILS = 'owner@strumfolio.test'
    try {
      const other = await runAsToken(
        { tokenId: 1, accountId: 1, accountOwnerEmail: 'owner@strumfolio.test' },
        () => accessTo('customer@strumfolio.test'),
      )
      assert.equal(other, null)
    } finally {
      process.env.ALLOWED_EMAILS = previous
    }
  })

  it('reaches its own account as its admin', async () => {
    const own = await runAsToken(
      { tokenId: 1, accountId: 1, accountOwnerEmail: 'reader@strumfolio.test' },
      () => accessTo('Reader@Strumfolio.test'),
    )
    assert.deepEqual(own, { email: 'reader@strumfolio.test', accountOwnerEmail: 'reader@strumfolio.test', role: 'admin' })
  })
})
