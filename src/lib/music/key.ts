/**
 * Estimates the key of a song from its chords.
 *
 * Nothing stores a key. Between v4.1 and v4.3 nothing read one either, and the shape of
 * that gap explains what this module is for now. The only thing the app originally needed
 * a key for was spelling: transposing has to choose between `F#` and `Gb`, and that choice
 * belonged to the key being landed in. Then the reading screen grew a ♯/♭ control with no
 * unset state (`GlobalPrefs.accidentals`), the reader began answering that question
 * directly, `readChord` spelled from their answer without consulting a key at all — and
 * both call sites this file had, the sheet and the booklet, stopped asking.
 *
 * It was kept rather than deleted, as a *shelved* answer and not a dead one: correct,
 * tested, and exactly what somebody would need on the day a screen wanted a key again.
 * **Nashville numbers are that day** — a degree is a distance from a tonic, so a notation
 * built from degrees cannot be drawn without one, and `spellingFor` below is the door it
 * comes back through. What this must still never become is a call in a path that throws
 * the answer away, which is what both old call sites briefly were while v4.1 was being
 * written: spelling from the reader's choice while still paying for an estimate, under a
 * comment claiming the key decided. `spellingFor` therefore does not estimate at all
 * unless the notation asking is the one that reads the result.
 *
 * **What a wrong guess costs is no longer what it cost.** Shelved, the answer to that was
 * "an accidental the other way round, and where the guess is wrong it is usually wrong by
 * a relative major or minor, which spell identically" — a letter, in other words, and the
 * common failure was the harmless one. Under Nashville a wrong guess renumbers every
 * chord in the song, and that same relative-major-or-minor confusion is a constant of
 * three degrees across all of them: the sheet stays self-consistent and stays transposable,
 * but a song in A minor read as C major calls its home chord `6-`. Measured against the
 * twenty-one songs that did have a stored key: twenty-one agreements, no disagreements —
 * which is why an estimate was judged good enough to number a chart from, and why the
 * fix if it ever is wrong is a tonic a reader can state, not a better guess.
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

import { type Notation, type Spelling, parseChord } from './chord'
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

/**
 * How a song's chords are to be written down — the whole of what `formatChord` needs, and
 * the only thing that builds a `Spelling`.
 *
 * **Three of the four notations do not estimate anything, and the tokens arrive as a
 * function so that they cannot.** Letters need no tonic; the scan behind them is a scan of
 * the whole song, and paying for one to hand back a number nobody reads is precisely the
 * mistake the top of this file exists to warn about. Passing an array would have moved
 * that decision to every call site — three of them, each having to remember a guard the
 * type could not ask for — where a thunk leaves it here, once. The `0` the other three get
 * is not a claim about the song; it is the unread field of a union this codebase draws as
 * a struct.
 *
 * **`shift` is why this takes three arguments and not two.** The chords reaching
 * `formatChord` have already been moved by transposition and capo (`readChord`), while the
 * estimate is made from the source's own tokens, so the tonic has to make the same journey
 * or it would belong to a different key than the chords being numbered against it. Moving
 * it is also what makes the numbers *stable*: both sides shift, the shift cancels, and a
 * Nashville sheet reads the same at every fret and in every key — which is the one
 * property of the notation worth having.
 *
 * Songs with no chords estimate to null and land on `0`, and nothing is lost by it: a song
 * with no chords has nothing for a notation to write down either.
 */
export function spellingFor(
  notation: Notation,
  chordTokens: () => string[],
  shift: number,
): Spelling {
  if (notation !== 'nash') return { notation, tonic: 0 }

  return { notation, tonic: mod12((estimateKey(chordTokens())?.pc ?? 0) + shift) }
}
