/**
 * Estimates the key of a song from its chords.
 *
 * Nothing stores a key, and since v4.1 **nothing reads one either**. The only thing the
 * app ever needed one for was spelling: transposing has to choose between `F#` and `Gb`,
 * and that choice belonged to the key being landed in. Then the reading screen grew a
 * ♯/♭ control with no unset state (`GlobalPrefs.accidentals`), the reader answers that
 * question directly, and `readChord` spells from their answer without consulting a key at
 * all — so both call sites this file had, the sheet and the booklet, stopped asking.
 *
 * It is kept rather than deleted, and the distinction to hold on to is that this is a
 * *shelved* answer and not a dead one: the module is correct, tested, and is exactly what
 * an «auto» third state on that control would need on the day somebody wants one. What it
 * must not become is a call in a path that throws its answer away — which is what both
 * call sites briefly were while v4.1 was being written, spelling from the reader's choice
 * while still paying for an estimate and carrying a comment that said the key decided.
 *
 * Being a guess is therefore cheap in a way it was not when it was a field. The worst
 * a wrong guess can do is spell an accidental the other way round; and where it is
 * wrong it is usually wrong by a relative major or minor, which spell identically.
 * Measured against the twenty-one songs that did have a stored key: twenty-one
 * agreements, no disagreements.
 *
 * The method: score all 24 keys by how much of the song is diatonic to each, then
 * break ties with the chords in the positions that usually carry the tonic — the last
 * one above all.
 *
 * **Feed it distinct chords, not the sequence.** `chordTokens` deduplicates, which looks
 * like it throws away the signal the last-chord tie-break needs — so it was measured both
 * ways against the twenty-one stored keys before they were dropped: distinct agreed
 * twenty-one times, the full sequence with repeats only nine. With repeats the diatonic
 * score becomes a count of how often a chord appears, and a song that leans on its fourth
 * and fifth ends up scored in the wrong key. One chord, one vote.
 */

import { parseChord } from './chord'
import { type Key, type Mode, keyFor, mod12 } from './notes'

/** Scale degrees as {semitones from tonic, expected quality}. */
const MAJOR_DEGREES: { offset: number; minor: boolean }[] = [
  { offset: 0, minor: false },
  { offset: 2, minor: true },
  { offset: 4, minor: true },
  { offset: 5, minor: false },
  { offset: 7, minor: false },
  { offset: 9, minor: true },
  { offset: 11, minor: true },
]

/**
 * Natural minor, plus the major fifth. The raised fifth of harmonic minor is
 * everywhere in Italian song — Am with an E7 — so leaving it out would make every
 * minor-key guess worse.
 */
const MINOR_DEGREES: { offset: number; minor: boolean }[] = [
  { offset: 0, minor: true },
  { offset: 2, minor: true },
  { offset: 3, minor: false },
  { offset: 5, minor: true },
  { offset: 7, minor: false },
  { offset: 7, minor: true },
  { offset: 8, minor: false },
  { offset: 10, minor: false },
]

interface Observed {
  root: number
  minor: boolean
}

function observe(tokens: string[]): Observed[] {
  const seen: Observed[] = []

  for (const token of tokens) {
    const chord = parseChord(token)
    if (chord === null) continue
    seen.push({ root: chord.root, minor: /^m(?!aj)/.test(chord.suffix) })
  }
  return seen
}

function score(chords: Observed[], tonic: number, mode: Mode): number {
  const degrees = mode === 'major' ? MAJOR_DEGREES : MINOR_DEGREES
  let total = 0

  for (const chord of chords) {
    const offset = mod12(chord.root - tonic)
    const matches = degrees.filter((degree) => degree.offset === offset)

    if (matches.length === 0) continue
    // Right root and right quality is the strong signal; right root alone still
    // counts, since sevenths and suspensions blur the quality.
    total += matches.some((degree) => degree.minor === chord.minor) ? 1 : 0.5
  }

  if (chords.length > 0) {
    const last = chords[chords.length - 1]
    if (last.root === tonic && last.minor === (mode === 'minor')) total += 1.5
    else if (last.root === tonic) total += 0.75

    if (chords[0].root === tonic && chords[0].minor === (mode === 'minor')) total += 0.75
  }

  return total
}

/**
 * The most likely key, or null when there are no chords to go on — in which case the
 * caller has nothing to spell either, so C major is as good an answer as any.
 */
export function estimateKey(chordTokens: string[]): Key | null {
  const chords = observe(chordTokens)
  if (chords.length === 0) return null

  let best: { key: Key; score: number } | null = null

  for (const mode of ['major', 'minor'] as const) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const value = score(chords, tonic, mode)
      if (best === null || value > best.score) {
        best = { key: keyFor(tonic, mode), score: value }
      }
    }
  }

  return best?.key ?? null
}
