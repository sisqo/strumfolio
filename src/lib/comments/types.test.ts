import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type CommentAnchor, type SongComment, inReadingOrder, positionFor } from './types'

function note(id: string, blockIndex: number | null, charOffset = 0, createdAt = '2026-01-01'): SongComment {
  return {
    id,
    anchor: blockIndex === null ? null : { blockIndex, charOffset, target: 'lyric' },
    anchorLabel: id,
    body: id,
    createdAt,
    updatedAt: createdAt,
  }
}

function at(blockIndex: number, charOffset: number): CommentAnchor {
  return { blockIndex, charOffset, target: 'lyric' }
}

describe('positionFor', () => {
  it('numbers a note by where it sits in the song, not by how many there are', () => {
    const existing = inReadingOrder([note('b', 5), note('c', 9)])

    // Ahead of both: it takes 1 and pushes the other two down.
    assert.equal(positionFor(existing, at(1, 0)), 1)
    assert.equal(positionFor(existing, at(7, 0)), 2)
    assert.equal(positionFor(existing, at(20, 0)), 3)
  })

  it('orders within a block by offset', () => {
    const existing = inReadingOrder([note('a', 3, 10), note('b', 3, 30)])

    assert.equal(positionFor(existing, at(3, 5)), 1)
    assert.equal(positionFor(existing, at(3, 20)), 2)
    assert.equal(positionFor(existing, at(3, 40)), 3)
  })

  /* Sharing a point makes the new note the younger of the two, and `inReadingOrder`
     breaks that tie by age — so it lands after, not before. */
  it('goes after a note it shares a point with', () => {
    const existing = inReadingOrder([note('a', 2, 8)])

    assert.equal(positionFor(existing, at(2, 8)), 2)
  })

  /* Orphans sort last whatever their age, so they never push an anchored note down. */
  it('ignores notes that have lost their anchor', () => {
    const existing = inReadingOrder([note('gone', null), note('b', 9)])

    assert.equal(positionFor(existing, at(1, 0)), 1)
  })

  it('is 1 when there is nothing to come after', () => {
    assert.equal(positionFor([], at(4, 2)), 1)
  })

  /**
   * The one that matters: the number promised before the note exists has to be the number
   * the badge actually carries afterwards. They are two pieces of code reading one rule,
   * and a disagreement would show as a draft numbered 4 becoming a badge numbered 1.
   */
  it('agrees with the order the badges are numbered by', () => {
    const existing = inReadingOrder([note('a', 1, 0), note('b', 4, 6), note('c', 4, 20), note('gone', null)])

    for (const anchor of [at(0, 0), at(2, 3), at(4, 6), at(4, 12), at(9, 0)]) {
      const fresh = { ...note('new', anchor.blockIndex, anchor.charOffset, '2026-06-01'), id: 'new' }
      const settled = inReadingOrder([...existing, fresh]).findIndex((entry) => entry.id === 'new') + 1

      assert.equal(positionFor(existing, anchor), settled)
    }
  })
})
