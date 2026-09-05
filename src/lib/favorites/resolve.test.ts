import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveFavorites } from './resolve'

const nothing = {}

describe('resolveFavorites', () => {
  it('prefers the server over the list the page was rendered with', () => {
    const resolved = resolveFavorites({
      baked: ['stale'],
      live: ['fresh'],
      cached: nothing,
      writes: nothing,
    })

    assert.deepEqual([...resolved], ['fresh'])
  })

  it('keeps the rendered list when the server could not be asked', () => {
    const resolved = resolveFavorites({
      baked: ['certe-notti'],
      live: null,
      cached: nothing,
      writes: nothing,
    })

    assert.deepEqual([...resolved], ['certe-notti'])
  })

  /**
   * A star set on the tablet, on a song this phone has opened before — so its cache holds
   * an answer, and that answer is the older one. Letting it win here is the multi-device
   * bug this ordering exists to prevent.
   */
  it('does not let a stale local answer overrule the server', () => {
    const resolved = resolveFavorites({
      baked: [],
      live: ['starred-on-the-tablet'],
      cached: { 'starred-on-the-tablet': false },
      writes: nothing,
    })

    assert.deepEqual([...resolved], ['starred-on-the-tablet'])
  })

  it('lets the whole local cache decide while the server is unreachable', () => {
    const resolved = resolveFavorites({
      baked: ['from-the-precache'],
      live: null,
      cached: { 'from-the-precache': false, 'starred-on-a-train': true },
      writes: nothing,
    })

    assert.deepEqual([...resolved], ['starred-on-a-train'])
  })

  /**
   * The regression this function exists to prevent: the queue drains, the write succeeds,
   * and the only `live` answer in hand is the one fetched before that write. Without the
   * override the star the reader has just set goes out again on every list behind the song.
   */
  it('keeps a star this visit wrote, even against a server list that predates it', () => {
    const resolved = resolveFavorites({
      baked: [],
      live: [],
      cached: nothing,
      writes: { 'certe-notti': true },
    })

    assert.deepEqual([...resolved], ['certe-notti'])
  })

  it('takes a star away again when this visit is the one that removed it', () => {
    const resolved = resolveFavorites({
      baked: ['certe-notti'],
      live: ['certe-notti'],
      cached: nothing,
      writes: { 'certe-notti': false },
    })

    assert.deepEqual([...resolved], [])
  })

  it('lets this visit overrule the local cache as well, offline', () => {
    const resolved = resolveFavorites({
      baked: [],
      live: null,
      cached: { 'certe-notti': true },
      writes: { 'certe-notti': false },
    })

    assert.deepEqual([...resolved], [])
  })

  /**
   * A song no device has an opinion about is not "not starred" — it is unanswered, and the
   * server's list is the only thing entitled to speak for it.
   */
  it('says nothing about songs nobody has an answer for', () => {
    const resolved = resolveFavorites({
      baked: [],
      live: ['from-elsewhere'],
      cached: { 'something-else': false },
      writes: nothing,
    })

    assert.deepEqual([...resolved], ['from-elsewhere'])
  })
})
