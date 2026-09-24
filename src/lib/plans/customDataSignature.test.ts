import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { accountIdSigned, signAccountId, signStamp, stampSigned } from './customDataSignature'

const SECRET = 'one-secret'
const stamp = { from_plan: 'premium', from_cycle: 'year', at: '2027-01-01T00:00:00.000Z' }

describe('the custom_data signature', () => {
  it('verifies what it signed, for that account and that key only', () => {
    const sig = signAccountId(42, SECRET)
    assert.equal(accountIdSigned(42, sig, SECRET), true)
    assert.equal(accountIdSigned(43, sig, SECRET), false)
    assert.equal(accountIdSigned(42, sig, 'another-secret'), false)
  })

  it('refuses a missing or malformed signature without throwing', () => {
    for (const sig of [undefined, null, '', 'abc', 42, signAccountId(42, SECRET).slice(1)]) {
      assert.equal(accountIdSigned(42, sig, SECRET), false, String(sig))
    }
  })

  it('verifies nothing, and signs nothing, without a secret', () => {
    assert.equal(accountIdSigned(42, signAccountId(42, SECRET), ''), false)
    assert.throws(() => signAccountId(42, ''))
  })

  it('binds a stamp to its fields and to the account it was written for', () => {
    const signed = { ...stamp, sig: signStamp(7, stamp, SECRET) }
    assert.equal(stampSigned(7, signed, SECRET), true)
    assert.equal(stampSigned(8, signed, SECRET), false)
    assert.equal(stampSigned(7, { ...signed, from_plan: 'plus' }, SECRET), false)
    assert.equal(stampSigned(7, { ...signed, at: '2099-01-01T00:00:00.000Z' }, SECRET), false)
    assert.equal(stampSigned(7, stamp, SECRET), false)
  })

  it('keeps a stamp with no cycle apart from one naming a cycle', () => {
    const noCycle = { ...stamp, from_cycle: null }
    const signed = { ...noCycle, sig: signStamp(7, noCycle, SECRET) }
    assert.equal(stampSigned(7, signed, SECRET), true)
    assert.equal(stampSigned(7, { ...signed, from_cycle: 'year' }, SECRET), false)
  })

  /* An account signature is not a stamp signature: the messages are labelled apart. */
  it('does not accept an account signature in place of a stamp one', () => {
    assert.equal(stampSigned(7, { ...stamp, sig: signAccountId(7, SECRET) }, SECRET), false)
  })
})
