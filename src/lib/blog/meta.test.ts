import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CATEGORIES, byNewest, isCalendarDate, isCategory, isValidSlug, parsePostMeta } from './meta'

/** The smallest article that passes, for tests that vary one field at a time. */
const valid = {
  title: 'What ChordPro is, and why your lyrics should live in it',
  description: 'A plain-text format for lyrics and chords that every app can read, explained in five minutes.',
  date: '2026-09-02',
  category: 'Guide',
}

describe('parsePostMeta', () => {
  it('accepts an article that declares only what is required', () => {
    const meta = parsePostMeta('chordpro-explained', valid)

    assert.equal(meta.slug, 'chordpro-explained')
    assert.equal(meta.title, valid.title)
    assert.equal(meta.category, 'Guide')
    assert.equal(meta.cover, null)
    assert.equal(meta.draft, false)
  })

  it('takes the slug from the file, never from the meta block', () => {
    const meta = parsePostMeta('the-real-slug', { ...valid, slug: 'a-different-one' })

    assert.equal(meta.slug, 'the-real-slug')
  })

  it('names the file in the error, since that is what has to be fixed', () => {
    assert.throws(
      () => parsePostMeta('capo-explained', { ...valid, title: '' }),
      /content\/blog\/capo-explained\.mdx/,
    )
  })

  for (const field of ['title', 'description', 'date', 'category']) {
    it(`refuses an article with no ${field}`, () => {
      const missing = { ...valid, [field]: undefined }

      assert.throws(() => parsePostMeta('a-post', missing), new RegExp(`\`${field}\``))
    })
  }

  it('refuses a meta block that is not there at all', () => {
    assert.throws(() => parsePostMeta('a-post', undefined), /export const meta/)
    assert.throws(() => parsePostMeta('a-post', null), /export const meta/)
  })

  /*
   * The check that earns this module its existence: a date `tsc` would never look at, in a
   * file `tsc` does not read, that `new Date` accepts by rolling it forward into March.
   */
  it('refuses a date that is not a real day', () => {
    assert.throws(() => parsePostMeta('a-post', { ...valid, date: '2026-02-31' }), /real date/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, date: '2026-13-01' }), /real date/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, date: '2 September 2026' }), /real date/)
  })

  it('refuses a description too long to be read in a search result', () => {
    const tooLong = { ...valid, description: 'x'.repeat(161) }

    assert.throws(() => parsePostMeta('a-post', tooLong), /161 characters/)
  })

  it('accepts a description exactly at the limit', () => {
    const atLimit = { ...valid, description: 'x'.repeat(160) }

    assert.equal(parsePostMeta('a-post', atLimit).description.length, 160)
  })

  it('refuses a file name that would make an ugly URL', () => {
    assert.throws(() => parsePostMeta('My Post', valid), /lowercase words joined by hyphens/)
    assert.throws(() => parsePostMeta('Capo_Explained', valid), /lowercase words joined by hyphens/)
  })

  /*
   * The closed list earns its keep here: every one of these would render as a label the
   * design prints in small caps beside the headline, and every one is a mistake a free-text
   * field would have shipped without a word.
   */
  it('refuses a category outside the list, however close', () => {
    assert.throws(() => parsePostMeta('a-post', { ...valid, category: 'Chord' }), /must be one of/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, category: 'capo' }), /must be one of/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, category: 'Tutorial' }), /must be one of/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, category: 42 }), /must be one of/)
  })

  /* Read off `CATEGORIES` rather than retyped: a list written twice is a list that goes
   * stale the first time a category is added, and the message is the whole point of the
   * check — it has to name what is actually allowed today. */
  it('names the allowed categories in the error, so the fix needs no source diving', () => {
    assert.throws(
      () => parsePostMeta('a-post', { ...valid, category: 'Nope' }),
      new RegExp(CATEGORIES.join(', ')),
    )
  })

  it('keeps every category the list allows', () => {
    for (const category of CATEGORIES) {
      assert.equal(parsePostMeta('a-post', { ...valid, category }).category, category)
    }
  })

  it('refuses a cover that is not an absolute path', () => {
    assert.throws(() => parsePostMeta('a-post', { ...valid, cover: 'blog/x.webp' }), /absolute path/)
    assert.throws(() => parsePostMeta('a-post', { ...valid, cover: 42 }), /absolute path/)
  })

  it('refuses a draft flag that is not a boolean', () => {
    assert.throws(() => parsePostMeta('a-post', { ...valid, draft: 'yes' }), /true or false/)
  })
})

describe('isCalendarDate', () => {
  it('accepts real days and refuses everything else', () => {
    assert.equal(isCalendarDate('2026-09-02'), true)
    assert.equal(isCalendarDate('2024-02-29'), true, 'a leap day is a real day')

    assert.equal(isCalendarDate('2025-02-29'), false, '2025 is not a leap year')
    assert.equal(isCalendarDate('2026-9-2'), false)
    assert.equal(isCalendarDate(''), false)
  })
})

describe('isCategory', () => {
  it('is the closed list and nothing else', () => {
    for (const category of CATEGORIES) assert.equal(isCategory(category), true, category)

    assert.equal(isCategory('guide'), false)
    assert.equal(isCategory('Chord'), false)
    assert.equal(isCategory(''), false)
  })
})

describe('isValidSlug', () => {
  it('is what a URL can carry without being escaped', () => {
    assert.equal(isValidSlug('chordpro-explained'), true)
    assert.equal(isValidSlug('capo'), true)
    assert.equal(isValidSlug('play-in-any-key-2026'), true)

    assert.equal(isValidSlug('Chordpro'), false)
    assert.equal(isValidSlug('two words'), false)
    assert.equal(isValidSlug('trailing-'), false)
    assert.equal(isValidSlug('double--hyphen'), false)
  })
})

describe('byNewest', () => {
  it('puts the most recent first', () => {
    const sorted = byNewest([
      { slug: 'older', date: '2026-01-01' },
      { slug: 'newest', date: '2026-09-02' },
      { slug: 'middle', date: '2026-05-05' },
    ])

    assert.deepEqual(
      sorted.map((post) => post.slug),
      ['newest', 'middle', 'older'],
    )
  })

  /* Two articles the same day must not come out in file system order, which differs between
   * this machine and the build container — see the function's own comment. */
  it('breaks a tie by slug, so two builds agree', () => {
    const sorted = byNewest([
      { slug: 'zebra', date: '2026-09-02' },
      { slug: 'apple', date: '2026-09-02' },
    ])

    assert.deepEqual(
      sorted.map((post) => post.slug),
      ['apple', 'zebra'],
    )
  })

  it('leaves the array it was given alone', () => {
    const original = [
      { slug: 'a', date: '2026-01-01' },
      { slug: 'b', date: '2026-09-02' },
    ]
    byNewest(original)

    assert.equal(original[0].slug, 'a')
  })
})
