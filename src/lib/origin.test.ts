import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PRODUCTION_ORIGIN, linkOrigin } from './origin'

describe('linkOrigin', () => {
  it('keeps the product’s own hosts and this project’s Vercel deployments, always on https', () => {
    assert.equal(linkOrigin('strumfolio.com', 'https'), 'https://strumfolio.com')
    assert.equal(linkOrigin('preview.strumfolio.com', 'http'), 'https://preview.strumfolio.com')
    assert.equal(linkOrigin('strumfolio-git-main-sisqoz.vercel.app', 'https'), 'https://strumfolio-git-main-sisqoz.vercel.app')
    assert.equal(linkOrigin('strumfolio-sisqoz.vercel.app', 'https'), 'https://strumfolio-sisqoz.vercel.app')
  })

  it('keeps localhost with its port and its own scheme', () => {
    assert.equal(linkOrigin('localhost:3000', null), 'http://localhost:3000')
    assert.equal(linkOrigin(null, null), 'http://localhost:3000')
  })

  /* A forged host would put the reset token on the attacker's own site. */
  it('writes the production origin for any host it does not know', () => {
    for (const host of ['evil.example', 'strumfolio.com.evil.example', 'other-sisqoz.vercel.app', 'strumfolio.com:8443']) {
      assert.equal(linkOrigin(host, 'https'), PRODUCTION_ORIGIN, host)
    }
  })
})
