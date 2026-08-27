import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatChord, parseChord, transposeChord } from './chord'
import {
  FRET_PAGE,
  MAX_CAPO,
  clampCapo,
  easeOf,
  fretWindowStart,
  readKey,
  readShift,
  suggestCapo,
} from './capo'
import { type Key, keyFor, transposeKey } from './notes'

/** What the sheet would print for a chord, at a given transposition and capo. */
function onPage(token: string, written: Key, semitones: number, capo: number): string {
  const chord = parseChord(token)
  assert.ok(chord !== null)

  const shift = readShift(semitones, capo)
  return formatChord(transposeChord(chord, shift, readKey(written, semitones, capo)), 'int')
}

describe('what the capo moves and what it leaves alone', () => {
  const D = keyFor(2, 'major')
  const Eb = keyFor(3, 'major')

  /*
   * The capo is the whole difference between the hand and the sound. Nothing computes a
   * sounding key any more — no screen names one — so the invariant is stated where it
   * still lives: put the fret back and what is left is the transposition, which is the
   * only thing that moves what comes out.
   */
  it('leaves the sound where it was, at every fret', () => {
    for (let capo = 0; capo <= MAX_CAPO; capo += 1) {
      for (const semitones of [-3, 0, 2]) {
        assert.equal(readShift(semitones, capo) + capo, semitones, `capo ${capo} moved the sound`)
      }
    }
  })

  it('moves the page down by the fret the capo is on', () => {
    // A song in D, capo 2: the shapes are the ones of C.
    assert.equal(readKey(D, 0, 2).name, 'C')
    assert.equal(onPage('D', D, 0, 2), 'C')
    assert.equal(onPage('G', D, 0, 2), 'F')
    assert.equal(onPage('A', D, 0, 2), 'G')
  })

  it('is the transposition that moves the sound, not the capo', () => {
    assert.equal(transposeKey(D, 2).name, 'E')
    assert.equal(transposeKey(D, -3).name, 'B')
  })

  /**
   * The case where a wrong sign still looks plausible.
   *
   * Up two semitones and a capo on the second fret cancel on the page — the letters are
   * the ones the file was written with — while the instrument sounds a tone higher. Get
   * either sign backwards and one of these two facts breaks, never both.
   */
  it('shows the written chords when the transposition and the capo cancel', () => {
    assert.equal(readShift(2, 2), 0)
    assert.equal(onPage('D', D, 2, 2), 'D')
    assert.equal(onPage('Bm', D, 2, 2), 'Bm')
    assert.equal(transposeKey(D, 2).name, 'E')
    assert.equal(readKey(D, 2, 2).name, 'D')
  })

  it('spells the page in the key of the page', () => {
    // Sounding Eb, capo 1, so the shapes are in D: sharps, not the flats of Eb.
    assert.equal(readKey(Eb, 0, 1).name, 'D')
    assert.equal(onPage('Ab', Eb, 0, 1), 'G')
    assert.equal(onPage('Bb', Eb, 0, 1), 'A')
  })

  it('keeps the fret on the neck', () => {
    assert.equal(clampCapo(-3), 0)
    assert.equal(clampCapo(99), MAX_CAPO)
    assert.equal(clampCapo(2.4), 2)
  })
})

describe('suggesting a capo', () => {
  /** Eb, Ab, Bb: three barre chords on a guitar, and all of them open a fret up. */
  const EB_SONG = ['Eb', 'Ab', 'Bb', 'Cm']

  it('finds the fret that opens the most chords', () => {
    const found = suggestCapo(EB_SONG, 0, 0, 'guitar')

    assert.ok(found !== null)
    // Capo 1 reads them as D, G, A, Bm — three of the four have open shapes.
    assert.equal(found.fret, 1)
    assert.equal(found.total, 4)
    assert.ok(found.easy >= 3, `only ${found.easy} easy`)
  })

  it('says nothing when the song is already all open chords', () => {
    assert.equal(suggestCapo(['C', 'G', 'Am', 'D7'], 0, 0, 'guitar'), null)
  })

  /**
   * The property behind the feature, rather than one song that happens to show it.
   *
   * A suggestion is only ever worth making if it strictly beats the fret the reader is
   * on. Checked across songs, frets and both instruments, because the interesting
   * failures are the combinations nobody thinks to try: a suggestion that repeats the
   * current fret, or one that makes the chords harder while claiming to help.
   */
  it('only ever offers a fret that is a real improvement', () => {
    const songs = [
      ['Eb', 'Ab', 'Bb', 'Cm'],
      ['C', 'F', 'G', 'Am'],
      ['F#', 'B', 'C#', 'D#m'],
      ['Bb', 'Eb', 'F7'],
      ['A', 'D', 'E'],
    ]

    let offered = 0

    for (const song of songs) {
      for (const instrument of ['guitar', 'ukulele'] as const) {
        for (let capo = 0; capo <= MAX_CAPO; capo += 1) {
          const found = suggestCapo(song, 0, capo, instrument)
          if (found === null) continue

          offered += 1
          const now = easeOf(song, 0, capo, instrument)
          assert.ok(
            found.easy > now.easy,
            `${instrument} ${song.join(' ')} at capo ${capo}: offered ${found.fret} with ${found.easy}, already ${now.easy}`,
          )
          assert.notEqual(found.fret, capo)
          assert.equal(found.total, now.total)
        }
      }
    }

    // The loop has to have had something to check.
    assert.ok(offered > 10, `only ${offered} suggestions made`)
  })

  it('says nothing about a song with no chords in it', () => {
    assert.equal(suggestCapo([], 0, 0, 'guitar'), null)
    assert.equal(suggestCapo(['x2', 'assolo'], 0, 0, 'guitar'), null)
  })

  it('compares against the capo already on, not against a bare neck', () => {
    // With the capo where the suggestion would send it, there is nothing left to say.
    const first = suggestCapo(EB_SONG, 0, 0, 'guitar')
    assert.ok(first !== null)
    assert.equal(suggestCapo(EB_SONG, 0, first.fret, 'guitar'), null)
  })

  it('takes the transposition into account, since it moves the shapes too', () => {
    /*
     * The same song read a semitone higher already needs no capo: +1 puts it in E, A, B,
     * C#m, and the suggestion must not offer the fret that was right before.
     */
    const moved = suggestCapo(EB_SONG, 1, 0, 'guitar')
    assert.notEqual(moved?.fret, 1)
  })

  it('answers for a ukulele too, where easy means near the nut', () => {
    const found = suggestCapo(['Eb', 'Ab', 'Bb'], 0, 0, 'ukulele')
    // Whatever it picks, it must be an improvement and a real fret.
    if (found !== null) {
      assert.ok(found.fret >= 1 && found.fret <= MAX_CAPO)
      assert.ok(found.easy > 0)
    }
  })

  it('never suggests the fret it was given', () => {
    for (let capo = 0; capo <= MAX_CAPO; capo += 1) {
      const found = suggestCapo(EB_SONG, 0, capo, 'guitar')
      assert.notEqual(found?.fret, capo)
    }
  })
})

describe('which frets the reading panel shows at once', () => {
  it('starts at the nut, so the first page is 0 up to one short of a page', () => {
    assert.equal(fretWindowStart(0, 0), 0)
  })

  it('never starts so late that the row would show cells past the last fret', () => {
    /* A page of 6 over frets 0..7 can start no later than 2 (showing 2..7). The capo is
       on the last fret here on purpose: with it at 0 the containment rule below would
       pull the window back to the nut, and this assertion would be about that instead. */
    assert.equal(fretWindowStart(99, MAX_CAPO), MAX_CAPO - FRET_PAGE + 1)
  })

  it('never starts before the nut', () => {
    assert.equal(fretWindowStart(-5, 0), 0)
  })

  /*
   * The rule the whole function exists for: whatever page was last looked at, the row
   * has to contain the fret the capo is actually on — otherwise the badge above it names
   * a fret that is nowhere on screen.
   */
  it('pulls the window forward to reach a capo past its end', () => {
    const start = fretWindowStart(0, MAX_CAPO)
    assert.ok(MAX_CAPO >= start && MAX_CAPO <= start + FRET_PAGE - 1)
  })

  it('pulls the window back to reach a capo before its start', () => {
    const start = fretWindowStart(MAX_CAPO, 0)
    assert.equal(start, 0)
  })

  it('shows every fret from 0 to MAX_CAPO on some page, wherever the capo is', () => {
    for (let capo = 0; capo <= MAX_CAPO; capo += 1) {
      const start = fretWindowStart(0, capo)
      assert.ok(
        capo >= start && capo <= start + FRET_PAGE - 1,
        `capo ${capo} fell outside the window starting at ${start}`,
      )
    }
  })

  it('leaves a page alone when the capo is already inside it', () => {
    // Capo 3 is inside 2..7, so paging to 2 and then asking again must not move it back.
    assert.equal(fretWindowStart(2, 3), 2)
  })

  it('starts at the nut when every fret fits in one page', () => {
    assert.equal(fretWindowStart(3, 0, 4, FRET_PAGE), 0)
  })
})
