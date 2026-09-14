import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { QA_OWNER_EMAIL, isQaEmail, qaAllowed, qaEmailFrom } from './entry'

/**
 * The two guards in front of a passwordless sign-in, each tested for the case that would open
 * it rather than for the case that works. Both are written as allowlists, so what these assert
 * is that everything unanticipated is refused.
 */
describe('where the QA entry point may run', () => {
  it('never in production', () => {
    assert.equal(qaAllowed('production'), false)
  })

  it('in preview and in a Vercel development deployment', () => {
    assert.equal(qaAllowed('preview'), true)
    assert.equal(qaAllowed('development'), true)
  })

  it('locally, where the variable does not exist at all', () => {
    assert.equal(qaAllowed(undefined), true)
    assert.equal(qaAllowed(null), true)
    assert.equal(qaAllowed(''), true)
  })

  /* An allowlist and not `!== 'production'`: a renamed environment, a typo or a value nobody
     anticipated must land on «no», not on «yes, because it is not the one name I checked». */
  it('refuses a value it does not recognise', () => {
    assert.equal(qaAllowed('prod'), false)
    assert.equal(qaAllowed('Production'), false)
    assert.equal(qaAllowed('staging'), false)
    assert.equal(qaAllowed('PREVIEW'), false)
  })
})

describe('who the QA entry point may sign in as', () => {
  it('an address in the reserved test domain', () => {
    assert.equal(isQaEmail('qa-a1b2c3@strumfolio.test'), true)
    assert.equal(isQaEmail(QA_OWNER_EMAIL), true)
  })

  it('normalizes first, so casing and spacing cannot smuggle anything', () => {
    assert.equal(isQaEmail('  QA-Owner@Strumfolio.TEST '), true)
  })

  /* The whole point of the namespace: the development database holds a copy of production,
     real addresses and real password hashes included. */
  it('never a real address', () => {
    assert.equal(isQaEmail('f.limberti@gmail.com'), false)
    assert.equal(isQaEmail('1@strumfolio.com'), false)
    assert.equal(isQaEmail('qa@strumfolio.com'), false)
  })

  /* Anchored at both ends. An `endsWith` or an unanchored regex admits the first of these,
     which is a domain anybody can register. */
  it('never an address that only looks like one', () => {
    assert.equal(isQaEmail('qa@strumfolio.test.example.com'), false)
    assert.equal(isQaEmail('victim@example.com qa@strumfolio.test'), false)
    assert.equal(isQaEmail('qa@sub.strumfolio.test'), false)
    assert.equal(isQaEmail('qa.owner@strumfolio.test'), false)
    assert.equal(isQaEmail('qa+admin@strumfolio.test'), false)
    assert.equal(isQaEmail('@strumfolio.test'), false)
    assert.equal(isQaEmail(''), false)
    assert.equal(isQaEmail(null), false)
    assert.equal(isQaEmail(undefined), false)
  })
})

describe('building a QA address', () => {
  it('prefixes and lands inside the namespace', () => {
    assert.equal(qaEmailFrom('a1b2c3'), 'qa-a1b2c3@strumfolio.test')
    assert.equal(qaEmailFrom('owner'), QA_OWNER_EMAIL)
  })

  it('folds anything unusable in the token into hyphens', () => {
    assert.equal(qaEmailFrom('Coupon Test #2'), 'qa-coupon-test-2@strumfolio.test')
    assert.equal(qaEmailFrom('  spaced  '), 'qa-spaced@strumfolio.test')
  })

  /* Null rather than a repaired address: the caller's next move is to refuse, and an entry
     point that quietly signs in as something other than what was asked for is the failure. */
  it('refuses a token with nothing in it', () => {
    assert.equal(qaEmailFrom(''), null)
    assert.equal(qaEmailFrom('   '), null)
    assert.equal(qaEmailFrom('@@@'), null)
  })

  it('cannot be talked out of the namespace', () => {
    for (const token of ['x@example.com', '../../root', 'a"@evil.com']) {
      const email = qaEmailFrom(token)
      assert.equal(email !== null && isQaEmail(email), true)
    }
  })
})
