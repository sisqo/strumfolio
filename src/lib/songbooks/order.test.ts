import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type Band,
  applyOrder,
  arrangementKey,
  moveItem,
  moveSongTo,
  moveToSlot,
  nudgeSong,
  placeAfter,
  placeAtSlot,
  placesOf,
  rowsOf,
  sameMembers,
  slotAt,
} from './order'

describe('moving one song to another place', () => {
  const list = ['a', 'b', 'c', 'd']

  it('carries it down the list', () => {
    assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd'])
  })

  it('and up it', () => {
    assert.deepEqual(moveItem(list, 3, 1), ['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone when it lands where it started', () => {
    assert.equal(moveItem(list, 2, 2), list)
  })

  it('stops at the ends instead of falling off them', () => {
    assert.deepEqual(moveItem(list, 1, -3), ['b', 'a', 'c', 'd'])
    assert.deepEqual(moveItem(list, 1, 9), ['a', 'c', 'd', 'b'])
  })

  it('never mutates what it was given', () => {
    const before = [...list]
    moveItem(list, 0, 3)
    assert.deepEqual(list, before)
  })
})

describe('moving an item into a gap of the list as it was drawn', () => {
  const list = ['a', 'b', 'c', 'd']

  it('lands below the rows it passed going down', () => {
    assert.deepEqual(moveToSlot(list, 0, 3), ['b', 'c', 'a', 'd'])
  })

  it('and above them going up', () => {
    assert.deepEqual(moveToSlot(list, 3, 1), ['a', 'd', 'b', 'c'])
  })

  it('leaves the list alone from either gap around its own row', () => {
    assert.equal(moveToSlot(list, 2, 2), list)
    assert.equal(moveToSlot(list, 2, 3), list)
  })

  it('reaches both ends', () => {
    assert.deepEqual(moveToSlot(list, 1, 0), ['b', 'a', 'c', 'd'])
    assert.deepEqual(moveToSlot(list, 1, 4), ['a', 'c', 'd', 'b'])
  })
})

describe('whether two lists hold the same songs', () => {
  it('says yes to a reordering', () => {
    assert.equal(sameMembers(['a', 'b', 'c'], ['c', 'a', 'b']), true)
  })

  it('says no to a missing one, an extra one, or a swap', () => {
    assert.equal(sameMembers(['a', 'b'], ['a']), false)
    assert.equal(sameMembers(['a'], ['a', 'b']), false)
    assert.equal(sameMembers(['a', 'b'], ['a', 'c']), false)
  })

  it('is not fooled by a repeat', () => {
    // Two lists of the same length holding the same *set* but not the same members.
    assert.equal(sameMembers(['a', 'a', 'b'], ['a', 'b', 'b']), false)
  })

  it('says yes to two empty lists', () => {
    assert.equal(sameMembers([], []), true)
  })
})

describe('putting a saved order back into the whole list', () => {
  /** Two songbooks interleaved, which is what a list sorted some other way looks like. */
  const all = [
    { slug: 'a1' },
    { slug: 'b1' },
    { slug: 'a2' },
    { slug: 'b2' },
    { slug: 'a3' },
  ]

  it('refills the slots of the songs it was given', () => {
    assert.deepEqual(
      applyOrder(all, ['a3', 'a1', 'a2']).map((item) => item.slug),
      ['a3', 'b1', 'a1', 'b2', 'a2'],
    )
  })

  it('leaves the other songbook exactly where it was', () => {
    const after = applyOrder(all, ['a3', 'a2', 'a1'])
    assert.equal(after[1].slug, 'b1')
    assert.equal(after[3].slug, 'b2')
  })

  it('refuses an order that names something the list has not got', () => {
    assert.equal(applyOrder(all, ['a1', 'a2', 'zz']), all)
  })

  it('rearranges only the names it was given, in their own slots', () => {
    /*
     * A short list is not an error here: this function cannot know that `a2` belongs
     * to the same songbook as `a1` and `a3`. Refusing a partial order is the
     * server's job, where the songbook's real membership is known — see the `stale`
     * check in `arrangeSongbook`.
     */
    assert.deepEqual(
      applyOrder(all, ['a3', 'a1']).map((item) => item.slug),
      ['a3', 'b1', 'a2', 'b2', 'a1'],
    )
  })
})

describe('where an imported song lands', () => {
  it('carries on from the end of a songbook already in order', () => {
    const existing = [
      { slug: 'a', position: 1 },
      { slug: 'b', position: 2 },
    ]

    assert.deepEqual(placeAfter(existing, ['new']), [{ slug: 'new', position: 3 }])
  })

  it('keeps two imported songs in the order they were pasted', () => {
    assert.deepEqual(placeAfter([{ slug: 'a', position: 1 }], ['x', 'y']), [
      { slug: 'x', position: 2 },
      { slug: 'y', position: 3 },
    ])
  })

  it('numbers a songbook nobody has arranged, in the order it is shown', () => {
    /*
     * The alternative — leaving these null and numbering only the newcomer — would
     * put the new song *first*, because null sorts last. So the order on screen
     * becomes explicit, and the new song goes under it.
     */
    const existing = [
      { slug: 'calendar-man', position: null },
      { slug: 'spada', position: null },
      { slug: 'yattaman', position: null },
    ]

    assert.deepEqual(placeAfter(existing, ['new']), [
      { slug: 'calendar-man', position: 1 },
      { slug: 'spada', position: 2 },
      { slug: 'yattaman', position: 3 },
      { slug: 'new', position: 4 },
    ])
  })

  it('repairs a songbook that is numbered but not 1..N', () => {
    // Gaps and a stray null both mean the same thing: renumber, then append.
    assert.deepEqual(placeAfter([{ slug: 'a', position: 1 }, { slug: 'b', position: 5 }], ['x']), [
      { slug: 'a', position: 1 },
      { slug: 'b', position: 2 },
      { slug: 'x', position: 3 },
    ])
    assert.deepEqual(placeAfter([{ slug: 'a', position: 1 }, { slug: 'b', position: null }], ['x']), [
      { slug: 'a', position: 1 },
      { slug: 'b', position: 2 },
      { slug: 'x', position: 3 },
    ])
  })

  it('gives the first song of an empty songbook the first place', () => {
    assert.deepEqual(placeAfter([], ['only']), [{ slug: 'only', position: 1 }])
  })
})

describe('which gap between rows the finger is in', () => {
  /** Three rows of unequal height, as a song with an artist is taller than one without. */
  const bands: Band[] = [
    { top: 100, bottom: 140 },
    { top: 140, bottom: 200 },
    { top: 200, bottom: 240 },
  ]

  it('is the gap above a row until its middle, and the one below it from there', () => {
    assert.equal(slotAt(bands, 110), 0)
    assert.equal(slotAt(bands, 150), 1)
    assert.equal(slotAt(bands, 190), 2)
    assert.equal(slotAt(bands, 230), 3)
  })

  it('gives a middle to the gap below it, so the two never both claim it', () => {
    assert.equal(slotAt(bands, 120), 1)
    assert.equal(slotAt(bands, 220), 3)
  })

  it('names the ends for a point above the first row or below the last', () => {
    assert.equal(slotAt(bands, -500), 0)
    assert.equal(slotAt(bands, 5000), 3)
  })

  it('answers something for an empty list', () => {
    assert.equal(slotAt([], 42), 0)
  })
})

describe('the rows of an arrangement', () => {
  it('draws a heading, then its songs', () => {
    assert.deepEqual(
      rowsOf([
        { sectionId: 1, slugs: ['a', 'b'] },
        { sectionId: 2, slugs: ['c'] },
      ]),
      [
        { kind: 'section', sectionId: 1 },
        { kind: 'song', sectionId: 1, slug: 'a' },
        { kind: 'song', sectionId: 1, slug: 'b' },
        { kind: 'section', sectionId: 2 },
        { kind: 'song', sectionId: 2, slug: 'c' },
      ],
    )
  })

  /** A section nothing can be dropped into is a section that can never be filled. */
  it('gives an empty section a line of its own to be dropped into', () => {
    assert.deepEqual(rowsOf([{ sectionId: 7, slugs: [] }]), [
      { kind: 'section', sectionId: 7 },
      { kind: 'gap', sectionId: 7 },
    ])
  })
})

describe('where a song lands when it is let go in a gap', () => {
  const groups = [
    { sectionId: 1, slugs: ['a', 'b', 'c'] },
    { sectionId: 2, slugs: ['x', 'y'] },
    { sectionId: 3, slugs: [] },
  ]
  /** Rows 0..8: §1 a b c §2 x y §3 gap — so gap 4 sits over §2 and gap 5 under it. */
  const rows = rowsOf(groups)

  it('goes to the top of a section from the gap under its heading', () => {
    assert.deepEqual(placeAtSlot(rows, 'a', 5), { sectionId: 2, index: 0 })
  })

  it('and to the end of the section before from the gap over it', () => {
    const place = placeAtSlot(rows, 'x', 4)
    assert.deepEqual(place, { sectionId: 1, index: 3 })
    assert.deepEqual(moveSongTo(groups, 'x', place!)[0].slugs, ['a', 'b', 'c', 'x'])
  })

  it('reaches the end of another section, below its last song', () => {
    const after = moveSongTo(groups, 'a', placeAtSlot(rows, 'a', 7)!)
    assert.deepEqual(after[0].slugs, ['b', 'c'])
    assert.deepEqual(after[1].slugs, ['x', 'y', 'a'])
  })

  it('lands below the row it passed going down, as dragging in one list does', () => {
    const place = placeAtSlot(rows, 'a', 3)
    assert.deepEqual(moveSongTo(groups, 'a', place!)[0].slugs, ['b', 'a', 'c'])
  })

  it('and above it going up', () => {
    const place = placeAtSlot(rows, 'c', 2)
    assert.deepEqual(moveSongTo(groups, 'c', place!)[0].slugs, ['a', 'c', 'b'])
  })

  it('lands above the song it stopped over when it comes from another section', () => {
    const after = moveSongTo(groups, 'a', placeAtSlot(rows, 'a', 6)!)
    assert.deepEqual(after[1].slugs, ['x', 'a', 'y'])
  })

  it('moves nothing from either gap around its own row', () => {
    for (const slot of [2, 3]) {
      const place = placeAtSlot(rows, 'b', slot)
      assert.deepEqual(moveSongTo(groups, 'b', place!)[0].slugs, ['a', 'b', 'c'])
    }
  })

  it('fills an empty section from the gap under its heading or under its placeholder', () => {
    assert.deepEqual(placeAtSlot(rows, 'a', 8), { sectionId: 3, index: 0 })
    assert.deepEqual(placeAtSlot(rows, 'a', 9), { sectionId: 3, index: 0 })
  })

  it('treats the gap above the first heading as the top of the first section', () => {
    assert.deepEqual(placeAtSlot(rows, 'y', 0), { sectionId: 1, index: 0 })
  })

  it('has nothing to say about no rows at all', () => {
    assert.equal(placeAtSlot([], 'a', 0), null)
  })
})

describe('moving a song to a place', () => {
  const groups = [
    { sectionId: 1, slugs: ['a', 'b'] },
    { sectionId: 2, slugs: ['x'] },
  ]

  it('empties a section it was the last song of', () => {
    const after = moveSongTo([{ sectionId: 1, slugs: ['a'] }, { sectionId: 2, slugs: [] }], 'a', {
      sectionId: 2,
      index: 0,
    })

    assert.deepEqual(after[0].slugs, [])
    assert.deepEqual(after[1].slugs, ['a'])
  })

  it('clamps a place past the end instead of dropping the song', () => {
    const after = moveSongTo(groups, 'a', { sectionId: 2, index: 99 })
    assert.deepEqual(after[1].slugs, ['x', 'a'])
  })

  it('leaves the arrangement alone for a song that is nowhere in it', () => {
    assert.equal(moveSongTo(groups, 'ghost', { sectionId: 1, index: 0 }), groups)
  })

  it('leaves it alone for a section that is not there', () => {
    assert.equal(moveSongTo(groups, 'a', { sectionId: 9, index: 0 }), groups)
  })

  it('never mutates what it was given', () => {
    const before = arrangementKey(groups)
    moveSongTo(groups, 'a', { sectionId: 2, index: 0 })
    assert.equal(arrangementKey(groups), before)
  })
})

describe('stepping a song with the arrow keys', () => {
  const groups = [
    { sectionId: 1, slugs: ['a', 'b'] },
    { sectionId: 2, slugs: ['x', 'y'] },
  ]

  it('moves it down inside its section', () => {
    assert.deepEqual(nudgeSong(groups, 'a', 1)[0].slugs, ['b', 'a'])
  })

  /**
   * The last place of a section and the first of the next are the same gap on screen but
   * two different answers, so crossing a heading takes one press each way — and neither
   * press does nothing, because the heading sits between them.
   */
  it('crosses into the next section when it runs out of places', () => {
    const atEnd = nudgeSong(groups, 'a', 1)
    const crossed = nudgeSong(atEnd, 'a', 1)

    assert.deepEqual(crossed[0].slugs, ['b'])
    assert.deepEqual(crossed[1].slugs, ['a', 'x', 'y'])
  })

  it('comes back up the same way', () => {
    const down = nudgeSong(nudgeSong(groups, 'a', 1), 'a', 1)
    const back = nudgeSong(down, 'a', -1)

    assert.deepEqual(back[0].slugs, ['b', 'a'])
    assert.deepEqual(back[1].slugs, ['x', 'y'])
  })

  it('stops at the top and at the bottom', () => {
    assert.equal(arrangementKey(nudgeSong(groups, 'a', -1)), arrangementKey(groups))
    assert.equal(arrangementKey(nudgeSong(groups, 'y', 1)), arrangementKey(groups))
  })

  it('steps into an empty section rather than over it', () => {
    const withEmpty = [
      { sectionId: 1, slugs: ['a'] },
      { sectionId: 2, slugs: [] },
    ]
    const after = nudgeSong(withEmpty, 'a', 1)

    assert.deepEqual(after[0].slugs, [])
    assert.deepEqual(after[1].slugs, ['a'])
  })

  it('says where every place is, one per gap plus the end of each section', () => {
    assert.deepEqual(placesOf(groups, 'a'), [
      { sectionId: 1, index: 0 },
      { sectionId: 1, index: 1 },
      { sectionId: 2, index: 0 },
      { sectionId: 2, index: 1 },
      { sectionId: 2, index: 2 },
    ])
  })
})

describe('two arrangements as one string', () => {
  it('tells the same layout from a different one', () => {
    const one = [{ sectionId: 1, slugs: ['a', 'b'] }]
    assert.equal(arrangementKey(one), arrangementKey([{ sectionId: 1, slugs: ['a', 'b'] }]))
    assert.notEqual(arrangementKey(one), arrangementKey([{ sectionId: 1, slugs: ['b', 'a'] }]))
  })

  it('tells two sections apart from one with everything in it', () => {
    assert.notEqual(
      arrangementKey([{ sectionId: 1, slugs: ['a', 'b'] }]),
      arrangementKey([
        { sectionId: 1, slugs: ['a'] },
        { sectionId: 2, slugs: ['b'] },
      ]),
    )
  })
})
