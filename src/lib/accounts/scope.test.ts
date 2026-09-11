import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { describe, it } from 'node:test'

import { accountScopeTag, currentAccountFor, isScopeTag, mayAccess } from './scope'

/*
 * Node 18 — what `npm test` runs on here — reaches Web Crypto only through `node:crypto`, while
 * the two runtimes this module actually runs in, the edge one and every browser, have it as the
 * global it uses. Supplied here rather than imported in the source on purpose: an import of
 * `node:crypto` from a module `middleware.ts` pulls in is the mistake this codebase already made
 * once and left a scar for (see `accounts/current.ts`' header).
 */
globalThis.crypto ??= webcrypto as Crypto

const OWNERS = 'owner@example.com'

describe('accountScopeTag', () => {
  it('gives one account the same tag every time', async () => {
    assert.equal(await accountScopeTag('reader@example.com'), await accountScopeTag('reader@example.com'))
  })

  /**
   * The one property the whole fix rests on. Two accounts sharing a tag would share every
   * `localStorage` key built from it, which is the bug being repaired rather than a near miss.
   */
  it('gives two accounts different tags', async () => {
    assert.notEqual(await accountScopeTag('one@example.com'), await accountScopeTag('two@example.com'))
  })

  /**
   * Normalized, because the rest of the app is: an address that signs in as `Reader@` and is
   * stored as `reader@` must not be handed a second cache with none of its own contents in it.
   */
  it('reads an address the way every other account rule reads it', async () => {
    assert.equal(await accountScopeTag('  Reader@Example.COM '), await accountScopeTag('reader@example.com'))
  })

  it('is sixteen hex characters, and its own validator agrees', async () => {
    const tag = await accountScopeTag('reader@example.com')
    assert.match(tag, /^[0-9a-f]{16}$/)
    assert.equal(isScopeTag(tag), true)
  })

  /** It ends up in key names, so nothing that could reach into another key's space passes. */
  it('refuses anything that is not a tag', () => {
    for (const value of [null, undefined, '', 'reader@example.com', 'songs:edits', '../../x', 'ZZZZZZZZZZZZZZZZ', 'abc']) {
      assert.equal(isScopeTag(value), false, `${String(value)} should not pass as a tag`)
    }
  })
})

describe('currentAccountFor, after moving here from accounts/current.ts', () => {
  it('falls back to the reader own account when no cookie asks for one', () => {
    assert.equal(currentAccountFor('reader@example.com', OWNERS, null), 'reader@example.com')
  })

  /** A stale cookie naming somebody else's account must not decide whose caches a browser keeps. */
  it('ignores a requested account the reader may not open', () => {
    assert.equal(currentAccountFor('reader@example.com', OWNERS, 'someone@example.com'), 'reader@example.com')
  })

  it('honours a requested account a global owner may open', () => {
    assert.equal(currentAccountFor(OWNERS, OWNERS, 'customer@example.com'), 'customer@example.com')
  })

  it('says who may open what', () => {
    assert.equal(mayAccess('reader@example.com', 'reader@example.com', OWNERS), true)
    assert.equal(mayAccess('reader@example.com', 'other@example.com', OWNERS), false)
    assert.equal(mayAccess(OWNERS, 'anyone@example.com', OWNERS), true)
  })
})

/**
 * The tag is what separates two accounts' caches, so this states the separation end to end
 * rather than trusting the two halves to keep agreeing: the account a request resolves to is
 * what the tag is taken from, so a switch of account is a switch of cache.
 */
describe('a change of account is a change of cache', () => {
  it('tags an owner working inside a customer account as that customer', async () => {
    const own = await accountScopeTag(currentAccountFor(OWNERS, OWNERS, null))
    const theirs = await accountScopeTag(currentAccountFor(OWNERS, OWNERS, 'customer@example.com'))

    assert.notEqual(own, theirs)
    assert.equal(theirs, await accountScopeTag('customer@example.com'))
  })
})
