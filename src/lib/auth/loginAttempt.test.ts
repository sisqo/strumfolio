import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  UNVERIFIED_CODE,
  UNVERIFIED_EXPIRED_CODE,
  outcomeFor,
  passwordSourceFor,
  unverifiedCodeFor,
  unverifiedFromCode,
} from './loginAttempt'

const NOW = new Date('2026-09-19T12:00:00Z')
const LATER = new Date('2026-09-20T12:00:00Z')
const EARLIER = new Date('2026-09-18T12:00:00Z')

test('a credentials row is the hash to spend the attempt on', () => {
  const source = passwordSourceFor('scrypt$account', null)

  assert.deepEqual(source, { kind: 'account', hash: 'scrypt$account' })
})

test('a pending registration is used only when no credentials row answers', () => {
  const source = passwordSourceFor(null, { passwordHash: 'scrypt$pending', expiresAt: LATER })

  assert.deepEqual(source, { kind: 'pending', hash: 'scrypt$pending', expiresAt: LATER })
})

test('a real account outranks a pending row left behind for the same address', () => {
  const source = passwordSourceFor('scrypt$account', { passwordHash: 'scrypt$pending', expiresAt: LATER })

  assert.deepEqual(source, { kind: 'account', hash: 'scrypt$account' })
})

test('an address with neither still names a source, so something is always hashed', () => {
  assert.deepEqual(passwordSourceFor(null, null), { kind: 'none' })
})

test('the right password against a credentials row is admitted', () => {
  assert.deepEqual(outcomeFor({ kind: 'account', hash: 'h' }, true, NOW), { outcome: 'admitted' })
})

test('a wrong password says nothing about the address, whatever the source', () => {
  assert.deepEqual(outcomeFor({ kind: 'account', hash: 'h' }, false, NOW), { outcome: 'refused' })
  assert.deepEqual(outcomeFor({ kind: 'pending', hash: 'h', expiresAt: LATER }, false, NOW), { outcome: 'refused' })
  assert.deepEqual(outcomeFor({ kind: 'none' }, false, NOW), { outcome: 'refused' })
})

test('the right password against a live pending registration is unverified, not refused', () => {
  assert.deepEqual(outcomeFor({ kind: 'pending', hash: 'h', expiresAt: LATER }, true, NOW), {
    outcome: 'unverified',
    linkExpired: false,
  })
})

test('an expired link is still unverified — only the wording changes', () => {
  assert.deepEqual(outcomeFor({ kind: 'pending', hash: 'h', expiresAt: EARLIER }, true, NOW), {
    outcome: 'unverified',
    linkExpired: true,
  })
})

test('a link expiring exactly now is expired, as `verifyEmail` already reads it', () => {
  assert.deepEqual(outcomeFor({ kind: 'pending', hash: 'h', expiresAt: NOW }, true, NOW), {
    outcome: 'unverified',
    linkExpired: true,
  })
})

test('a match against nothing grants nothing', () => {
  assert.deepEqual(outcomeFor({ kind: 'none' }, true, NOW), { outcome: 'refused' })
})

test('the two facts survive the round trip through the error code', () => {
  assert.equal(unverifiedCodeFor(false), UNVERIFIED_CODE)
  assert.equal(unverifiedCodeFor(true), UNVERIFIED_EXPIRED_CODE)
  assert.deepEqual(unverifiedFromCode(unverifiedCodeFor(false)), { linkExpired: false })
  assert.deepEqual(unverifiedFromCode(unverifiedCodeFor(true)), { linkExpired: true })
})

test('every other failure reads as not-unverified', () => {
  assert.equal(unverifiedFromCode('credentials'), null)
  assert.equal(unverifiedFromCode(undefined), null)
  assert.equal(unverifiedFromCode(''), null)
})
