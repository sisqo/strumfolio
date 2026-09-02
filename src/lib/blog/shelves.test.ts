import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Category } from './meta'
import type { PostSummary } from './posts'
import { pickReadNext, shelve } from './shelves'

const post = (slug: string, category: Category = 'Guide'): PostSummary => ({
  meta: {
    slug,
    title: slug,
    description: 'A description.',
    date: '2026-09-02',
    category,
    cover: null,
    draft: false,
  },
  readingTime: 4,
})

const slugs = (posts: PostSummary[]) => posts.map((entry) => entry.meta.slug)

describe('shelve', () => {
  it('has nothing to feature before anything is published', () => {
    const { featured, grid, earlier } = shelve([])

    assert.equal(featured, null)
    assert.deepEqual(grid, [])
    assert.deepEqual(earlier, [])
  })

  it('features the first article and shows nothing else', () => {
    const { featured, grid, earlier } = shelve([post('one')])

    assert.equal(featured?.meta.slug, 'one')
    assert.deepEqual(grid, [])
    assert.deepEqual(earlier, [])
  })

  /*
   * The case the thresholds exist for: with two or three articles the row of three would hold
   * one or two cards and read as a card that failed to load. They go to «Earlier» instead,
   * which is a shape that looks right at any length.
   */
  it('leaves the row of three empty until all three exist', () => {
    for (const count of [2, 3]) {
      const posts = Array.from({ length: count }, (_, index) => post(`p${index}`))
      const { grid, earlier } = shelve(posts)

      assert.deepEqual(grid, [], `${count} articles should not open the grid`)
      assert.equal(earlier.length, count - 1)
    }
  })

  it('fills the row once there are four', () => {
    const { featured, grid, earlier } = shelve([post('a'), post('b'), post('c'), post('d')])

    assert.equal(featured?.meta.slug, 'a')
    assert.deepEqual(slugs(grid), ['b', 'c', 'd'])
    assert.deepEqual(earlier, [])
  })

  it('sends the fifth article and beyond to Earlier', () => {
    const posts = ['a', 'b', 'c', 'd', 'e', 'f'].map((slug) => post(slug))
    const { grid, earlier } = shelve(posts)

    assert.deepEqual(slugs(grid), ['b', 'c', 'd'])
    assert.deepEqual(slugs(earlier), ['e', 'f'])
  })

  it('shows every article exactly once, wherever it lands', () => {
    for (let count = 0; count <= 8; count += 1) {
      const posts = Array.from({ length: count }, (_, index) => post(`p${index}`))
      const { featured, grid, earlier } = shelve(posts)

      const shown = [...(featured === null ? [] : [featured]), ...grid, ...earlier]

      assert.deepEqual(slugs(shown), slugs(posts), `${count} articles`)
    }
  })

  it('does not reorder what it was given', () => {
    const posts = [post('newest'), post('older'), post('oldest'), post('ancient')]

    assert.deepEqual(slugs([posts[0], ...shelve(posts).grid]), ['newest', 'older', 'oldest', 'ancient'])
  })
})

describe('pickReadNext', () => {
  it('never offers the article being read', () => {
    const current = post('current')
    const picked = pickReadNext(current, [current, post('other'), post('another')])

    assert.equal(
      picked.some((entry) => entry.meta.slug === 'current'),
      false,
    )
  })

  it('prefers the same category, then falls back to the rest', () => {
    const current = post('current', 'Capo')
    const all = [current, post('a-key', 'Keys'), post('a-capo', 'Capo'), post('a-chord', 'Chords')]

    assert.deepEqual(slugs(pickReadNext(current, all)), ['a-capo', 'a-key'])
  })

  it('fills from other categories when its own has nothing else', () => {
    const current = post('current', 'Capo')
    const all = [current, post('a-key', 'Keys'), post('a-chord', 'Chords')]

    assert.deepEqual(slugs(pickReadNext(current, all)), ['a-key', 'a-chord'])
  })

  it('offers fewer than two rather than repeating one', () => {
    const current = post('current')

    assert.deepEqual(slugs(pickReadNext(current, [current, post('only-other')])), ['only-other'])
    assert.deepEqual(pickReadNext(current, [current]), [])
  })

  it('never returns more than it was asked for', () => {
    const current = post('current')
    const all = [current, ...['a', 'b', 'c', 'd'].map((slug) => post(slug))]

    assert.equal(pickReadNext(current, all).length, 2)
    assert.equal(pickReadNext(current, all, 3).length, 3)
  })
})
