import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Song } from '@/lib/data'

import { favoritesSeries, seriesOf, siblingsOf } from './series'

function song(slug: string, songbookSlug: string): Song {
  return {
    slug,
    title: slug,
    artist: null,
    tags: [],
    link1: null,
    link2: null,
    link3: null,
    songbookSlug,
    sectionId: 1,
    body: '',
    updatedAt: null,
  }
}

describe('seriesOf', () => {
  it('finds the previous and next song in the same songbook, in list order', () => {
    const songs = [song('a', 'book'), song('b', 'book'), song('c', 'book')]

    assert.deepEqual(seriesOf(songs[1], songs), { position: 2, total: 3, previous: 'a', next: 'c' })
  })

  it('has no previous at the start and no next at the end', () => {
    const songs = [song('a', 'book'), song('b', 'book')]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
    assert.deepEqual(seriesOf(songs[1], songs), { position: 2, total: 2, previous: 'a', next: null })
  })

  it('crosses section boundaries: the songbook is one sequence, not one per section', () => {
    const songs = [
      { ...song('a', 'book'), sectionId: 1 },
      { ...song('b', 'book'), sectionId: 2 },
    ]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
  })

  it('returns null for a songbook holding only this one song', () => {
    const songs = [song('a', 'book'), song('x', 'other-book')]

    assert.equal(seriesOf(songs[1], songs), null)
  })

  it('ignores songs from other songbooks entirely', () => {
    const songs = [song('a', 'book'), song('x', 'other-book'), song('b', 'book'), song('y', 'other-book')]

    assert.deepEqual(seriesOf(songs[0], songs), { position: 1, total: 2, previous: null, next: 'b' })
  })
})

describe('siblingsOf', () => {
  it('gives the songbook in list order, and nothing from any other', () => {
    const songs = [song('a', 'book'), song('x', 'other'), song('b', 'book')]

    assert.deepEqual(siblingsOf(songs[0], songs), ['a', 'b'])
  })
})

describe('favoritesSeries', () => {
  const siblings = ['a', 'b', 'c', 'd', 'e']

  it('steps between starred songs only, keeping the songbook\'s own order', () => {
    const resolved = favoritesSeries(siblings, new Set(['b', 'd', 'e']), 'd')

    assert.deepEqual(resolved, { position: 2, total: 3, previous: 'b', next: 'e' })
  })

  it('has no previous at the first favorite and no next at the last', () => {
    const favorites = new Set(['b', 'd'])

    assert.deepEqual(favoritesSeries(siblings, favorites, 'b'), {
      position: 1,
      total: 2,
      previous: null,
      next: 'd',
    })
    assert.deepEqual(favoritesSeries(siblings, favorites, 'd'), {
      position: 2,
      total: 2,
      previous: 'b',
      next: null,
    })
  })

  /**
   * The fallback that keeps the arrows meaningful: reached from a link or from "Recently
   * played", or starred and then unstarred while being read, the song is not in the
   * sequence at all — and arrows into a list this song is not part of would be arrows to
   * nowhere the reader can relate to where they are.
   */
  it('refuses a sequence the song being read is not part of', () => {
    assert.equal(favoritesSeries(siblings, new Set(['b', 'd']), 'c'), null)
  })

  it('refuses a sequence of one, like the songbook one it narrows', () => {
    assert.equal(favoritesSeries(siblings, new Set(['c']), 'c'), null)
  })

  it('refuses a sequence when nothing is starred at all', () => {
    assert.equal(favoritesSeries(siblings, new Set(), 'c'), null)
  })
})
