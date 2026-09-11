import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { registrationNotice } from './registrationNotice'

describe('registrationNotice', () => {
  it('names the address that registered', () => {
    assert.equal(registrationNotice('reader@example.com'), '🆕 Nuova registrazione — reader@example.com')
  })

  it('adds the name when one is known', () => {
    assert.equal(
      registrationNotice('reader@example.com', { firstName: 'Mario', lastName: 'Rossi' }),
      '🆕 Nuova registrazione — Mario Rossi (reader@example.com)',
    )
  })

  /**
   * A registration left pending across the deploy that added the name columns carries nulls,
   * and the operator path fills the name from that same row — so "known" is not a thing any
   * caller can promise. A blank name must read as no name, never as a stray separator.
   */
  it('reads a blank name as no name at all', () => {
    assert.equal(
      registrationNotice('reader@example.com', { firstName: ' ', lastName: '' }),
      '🆕 Nuova registrazione — reader@example.com',
    )
  })

  /**
   * The link to `/accounts` is gone on purpose: the address in the message is exactly the trip
   * to that page it saves, and a notice read on a phone away from a signed-in browser is where
   * this is read.
   */
  it('carries no link back to the site', () => {
    assert.equal(registrationNotice('reader@example.com').includes('http'), false)
    assert.equal(registrationNotice('reader@example.com').includes('strumfolio'), false)
  })
})
