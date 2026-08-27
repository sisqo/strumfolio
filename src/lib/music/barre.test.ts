import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { type Barre, barresOf, underBarre } from './barre'
import type { Fret } from './shapes'

/** `3121` and `x24432` — how a chart writes a shape, and how a player says it aloud. */
function read(text: string): Fret[] {
  return [...text].map((character) => (character === 'x' ? null : Number(character)))
}

/** `{ fret, from, to }` is a mouthful in a table; `1:1-3` is the same thing. */
function write(barres: Barre[]): string[] {
  return barres.map((barre) => `${barre.fret}:${barre.from}-${barre.to}`)
}

describe('where a chart draws a bar', () => {
  /**
   * The shapes that decide the rule, each one a case that a simpler test gets wrong.
   *
   * `F#` on a ukulele is the one that prompted all of this: two strings at the first
   * fret with a third fretted higher *between* them, which is unmistakably one finger
   * laid flat and which a "three or more strings on the fret" test misses entirely.
   */
  const UKULELE: [string, string, string[]][] = [
    ['F#', '3121', ['1:1-3']],
    ['Bb', '3211', ['1:2-3']],
    ['B', '4322', ['2:2-3']],
    ['Bbm', '3111', ['1:1-3']],
    ['Bm', '4222', ['2:1-3']],
    ['C#', '1114', ['1:0-2']],
    ['Gm7', '0211', ['1:2-3']],
    ['Fm7', '1313', ['1:0-2']],
    ['Bb7', '1211', ['1:0-3']],
    // Not adjacent, and the string between them is fretted higher: still one finger.
    ['Cdim7', '2323', ['2:0-2']],
    // Four strings on one fret is a bar with nothing above it to prove it.
    ['C#6', '1111', ['1:0-3']],
    ['Cm7', '3333', ['3:0-3']],
    // The bar is above the lowest fret, not on it — one finger below, three across.
    ['E', '4442', ['4:0-2']],
    // Three fingers side by side, which is what these actually are.
    ['D', '2220', []],
    ['Cm', '0333', []],
    ['Em7', '0202', []],
    ['Am', '2000', []],
    ['C', '0003', []],
    ['F', '2010', []],
  ]

  const GUITAR: [string, string, string[]][] = [
    ['F', '133211', ['1:0-5']],
    ['Fm7', '131111', ['1:0-5']],
    ['Bm', 'x24432', ['2:1-5']],
    // Index bar underneath, ring bar on top: two bars in one shape.
    ['B', 'x24442', ['2:1-5', '4:2-4']],
    ['Bb', 'x13331', ['1:1-5', '3:2-4']],
    // One finger at the first fret is not a bar; the four above it are.
    ['Bb6', 'x13333', ['3:2-5']],
    ['C6', 'x35555', ['5:2-5']],
    ['Fsus4', '133311', ['1:0-5', '3:1-3']],
    ['A6', 'x02222', ['2:2-5']],
    // The chord `shapes.ts` names as the reason not to decide by looks alone.
    ['A', 'x02220', []],
    // A bar here would press the open G string in the middle of it.
    ['Em6', '022020', []],
    ['Am7b5', 'x0101x', []],
    ['C', 'x32010', []],
    ['G', '320003', []],
    ['E', '022100', []],
  ]

  for (const [instrument, table] of [
    ['ukulele', UKULELE],
    ['guitar', GUITAR],
  ] as const) {
    for (const [token, shape, expected] of table) {
      it(`${instrument} ${token} (${shape})`, () => {
        assert.deepEqual(write(barresOf(read(shape))), expected)
      })
    }
  }

  it('has nothing to bar in a shape played entirely open', () => {
    assert.deepEqual(barresOf(read('0000')), [])
    assert.deepEqual(barresOf(read('x00000')), [])
  })

  it('allows a muted string inside a bar, and refuses an open one', () => {
    // The finger lying across the string is often *why* it is silent.
    assert.deepEqual(write(barresOf([1, null, 2, 1])), ['1:0-3'])
    assert.deepEqual(write(barresOf([1, 0, 2, 1])), [])
  })

  it('lists the lower bar first, so the index finger is drawn under the ring', () => {
    const barres = barresOf(read('x24442'))
    assert.equal(barres.length, 2)
    assert.ok(barres[0].fret < barres[1].fret)
  })
})

describe('underBarre', () => {
  const barres = barresOf(read('3121'))

  it('covers the strings the finger is actually on', () => {
    assert.equal(underBarre(barres, 1, 1), true)
    assert.equal(underBarre(barres, 3, 1), true)
  })

  it('covers the string it passes under on its way', () => {
    // The E string is inside the span, so no dot belongs at the first fret on it —
    // its own dot is at the second, which is a different fret and still drawn.
    assert.equal(underBarre(barres, 2, 1), true)
    assert.equal(underBarre(barres, 2, 2), false)
  })

  it('leaves the string fretted above it alone', () => {
    assert.equal(underBarre(barres, 0, 3), false)
  })
})
