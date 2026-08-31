import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createPrefsQueue } from './queue'
import type { SaveResult } from './actions'
import { DEFAULT_GLOBAL_PREFS, DEFAULT_SONG_PREFS } from './types'

function queueWith(result: SaveResult | (() => SaveResult)) {
  const calls: string[] = []
  const next = typeof result === 'function' ? result : () => result

  const queue = createPrefsQueue({ debounceMs: 10_000, retryMs: 10_000 })
  queue.setHandlers({
    saveGlobal: async () => {
      calls.push('global')
      return next()
    },
    saveSong: async (slug) => {
      calls.push(`song:${slug}`)
      return next()
    },
  })

  return { queue, calls }
}

describe('prefs write queue', () => {
  it('clears an entry once it is saved', async () => {
    const { queue, calls } = queueWith('saved')

    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    assert.equal(queue.size(), 1)

    await queue.flush()
    assert.deepEqual(calls, ['global'])
    assert.equal(queue.size(), 0)
  })

  it('clears an entry when there is nowhere to save it', async () => {
    // Nobody signed in, or no database configured: the write is finished, not
    // pending. Keeping it would leave the "unsaved" indicator on forever, and
    // hasPending would block the server's values from ever being applied.
    const { queue } = queueWith('no-destination')

    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    await queue.flush()

    assert.equal(queue.size(), 0)
    assert.equal(queue.hasPending('global'), false)
  })

  it('keeps an entry when the save fails, so it can be retried', async () => {
    const { queue } = queueWith('failed')

    queue.enqueueSong('certe-notti', DEFAULT_SONG_PREFS)
    await queue.flush()

    assert.equal(queue.size(), 1)
    assert.equal(queue.hasPending('song:certe-notti'), true)
  })

  it('keeps an entry when the request never arrives', async () => {
    const queue = createPrefsQueue({ debounceMs: 10_000, retryMs: 10_000 })
    queue.setHandlers({
      saveGlobal: async () => {
        throw new Error('offline')
      },
      saveSong: async () => {
        throw new Error('offline')
      },
    })

    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    await queue.flush()

    assert.equal(queue.size(), 1)
  })

  it('recovers on a later flush after a failure', async () => {
    let result: SaveResult = 'failed'
    const { queue, calls } = queueWith(() => result)

    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    await queue.flush()
    assert.equal(queue.size(), 1)

    result = 'saved'
    await queue.flush()
    assert.equal(queue.size(), 0)
    assert.deepEqual(calls, ['global', 'global'])
  })

  it('keeps only the latest value per target', async () => {
    const { queue, calls } = queueWith('saved')

    queue.enqueueSong('x', { semitones: 1, scrollSpeed: 3, capo: 0, chordShapes: {} })
    queue.enqueueSong('x', { semitones: 2, scrollSpeed: 3, capo: 0, chordShapes: {} })
    queue.enqueueSong('x', { semitones: 3, scrollSpeed: 3, capo: 0, chordShapes: {} })
    assert.equal(queue.size(), 1)

    await queue.flush()
    assert.deepEqual(calls, ['song:x'], 'five taps must not be five saves')
  })

  it('tracks separate entries for global and per-song preferences', async () => {
    const { queue } = queueWith('saved')

    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    queue.enqueueSong('y', DEFAULT_SONG_PREFS)
    assert.equal(queue.size(), 2)

    await queue.flush()
    assert.equal(queue.size(), 0)
  })

  it('reports the pending count to subscribers', async () => {
    const { queue } = queueWith('saved')
    const seen: number[] = []

    const unsubscribe = queue.subscribe((count) => seen.push(count))
    queue.enqueueGlobal(DEFAULT_GLOBAL_PREFS)
    await queue.flush()
    unsubscribe()

    assert.deepEqual(seen, [0, 1, 0])
  })
})
