import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readKey } from './capo'
import { formatChord, parseChord, readChord, renderChord } from './chord'
import { estimateKey, spellingFor } from './key'
import { C_MAJOR } from './notes'

describe('estimateKey', () => {
  it('reads the fixtures the way their directives declare them', () => {
    // The same chord sets the four content files use.
    assert.equal(estimateKey(['Bb', 'Eb', 'F', 'Gm7', 'Bb/D', 'Fsus4', 'Bb'])?.name, 'Bb')
    assert.equal(estimateKey(['D', 'A', 'G', 'Dmaj7', 'Bm', 'F#dim', 'A', 'D'])?.name, 'D')
    assert.equal(estimateKey(['Am', 'F', 'C', 'G', 'Dm', 'E7', 'Am'])?.name, 'Am')
    assert.equal(estimateKey(['F#m', 'C#m', 'D', 'E', 'Bm7b5', 'A6/9', 'F#m'])?.name, 'F#m')
  })

  it('distinguishes a major key from its relative minor by where it lands', () => {
    assert.equal(estimateKey(['C', 'Am', 'F', 'G', 'C'])?.name, 'C')
    assert.equal(estimateKey(['Am', 'F', 'C', 'G', 'Am'])?.name, 'Am')
  })

  it('returns null when there is nothing to go on', () => {
    assert.equal(estimateKey([]), null)
    assert.equal(estimateKey(['Ritornello', 'x2']), null)
  })

  it('survives a single chord', () => {
    assert.equal(estimateKey(['C'])?.name, 'C')
    assert.equal(estimateKey(['Am'])?.name, 'Am')
  })
})

/**
 * What the estimate is actually for.
 *
 * Not a readout — nothing shows a key — but the choice between `F#` and `Gb` when a
 * chord moves. Both halves are asserted here: what the derived key spells, and what the
 * old fallback to C major would have spelled instead, because a test that only checks
 * the first would pass just as well with no estimate at all.
 */
describe('the estimate decides the accidentals', () => {
  const written = (tokens: string[]) => estimateKey(tokens) ?? C_MAJOR

  it('spells from the key the song is in, not from C', () => {
    const key = written(['Bb', 'Eb', 'F', 'Gm7', 'Bb'])
    assert.equal(key.name, 'Bb')

    // Bb up a semitone lands in B, which writes sharps.
    assert.equal(readKey(key, 1, 0).name, 'B')
    assert.equal(renderChord('C', 1, 'int', readKey(key, 1, 0)), 'C#')

    // Assuming C major — which is what a song with no stored key used to get — lands in
    // Db instead, and spells the same note the other way round.
    assert.equal(readKey(C_MAJOR, 1, 0).name, 'Db')
    assert.equal(renderChord('C', 1, 'int', readKey(C_MAJOR, 1, 0)), 'Db')
  })

  /*
   * The case the capo made ordinary: a shift with no transposition at all. Before the
   * capo there was no way to move the page without also moving the sound, so a wrong
   * written key could only ever show up in a song someone had transposed.
   */
  it('is on the reading path as soon as a capo is on', () => {
    const key = written(['Bb', 'Eb', 'F', 'Bb'])
    assert.equal(readKey(key, 0, 1).name, 'A')
    assert.equal(readKey(C_MAJOR, 0, 1).name, 'B')
  })
})

describe('spellingFor', () => {
  /*
   * The thunk is the guard, so the test makes it a trap: three of the four notations must
   * not so much as look at the song, and the only way to assert "did not scan" is to make
   * scanning throw.
   */
  it('asks the song nothing when the notation has letters of its own', () => {
    const trap = (): string[] => {
      throw new Error('estimated a key for a notation that has no use for one')
    }

    for (const notation of ['int', 'it', 'de'] as const) {
      const spelling = spellingFor(notation, trap, 3)
      assert.equal(spelling.notation, notation)
      assert.equal(spelling.tonic, 0)
    }
  })

  it('numbers from the song own key rather than from C', () => {
    assert.equal(spellingFor('nash', () => ['Am', 'F', 'C', 'G', 'Am'], 0).tonic, 9)
    assert.equal(spellingFor('nash', () => ['Bb', 'Eb', 'F', 'Gm7', 'Bb'], 0).tonic, 10)
  })

  /*
   * The bug this exists to catch: the chords reaching `formatChord` have been moved and the
   * tonic has to make the same trip. Leave it behind and every number in a transposed song
   * is wrong by the size of the transposition, with nothing on screen to say so.
   */
  it('moves the tonic by the same shift as the chords', () => {
    const tokens = () => ['Am', 'F', 'C', 'G', 'Am']
    assert.equal(spellingFor('nash', tokens, 2).tonic, 11)
    assert.equal(spellingFor('nash', tokens, -2).tonic, 7)
    assert.equal(spellingFor('nash', tokens, 3).tonic, 0)
    assert.equal(spellingFor('nash', tokens, 12).tonic, 9)
  })

  it('lands on C for a song with no chords, which has nothing to number anyway', () => {
    assert.equal(spellingFor('nash', () => [], 0).tonic, 0)
    assert.equal(spellingFor('nash', () => ['Ritornello', 'x2'], 0).tonic, 0)
  })
})

/**
 * The property the notation rests on, and the reason a numbered chart is worth having: a
 * transposition or a capo moves every letter on the page and not one of the numbers.
 *
 * Asserted as an invariance over the whole sheet rather than as a worked example or two,
 * because the failure it guards against is uniform — every chord wrong by the same amount,
 * which is exactly what a spot check of one chord against a hand-computed degree would
 * also show as "wrong by the same amount" and be read as a bad expectation.
 */
describe('a Nashville sheet reads the same at every shift', () => {
  const tokens = ['Am', 'F', 'C', 'G', 'E7']

  /** Exactly what the sheet does: one `Spelling` for the song, every chord through it. */
  const sheet = (shift: number, accidentals: 'sharp' | 'flat' = 'sharp'): string[] => {
    const spelling = spellingFor('nash', () => tokens, shift)
    return tokens.map((token) =>
      formatChord(readChord(parseChord(token)!, shift, accidentals), spelling),
    )
  }

  it('numbers a minor-key song from its own tonic', () => {
    assert.deepEqual(sheet(0), ['1-', 'b6', 'b3', 'b7', '57'])
  })

  it('prints those same degrees at every transposition and capo', () => {
    const written = sheet(0)

    for (const shift of [-12, -7, -5, -3, -1, 1, 2, 4, 6, 7, 11, 12]) {
      assert.deepEqual(sheet(shift), written, `shift ${shift} renumbered the sheet`)
    }
  })

  it('prints them the same for a reader who asked for flats', () => {
    assert.deepEqual(sheet(0, 'flat'), sheet(0, 'sharp'))
    assert.deepEqual(sheet(5, 'flat'), sheet(5, 'sharp'))
  })
})
