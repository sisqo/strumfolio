import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromSource } from '../editor/document'
import { alignBlocks, labelFor, reanchorAll } from './reanchor'
import { inReadingOrder, type SongComment } from './types'

function note(id: string, blockIndex: number, charOffset: number, extra: Partial<SongComment> = {}): SongComment {
  return {
    id,
    anchor: { blockIndex, charOffset, target: 'lyric' },
    anchorLabel: '',
    body: 'nota',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...extra,
  }
}

const SONG = ['{title: Amazing Grace}', '', '[G]A[C]mazing [G]grace, how [D]sweet the sound', 'That saved a wretch like me'].join('\n')

test('a line untouched by the edit keeps its anchor', () => {
  const after = SONG.replace('That saved a wretch like me', 'That saved a wretch like me!')
  const [comment] = reanchorAll([note('a', 2, 11)], SONG, after)
  assert.deepEqual(comment.anchor, { blockIndex: 2, charOffset: 11, target: 'lyric' })
})

test('a line inserted above moves the anchor down, which shiftChords alone cannot see', () => {
  const after = SONG.replace('{title: Amazing Grace}', '{title: Amazing Grace}\n{artist: Traditional}')
  const [comment] = reanchorAll([note('a', 2, 11)], SONG, after)
  assert.deepEqual(comment.anchor, { blockIndex: 3, charOffset: 11, target: 'lyric' })
})

test('text inserted before the anchor pushes the offset along', () => {
  const after = SONG.replace('That saved a', 'And that saved a')
  const [comment] = reanchorAll([note('a', 3, 18)], SONG, after)
  // "wretch" sat at 18; four characters arrived before it.
  assert.equal(comment.anchor?.charOffset, 22)
})

test('an edit after the anchor leaves it alone', () => {
  const after = SONG.replace('like me', 'like me now')
  const [comment] = reanchorAll([note('a', 3, 5)], SONG, after)
  assert.equal(comment.anchor?.charOffset, 5)
})

test('the anchored word being rewritten orphans the note instead of collapsing it', () => {
  const after = SONG.replace('wretch', 'sinner')
  const [comment] = reanchorAll([note('a', 3, 18)], SONG, after)
  assert.equal(comment.anchor, null, 'where a chord would collapse to prefix, a comment lets go')
  assert.equal(comment.body, 'nota', 'and keeps its text')
})

test('deleting the line orphans its notes', () => {
  const after = SONG.replace('\nThat saved a wretch like me', '')
  const [comment] = reanchorAll([note('a', 3, 18)], SONG, after)
  assert.equal(comment.anchor, null)
})

test('a line that stops being lyrics orphans its notes', () => {
  const after = SONG.replace('That saved a wretch like me', '{start_of_tab}\ne|--0--|\n{end_of_tab}')
  const [comment] = reanchorAll([note('a', 3, 18)], SONG, after)
  assert.equal(comment.anchor, null)
})

test('a note about a chord orphans when that chord is removed', () => {
  const chordNote = note('a', 2, 0, { anchor: { blockIndex: 2, charOffset: 0, target: 'chord' } })
  const after = SONG.replace('[G]A[C]mazing', 'A[C]mazing')
  const [comment] = reanchorAll([chordNote], SONG, after)
  assert.equal(comment.anchor, null)
})

test('a note about a chord survives an edit elsewhere in the line', () => {
  const chordNote = note('a', 2, 0, { anchor: { blockIndex: 2, charOffset: 0, target: 'chord' } })
  const after = SONG.replace('the sound', 'the sound!')
  const [comment] = reanchorAll([chordNote], SONG, after)
  assert.deepEqual(comment.anchor, { blockIndex: 2, charOffset: 0, target: 'chord' })
})

test('an identical source is returned untouched', () => {
  const before = [note('a', 2, 11)]
  assert.deepEqual(reanchorAll(before, SONG, SONG), before)
})

test('an existing orphan is left alone rather than re-found', () => {
  const orphan = note('a', 0, 0, { anchor: null })
  const after = SONG.replace('wretch', 'sinner')
  const [comment] = reanchorAll([orphan], SONG, after)
  assert.equal(comment.anchor, null)
})

test('two edited lines in one run pair up in order', () => {
  const before = ['uno', 'due'].join('\n')
  const after = ['uno!', 'due!'].join('\n')
  const alignment = alignBlocks(fromSource(before).blocks, fromSource(after).blocks)
  assert.deepEqual([...alignment.edited], [
    [0, 0],
    [1, 1],
  ])
})

test('labelFor names the whole word, not the syllable the anchor snapped to', () => {
  const document = fromSource(SONG)
  // Offset 12 is inside "grace,"; the anchor may snap mid-word but the label must not.
  assert.equal(labelFor(document, { blockIndex: 2, charOffset: 12, target: 'lyric' }), 'grace,')
})

test('labelFor names the chord for a chord anchor', () => {
  const document = fromSource(SONG)
  assert.equal(labelFor(document, { blockIndex: 2, charOffset: 0, target: 'chord' }), 'G')
})

test('reading order is document order with orphans last', () => {
  const ordered = inReadingOrder([
    note('c', 0, 0, { anchor: null, createdAt: '2026-01-01T00:00:00.000Z' }),
    note('b', 3, 2),
    note('a', 2, 9),
  ])
  assert.deepEqual(ordered.map((c) => c.id), ['a', 'b', 'c'])
})
