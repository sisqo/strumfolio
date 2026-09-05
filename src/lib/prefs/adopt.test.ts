import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { adoptStoredSong, readStillStands } from './adopt'
import { DEFAULT_SONG_PREFS, type SongPrefs } from './types'

/** A read nobody has raced: same edit count as when it was issued, nothing queued. */
const untouched = { editsAtRead: 3, editsNow: 3, writePending: false }

function prefs(patch: Partial<SongPrefs>): SongPrefs {
  return { ...DEFAULT_SONG_PREFS, ...patch }
}

describe('readStillStands', () => {
  it('accepts a read nothing has happened to', () => {
    assert.equal(readStillStands(untouched), true)
  })

  /**
   * The race the edit counter exists for: the queue empties the moment a write lands, so a
   * read resolving after that finds nothing pending and would apply the value from before
   * the reader acted. Unreachable today — Next.js serializes a client's server actions, so
   * the read always answers first — which is exactly why it is pinned here rather than left
   * to that framework detail. See `adopt.ts`.
   */
  it('refuses a read the reader has overtaken, even with the queue already empty', () => {
    assert.equal(readStillStands({ editsAtRead: 3, editsNow: 4, writePending: false }), false)
  })

  /**
   * The race `writePending` exists for, which is the opposite order and which the counter
   * alone cannot see: the read was issued *after* the change — stepping to another song and
   * back — so the counter matches, but the change has not reached the server yet and the
   * answer cannot contain it.
   */
  it('refuses a read taken while this scope was still waiting to be saved', () => {
    assert.equal(readStillStands({ editsAtRead: 4, editsNow: 4, writePending: true }), false)
  })
})

describe('adoptStoredSong', () => {
  const stored = prefs({ semitones: 2, capo: 5, scrollSpeed: 6, favorite: true })

  it('takes the whole stored row when nothing has raced it', () => {
    const adopted = adoptStoredSong({
      stored,
      local: DEFAULT_SONG_PREFS,
      row: untouched,
      star: untouched,
    })

    assert.deepEqual(adopted, stored)
  })

  /**
   * The star and the row are queued apart, so a tapped star says nothing about the capo —
   * and the capo saved last night is still the freshest answer for it. Refusing the whole
   * row here would throw that away.
   */
  it('keeps a star the reader just tapped without discarding their stored capo', () => {
    const adopted = adoptStoredSong({
      stored: prefs({ capo: 5, favorite: false }),
      local: prefs({ capo: 0, favorite: true }),
      row: untouched,
      star: { editsAtRead: 1, editsNow: 2, writePending: true },
    })

    assert.equal(adopted?.capo, 5, 'the stored capo still stands')
    assert.equal(adopted?.favorite, true, 'the tap does not spring back')
  })

  it('keeps a capo the reader just moved without discarding their stored star', () => {
    const adopted = adoptStoredSong({
      stored: prefs({ capo: 5, favorite: true }),
      local: prefs({ capo: 2, favorite: false }),
      row: { editsAtRead: 1, editsNow: 2, writePending: true },
      star: untouched,
    })

    assert.equal(adopted?.capo, 2, 'the reader keeps the fret they just chose')
    assert.equal(adopted?.favorite, true, 'the stored star still stands')
  })

  it('says there is nothing to apply when the reader has overtaken both halves', () => {
    const adopted = adoptStoredSong({
      stored,
      local: prefs({ capo: 1, favorite: false }),
      row: { editsAtRead: 1, editsNow: 2, writePending: false },
      star: { editsAtRead: 1, editsNow: 2, writePending: false },
    })

    assert.equal(adopted, null)
  })

  it('carries the chosen chord shapes across, which are an object and not a scalar', () => {
    const shapes = { 'guitar:C:maj': '032010' }
    const adopted = adoptStoredSong({
      stored: prefs({ chordShapes: shapes }),
      local: DEFAULT_SONG_PREFS,
      row: untouched,
      star: untouched,
    })

    assert.deepEqual(adopted?.chordShapes, shapes)
  })
})
