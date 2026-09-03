/**
 * The whole capo answer for one song, in one call: what every fret does to the hands, and
 * which fret is worth recommending.
 *
 * **Almost nothing here is new arithmetic, and that is the design.** `capo.ts` already
 * answers both halves for the reading screen — `easeByFret` counts how many of a song's
 * chords fall into an easy shape at each fret, `suggestCapo` picks one and knows when the
 * honest answer is «none» — and those are the rules a public calculator must not restate
 * differently. A tool that recommended fret 3 while the app recommended fret 2 for the same
 * song would be two products disagreeing in public.
 *
 * What this adds is the part the reading screen never needs: the chords you would actually
 * *read* at each fret, spelled out. On a phone the sheet simply redraws itself; on a page
 * that is answering «where do I put the capo» before anybody has a repertoire, the names are
 * the answer, and they belong in a tested module rather than in a `.map` inside a component
 * (`npm test` here reaches one and not the other).
 *
 * Not gated, and not a hole in the gate. The app's own worked-out capo is a paid feature and
 * stays one — what is sold there is a fret remembered per song across a repertoire, on every
 * device, beside the sheet it applies to. What is given away here is the arithmetic for one
 * song pasted once, which is the same trade `/tools/chordpro-converter` makes with the
 * importer. No entitlement is read on this path on purpose: a tool that never touches a
 * reader's songs cannot leak them.
 */

import { MAX_CAPO, easeByFret, readShift, suggestCapo } from './capo'
import { type Accidentals, formatChord, parseChord, readChord } from './chord'
import { type Instrument } from './shapes'

/** International letters, as `sheet.ts` writes them and for the same reason — see its note. */
const INTERNATIONAL = { notation: 'int', tonic: 0 } as const

/** What one fret does for one song. */
export interface CapoRow {
  fret: number
  /** How many of the song's distinct chords fall into an easy shape here. */
  easy: number
  /** How many distinct chords the song has — what `easy` is out of. */
  total: number
  /** The chords you would read at this fret, in the order the song introduced them. */
  chords: string[]
}

export interface CapoAdvice {
  /** Distinct chords found in the paste. Zero means nothing read as a chord. */
  total: number
  /** One row per fret, from 0 (no capo) to `MAX_CAPO`. */
  rows: CapoRow[]
  /**
   * The fret worth recommending, or null when there is nothing useful to say — a song with
   * no chords, a song already entirely easy, or a song no capo improves. Straight from
   * `suggestCapo`, ties and all: the lowest fret wins, because a capo further up the neck
   * shortens the instrument for nothing.
   */
  best: number | null
}

/**
 * Every fret's answer for a set of chords.
 *
 * `semitones` is 0 throughout and is not a parameter, which is a statement about what a capo
 * is rather than a simplification: a capo leaves the sound exactly where it was and moves
 * only the hand, so a calculator that also transposed would be answering a question nobody
 * asked of it. Moving the sound is the transposer's job, one page over, and the two controls
 * stay separate here for the same reason they are separate in the app.
 *
 * A chord whose suffix has no shape in the table stays in `total` as a hard one, because that
 * is what it is — see `distinctChords` in `capo.ts`.
 */
export function capoAdvice(tokens: string[], instrument: Instrument, accidentals: Accidentals): CapoAdvice {
  const { total, easyByFret } = easeByFret(tokens, 0, instrument)

  /* Parsed once for every fret rather than once per fret: the same chords are being renamed
     eight times, and `parseChord` is the expensive half of that. */
  const chords = distinctChords(tokens)

  const rows: CapoRow[] = easyByFret.map((easy, fret) => ({
    fret,
    easy,
    total,
    chords: chords.map((chord) =>
      formatChord(readChord(chord, readShift(0, fret), accidentals), INTERNATIONAL),
    ),
  }))

  return { total, rows, best: suggestCapo(tokens, 0, 0, instrument)?.fret ?? null }
}

/**
 * The song's distinct chords as parsed chords, in order of first appearance.
 *
 * `capo.ts` has a `distinctChords` of its own and it answers a different question: it reduces
 * a chord to root-and-family because that is all a *fingering* depends on, so `Cmaj7` and
 * `C6/9` collapse together there. Here the names are what is being shown, so a chord keeps
 * its own suffix and its own bass — collapsing them would print a chord the song does not
 * contain.
 */
function distinctChords(tokens: string[]) {
  const seen = new Map<string, NonNullable<ReturnType<typeof parseChord>>>()

  for (const token of tokens) {
    const chord = parseChord(token)
    if (chord === null) continue

    /* Keyed by what is drawn, not by the token: `A#m` and `Bbm` are one chord written twice,
       and a song that spells it both ways should not get two rows of the same shape. */
    const key = `${chord.root}:${chord.suffix}:${chord.bass ?? ''}`
    if (!seen.has(key)) seen.set(key, chord)
  }

  return [...seen.values()]
}

/** Highest fret the rows reach, re-exported so a page does not import two modules to draw one. */
export { MAX_CAPO }
