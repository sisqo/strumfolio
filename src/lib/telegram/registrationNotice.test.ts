import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { registrationNotice } from './registrationNotice'

describe('registrationNotice', () => {
  it('says that a registration happened and where to look, and nothing about who', () => {
    assert.equal(registrationNotice(), '🆕 Nuova registrazione — https://strumfolio.com/accounts?sort=createdAt&dir=desc')
  })

  it('carries no email address — the guarantee the Privacy Policy rests on', () => {
    assert.equal(registrationNotice().includes('@'), false)
  })
})
