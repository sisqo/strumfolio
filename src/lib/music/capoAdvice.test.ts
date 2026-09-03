import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MAX_CAPO, capoAdvice } from './capoAdvice'
import { suggestCapo } from './capo'

describe('the capo answer for one song', () => {
  /* F major on a guitar: the classic case for a capo, since the song is playable with a barre
     and pleasant with open shapes a few frets up. */
  const F = ['F', 'Bb', 'C', 'Dm']

  it('has a row for every fret the app offers, and no more', () => {
    const { rows } = capoAdvice(F, 'guitar', 'flat')

    assert.equal(rows.length, MAX_CAPO + 1)
    assert.deepEqual(
      rows.map((row) => row.fret),
      Array.from({ length: MAX_CAPO + 1 }, (_, fret) => fret),
    )
  })

  it('names the chords the hand would read at each fret', () => {
    const { rows } = capoAdvice(['F', 'C'], 'guitar', 'sharp')

    /* No capo: what is written is what is played. */
    assert.deepEqual(rows[0].chords, ['F', 'C'])
    /* Fret 5: the hand reads five semitones lower, which is the shape that sounds the same. */
    assert.deepEqual(rows[5].chords, ['C', 'G'])
  })

  it('spells the read chords the way the reader asked', () => {
    assert.deepEqual(capoAdvice(['C'], 'guitar', 'flat').rows[1].chords, ['B'])
    assert.deepEqual(capoAdvice(['D'], 'guitar', 'flat').rows[1].chords, ['Db'])
    assert.deepEqual(capoAdvice(['D'], 'guitar', 'sharp').rows[1].chords, ['C#'])
  })

  /*
   * The one invariant worth stating twice: a capo does not move the sound. Whatever fret the
   * calculator suggests, the chords it prints for that fret are lower than the written ones
   * by exactly the fret number — which is what makes them sound identical.
   */
  it('never moves the sound, at any fret', () => {
    const { rows } = capoAdvice(['A'], 'guitar', 'sharp')

    for (const row of rows) {
      const written = 9 /* A */
      const read = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(row.chords[0])
      assert.equal((read + row.fret) % 12, written, `fret ${row.fret} changed what comes out`)
    }
  })

  it('agrees with the app about which fret to suggest', () => {
    /* Not a re-implementation of the rule but a check that it is the *same* rule: the tool and
       the reading screen disagreeing in public is the failure this guards. */
    for (const song of [F, ['E', 'A', 'B7'], ['C', 'F', 'G'], ['Eb', 'Ab', 'Bb']]) {
      assert.equal(capoAdvice(song, 'guitar', 'flat').best, suggestCapo(song, 0, 0, 'guitar')?.fret ?? null)
    }
  })

  it('suggests a capo for the song that wants one', () => {
    const { best, total } = capoAdvice(F, 'guitar', 'flat')

    assert.equal(total, 4)
    assert.ok(best !== null, 'F major on a guitar has an easier fret than the barre')
    assert.ok(best > 0)
  })

  it('says nothing when the shapes are already open', () => {
    /*
     * Every one of these is a first-week shape: there is no advice to give, and inventing
     * some would be worse than silence.
     *
     * `C G Am F` was the first song written here and it belongs in the *other* test: the app
     * suggests fret 5 for it, correctly, because F is a barre and five frets up it is a C
     * shape. A calculator that stayed quiet about that song would be hiding the one piece of
     * advice a beginner most needs.
     */
    assert.equal(capoAdvice(['C', 'G', 'Am', 'Em'], 'guitar', 'sharp').best, null)
    assert.equal(capoAdvice(['G', 'C', 'D'], 'guitar', 'sharp').best, null)
  })

  it('suggests the fret that turns a barre into an open shape', () => {
    /* The commonest real case, and the one the page is for: F is the only hard chord in
       `C G Am F`, and at the fifth fret every shape is open. */
    assert.equal(capoAdvice(['C', 'G', 'Am', 'F'], 'guitar', 'sharp').best, 5)
    assert.deepEqual(capoAdvice(['C', 'G', 'Am', 'F'], 'guitar', 'sharp').rows[5].chords, ['G', 'D', 'Em', 'C'])
  })

  it('counts the same chord once, however it is spelled', () => {
    assert.equal(capoAdvice(['A#m', 'Bbm', 'F'], 'guitar', 'flat').total, 2)
  })

  it('keeps a chord it has no shape for, as a hard one', () => {
    /* Dropping it would quietly improve the count for every fret and make an unplayable song
       look easy — see `distinctChords` in capo.ts. */
    const { total, rows } = capoAdvice(['C', 'G', 'Cmaj9#11'], 'guitar', 'sharp')

    assert.equal(total, 3)
    assert.ok(rows.every((row) => row.easy < row.total))
  })

  it('has an answer for a ukulele too, and not the guitar one', () => {
    const guitar = capoAdvice(['E', 'A', 'B7'], 'guitar', 'sharp')
    const ukulele = capoAdvice(['E', 'A', 'B7'], 'ukulele', 'sharp')

    /* The same chords are hard on one instrument and easy on the other — E is a stretch on a
       guitar and three fingers on a ukulele — so the counts must not be copies. */
    assert.notDeepEqual(
      guitar.rows.map((row) => row.easy),
      ukulele.rows.map((row) => row.easy),
    )
  })

  it('has nothing to say about an empty paste', () => {
    const { total, best, rows } = capoAdvice([], 'guitar', 'sharp')

    assert.equal(total, 0)
    assert.equal(best, null)
    assert.ok(rows.every((row) => row.chords.length === 0))
  })
})
