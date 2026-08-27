import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseChord } from './chord'
import { mod12 } from './notes'
import {
  FAMILIES,
  INSTRUMENTS,
  type Instrument,
  candidates,
  chordNoteNames,
  familyOf,
  shapeFor,
  shapeNotes,
} from './shapes'

/**
 * Checks a shape really is a voicing of the chord it is filed under.
 *
 * Two directions, and both matter. No foreign note, or the shape is a different
 * chord; and every required tone present, or it is not that chord either — a
 * root and a fifth fit inside major, minor and seventh alike.
 */
function assertVoicing(
  root: number,
  family: string,
  frets: (number | null)[],
  where: string,
  instrument: Instrument = 'guitar',
) {
  const spec = FAMILIES[family]
  const allowed = new Set(spec.intervals.map((interval) => mod12(root + interval)))
  const sounded = new Set(shapeNotes(frets, instrument))

  for (const note of sounded) {
    assert.ok(allowed.has(note), `${where}: note ${note} is not in ${family || 'major'}`)
  }
  for (const interval of spec.required) {
    assert.ok(
      sounded.has(mod12(root + interval)),
      `${where}: missing the interval ${interval} of ${family || 'major'}`,
    )
  }
}

describe('every shape is a voicing of its chord', () => {
  for (const instrument of INSTRUMENTS) {
    it(`holds for all twelve roots of every family: ${instrument}`, () => {
      let checked = 0

      for (const family of Object.keys(FAMILIES)) {
        for (let root = 0; root < 12; root += 1) {
          candidates(root, family, instrument).forEach((frets, index) => {
            assertVoicing(
              root,
              family,
              frets,
              `${instrument} ${root}:${family || 'major'} candidate ${index}`,
              instrument,
            )
            checked += 1
          })
        }
      }

      // Guards against the loop silently covering nothing.
      assert.ok(checked > 200, `only ${checked} shapes checked for ${instrument}`)
    })
  }

  /**
   * How much of the table each instrument covers, stated rather than assumed.
   *
   * Four strings cannot hold every chord: a minor ninth needs four distinct tones, so
   * one root of the twelve has no voicing within reach and `shapeFor` says so instead
   * of drawing something that is not the chord. A drop below these numbers is a
   * regression; a rise means a fingering was found where there was none.
   */
  it('covers what each instrument can actually hold', () => {
    const covered = (instrument: Instrument) => {
      let found = 0
      for (const family of Object.keys(FAMILIES)) {
        for (let root = 0; root < 12; root += 1) {
          if (candidates(root, family, instrument).length > 0) found += 1
        }
      }
      return found
    }

    const all = Object.keys(FAMILIES).length * 12
    assert.equal(covered('guitar'), all)
    assert.equal(covered('ukulele'), all - 1)
  })

  it('never asks for a fret past the twelfth or a negative one', () => {
    for (const instrument of INSTRUMENTS) {
      for (const family of Object.keys(FAMILIES)) {
        for (let root = 0; root < 12; root += 1) {
          const shape = shapeFor(
            { root, rootName: 'C', suffix: family, bass: null, bassName: null },
            instrument,
          )
          if (shape === null) continue

          for (const fret of shape.frets) {
            if (fret === null) continue
            const limit = instrument === 'ukulele' ? 12 : 15
            assert.ok(
              fret >= 0 && fret <= limit,
              `${instrument} ${root}:${family} reaches fret ${fret}`,
            )
          }
        }
      }
    }
  })
})

describe('the ukulele shapes a player would recognise', () => {
  /**
   * The search is only trustworthy if it finds the chords everybody already knows.
   * These are the shapes printed on the first page of any ukulele book, and none of
   * them is written down in the source: they are what the scoring produces.
   */
  const CANONICAL: [string, (number | null)[]][] = [
    ['C', [0, 0, 0, 3]],
    ['C7', [0, 0, 0, 1]],
    ['Cmaj7', [0, 0, 0, 2]],
    ['Cm', [0, 3, 3, 3]],
    ['D', [2, 2, 2, 0]],
    ['Dm', [2, 2, 1, 0]],
    ['D7', [2, 2, 2, 3]],
    ['E7', [1, 2, 0, 2]],
    ['F', [2, 0, 1, 0]],
    ['Fm', [1, 0, 1, 3]],
    // A bar at the first fret with two fingers above it — see `barresOf`, which is
    // what draws it that way; the shape itself was always this.
    ['F#', [3, 1, 2, 1]],
    ['G', [0, 2, 3, 2]],
    ['G7', [0, 2, 1, 2]],
    ['Gm', [0, 2, 3, 1]],
    ['A', [2, 1, 0, 0]],
    ['Am', [2, 0, 0, 0]],
    ['A7', [0, 1, 0, 0]],
    ['Am7', [0, 0, 0, 0]],
    ['Bb', [3, 2, 1, 1]],
    ['B', [4, 3, 2, 2]],
    ['Bm', [4, 2, 2, 2]],
    ['B7', [2, 3, 2, 2]],
  ]

  for (const [token, frets] of CANONICAL) {
    it(`draws ${token} the way it is taught`, () => {
      const chord = parseChord(token)
      assert.ok(chord !== null)
      assert.deepEqual(shapeFor(chord, 'ukulele')?.frets, frets)
    })
  }
})

describe('shapeFor', () => {
  const shapeOf = (token: string) => {
    const chord = parseChord(token)
    assert.ok(chord !== null, `${token} did not parse`)
    return shapeFor(chord)
  }

  it('answers the open position for the chords that have one', () => {
    assert.deepEqual(shapeOf('C')?.frets, [null, 3, 2, 0, 1, 0])
    assert.deepEqual(shapeOf('G')?.frets, [3, 2, 0, 0, 0, 3])
    assert.deepEqual(shapeOf('D')?.frets, [null, null, 0, 2, 3, 2])
    assert.deepEqual(shapeOf('Dm')?.frets, [null, null, 0, 2, 3, 1])
    assert.deepEqual(shapeOf('E')?.frets, [0, 2, 2, 1, 0, 0])
    assert.deepEqual(shapeOf('Am')?.frets, [null, 0, 2, 2, 1, 0])
  })

  it('picks the lower of the two movable forms', () => {
    // Bb major: sixth-string form sits at the sixth fret, fifth-string at the first.
    assert.deepEqual(shapeOf('Bb')?.frets, [null, 1, 3, 3, 3, 1])
    // F major has no open shape, and the sixth-string form is the first fret.
    assert.deepEqual(shapeOf('F')?.frets, [1, 3, 3, 2, 1, 1])
  })

  it('reads an enharmonic spelling as the same chord', () => {
    assert.deepEqual(shapeOf('A#m')?.frets, shapeOf('Bbm')?.frets)
  })

  it('keeps the shape of the base chord for a slash chord', () => {
    assert.deepEqual(shapeOf('C/G')?.frets, shapeOf('C')?.frets)
  })

  it('has nothing to draw for a suffix outside the table', () => {
    assert.equal(shapeOf('Calt'), null)
  })
})

describe('familyOf', () => {
  it('passes through what the table already carries', () => {
    assert.deepEqual(familyOf('m7'), { family: 'm7', simplified: false })
    assert.deepEqual(familyOf(''), { family: '', simplified: false })
    assert.deepEqual(familyOf('sus4'), { family: 'sus4', simplified: false })
  })

  it('normalises the spellings the parser leaves alone', () => {
    assert.equal(familyOf('min7')?.family, 'm7')
    assert.equal(familyOf('Δ7')?.family, 'maj7')
    assert.equal(familyOf('°7')?.family, 'dim7')
    assert.equal(familyOf('sus')?.family, 'sus4')
  })

  it('admits when it simplifies', () => {
    // A thirteenth is drawn as the dominant seventh underneath it.
    assert.deepEqual(familyOf('13'), { family: '7', simplified: true })
    assert.deepEqual(familyOf('7b9'), { family: '7', simplified: true })
    assert.deepEqual(familyOf('m11'), { family: 'm7', simplified: true })
    // The shorthand chord sites use for a sus4 (`A4`, `D4`, `E4`).
    assert.deepEqual(familyOf('4'), { family: 'sus4', simplified: true })
  })

  it('only ever omits a note, never contradicts one', () => {
    // A flat or sharp fifth would still be sounded natural by every shape here.
    assert.equal(familyOf('7b5'), null)
    assert.equal(familyOf('7#5'), null)
    // A sixth-ninth has no seventh, so the ninth family would add a foreign note.
    assert.equal(familyOf('6/9')?.family, 'add9')
    assert.equal(familyOf('madd9')?.family, 'm')
    assert.equal(familyOf('add11')?.family, '')
  })

  it('does not mistake a major seventh for a minor', () => {
    assert.equal(familyOf('maj7')?.family, 'maj7')
    assert.equal(familyOf('m7b5')?.family, 'm7b5')
  })

  it('gives up rather than guess', () => {
    assert.equal(familyOf('alt'), null)
  })
})

describe('chordNoteNames', () => {
  const notesOf = (token: string) => {
    const chord = parseChord(token)
    assert.ok(chord !== null)
    return chordNoteNames(chord)
  }

  it('spells the chord the way the chord is written', () => {
    assert.deepEqual(notesOf('Bb'), ['Bb', 'D', 'F'])
    assert.deepEqual(notesOf('A'), ['A', 'C#', 'E'])
  })

  it('names the seventh and the ninth', () => {
    assert.deepEqual(notesOf('Am7'), ['A', 'C', 'E', 'G'])
  })

  it('adds a slash bass that is not already in the chord', () => {
    assert.deepEqual(notesOf('C/G'), ['C', 'E', 'G'])
    assert.deepEqual(notesOf('C/B'), ['C', 'E', 'G', 'B'])
  })

  it('still names the root when the suffix is unknown', () => {
    assert.deepEqual(notesOf('Calt'), ['C'])
  })
})
