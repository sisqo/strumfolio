import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LIBRARY_FAMILIES,
  LIBRARY_ROOTS,
  LIBRARY_SIZE,
  chordLibrary,
  rootAnchor,
  shapeCount,
  unplayableCount,
} from './chordLibrary'
import { noteToPitchClass } from './notes'
import { FAMILIES, INSTRUMENTS, fingeringText, shapeFor, shapesFor } from './shapes'

describe('the published chord types', () => {
  it('are exactly the ones shapes.ts can draw', () => {
    const published = LIBRARY_FAMILIES.map((entry) => entry.family)

    // Both directions: a family the chart lists and the table cannot draw would be a
    // section of empty cards, and one the table carries and the chart forgets is a chord
    // silently missing from a page that claims to be complete.
    assert.deepEqual([...published].sort(), Object.keys(FAMILIES).sort())
    assert.equal(new Set(published).size, published.length)
  })

  it('names every one of them', () => {
    for (const { family, label } of LIBRARY_FAMILIES) {
      assert.ok(label.length > 0, `${family || 'major'} has no label`)
    }
  })

  it('opens on the major, which is what a chart is mostly made of', () => {
    assert.equal(LIBRARY_FAMILIES[0].family, '')
    assert.equal(LIBRARY_FAMILIES[1].family, 'm')
  })
})

describe('the published roots', () => {
  it('are the twelve pitch classes, once each', () => {
    assert.deepEqual(
      LIBRARY_ROOTS.map((root) => root.pitchClass),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    )
  })

  it('spell themselves as their own pitch class', () => {
    for (const root of LIBRARY_ROOTS) {
      assert.equal(noteToPitchClass(root.name), root.pitchClass, `${root.name} is spelt wrong`)
    }
  })

  it('offer the other spelling for the five roots that have one', () => {
    const withAlias = LIBRARY_ROOTS.filter((root) => root.alias !== null)
    assert.equal(withAlias.length, 5)

    for (const root of withAlias) {
      // The same note under a different name, and genuinely the *other* name: one of the
      // two spellings is sharp and one flat, never two of a kind.
      assert.equal(noteToPitchClass(root.alias as string), root.pitchClass)
      assert.notEqual(root.alias, root.name)
      assert.equal(root.name.includes('#'), (root.alias as string).includes('b'))
    }
  })

  it('anchor to ids a URL can carry', () => {
    const ids = LIBRARY_ROOTS.map((root) => rootAnchor(root.name))

    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[a-z-]+$/)
    assert.equal(rootAnchor('C#'), 'c-sharp')
    assert.equal(rootAnchor('Bb'), 'b-flat')
    assert.equal(rootAnchor('B'), 'b')
  })
})

describe('the chart itself', () => {
  for (const instrument of INSTRUMENTS) {
    it(`covers every root and type on a ${instrument}`, () => {
      const groups = chordLibrary(instrument)
      const cards = groups.flatMap((group) => group.chords)

      assert.equal(groups.length, LIBRARY_ROOTS.length)
      assert.equal(cards.length, LIBRARY_SIZE)
      assert.equal(new Set(cards.map((card) => card.name)).size, LIBRARY_SIZE)
    })

    it(`draws what the reading screen draws on a ${instrument}`, () => {
      // The whole reason these pages are worth having: one implementation of «which shape
      // for this chord», so the chart and the song cannot disagree.
      for (const group of chordLibrary(instrument)) {
        for (const card of group.chords) {
          const chord = {
            root: group.root.pitchClass,
            rootName: group.root.name,
            suffix: card.family,
            bass: null,
            bassName: null,
          }
          const expected = shapeFor(chord, instrument)

          if (expected === null) {
            assert.equal(card.shapes.length, 0, `${card.name}: a shape the reader would not get`)
          } else {
            assert.deepEqual(card.shapes[0].frets, expected.frets, `${card.name}: not the default shape`)
          }
        }
      }
    })

    it(`offers the same alternatives a song does on a ${instrument}`, () => {
      // The same property one step further out, now that the chart's own picker pages
      // through this list: not just the default but every candidate, in the same order,
      // so a shape a reader finds here is one the popup on a sheet would have offered.
      for (const group of chordLibrary(instrument)) {
        for (const card of group.chords) {
          const expected = shapesFor(
            { root: group.root.pitchClass, rootName: group.root.name, suffix: card.family, bass: null, bassName: null },
            instrument,
          )

          assert.deepEqual(
            card.shapes.map((shape) => shape.frets),
            expected.map((shape) => shape.frets),
            `${card.name}: not the candidates the popup offers`,
          )
        }
      }
    })

    it(`says something useful on every card on a ${instrument}`, () => {
      for (const group of chordLibrary(instrument)) {
        for (const card of group.chords) {
          assert.equal(card.name, `${group.root.name}${card.family}`)

          // The notes are the answer on a card with no diagram, so they are never absent.
          assert.ok(card.notes.length >= 3, `${card.name}: ${card.notes.length} notes`)

          for (const shape of card.shapes) {
            // Carried rather than derived on the page, because the chart's picker is a
            // client component and `fingeringText` lives beside the ukulele search.
            assert.equal(shape.fingering, fingeringText(shape.frets), `${card.name}: wrong fingering`)
            // Every family is asked for by its own name, so nothing is ever a near relative.
            assert.equal(shape.simplified, false, `${card.name} came back simplified`)
            assert.equal(shape.family, card.family)
          }

          // A shape is only ever offered once: two slides drawing the same fingering
          // would be a dot to swipe to with nothing behind it.
          const fingerings = card.shapes.map((shape) => shape.fingering)
          assert.equal(new Set(fingerings).size, fingerings.length, `${card.name}: a repeated shape`)
        }
      }
    })
  }

  it('always has a guitar shape, whatever the chord', () => {
    // Structural rather than lucky: every family has a movable form anchored to the sixth
    // string, and a movable form exists at every root by definition.
    assert.equal(unplayableCount('guitar'), 0)
  })

  it('counts the chords four strings cannot hold', () => {
    // Not a fixed number — the page states whatever this returns — but it is small, and a
    // sudden jump would mean the ukulele search stopped finding voicings it used to.
    const missing = unplayableCount('ukulele')
    assert.ok(missing < 10, `${missing} ukulele chords have no shape`)
  })

  for (const instrument of INSTRUMENTS) {
    it(`counts every box behind the chart on a ${instrument}`, () => {
      // The other number the pages state about themselves. Same reasoning as
      // `unplayableCount`: it is a property of the search rather than a constant, so the
      // build asks instead of the prose claiming.
      const drawn = chordLibrary(instrument).reduce(
        (total, group) => total + group.chords.reduce((sum, card) => sum + card.shapes.length, 0),
        0,
      )

      assert.equal(shapeCount(instrument), drawn)
      // More shapes than chords, or the picker has nothing to page through anywhere.
      assert.ok(drawn > LIBRARY_SIZE, `${drawn} shapes for ${LIBRARY_SIZE} chords`)
    })
  }
})
