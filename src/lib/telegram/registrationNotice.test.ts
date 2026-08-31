import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { registrationNotice } from './registrationNotice'

describe('registrationNotice', () => {
  it('prints the full name and the email together when both halves are known', () => {
    assert.equal(
      registrationNotice('f.limberti@3nd.it', 'Francesco', 'Limberti'),
      '🆕 Nuova registrazione: Francesco Limberti (f.limberti@3nd.it)',
    )
  })

  it('falls back to the bare email when there is no name at all', () => {
    assert.equal(registrationNotice('f.limberti@3nd.it', null, null), '🆕 Nuova registrazione: f.limberti@3nd.it')
    assert.equal(
      registrationNotice('f.limberti@3nd.it', undefined, undefined),
      '🆕 Nuova registrazione: f.limberti@3nd.it',
    )
    assert.equal(registrationNotice('f.limberti@3nd.it', '', ''), '🆕 Nuova registrazione: f.limberti@3nd.it')
  })

  it('still prints whichever half is known, not just when both are', () => {
    assert.equal(
      registrationNotice('cher@example.com', 'Cher', ''),
      '🆕 Nuova registrazione: Cher (cher@example.com)',
    )
    assert.equal(
      registrationNotice('cher@example.com', null, 'Bono'),
      '🆕 Nuova registrazione: Bono (cher@example.com)',
    )
  })
})
