/**
 * Chord shapes, for the instrument in the reader's hands.
 *
 * A C is a C on anything with strings: what changes between a guitar and a ukulele
 * is not the chord but where the fingers go. So the chord side of this file is shared
 * and only the fingerings are per instrument — and the two are found in different
 * ways, on purpose:
 *
 * - **Guitar**, six strings: a short table of open-position shapes, plus movable
 *   forms anchored to the root on the sixth or fifth string. Written by hand because
 *   what a guitarist plays is a barre form or x32010, and no scoring function would
 *   discover a barre; six strings also make a search enormous.
 * - **Ukulele**, four: a search. Four strings and a four-fret reach leave few valid
 *   voicings and almost no room to mute anything, so the compact one *is* the one
 *   players use — and the search proves it, since the famous shapes come out of it
 *   unprompted (C 0003, F 2010, G 0232, Am 2000, B7 2322).
 *
 * Every shape either way is checked by the tests against the pitch classes it
 * produces: no note outside the chord, and the tones that make the chord what it is
 * all present. That check is what the fret numbers rest on; they are not transcribed
 * from a source, so the claim is "these are voicings of the right chord", not "these
 * are the fingerings a given book prints".
 */

import { type Chord, normalizeSuffix } from './chord'
import { type PitchClass, mod12, spellPitchClass } from './notes'

export type Instrument = 'guitar' | 'ukulele'

export const INSTRUMENTS: Instrument[] = ['guitar', 'ukulele']

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  guitar: 'Guitar',
  ukulele: 'Ukulele',
}

/**
 * Open string pitch classes, in the order a chart draws them.
 *
 * The ukulele's G is written first and is actually the *higher* of the first two
 * strings — the tuning is reentrant. Nothing here cares: these are pitch classes, so
 * octaves never enter the arithmetic.
 */
const TUNING: Record<Instrument, PitchClass[]> = {
  guitar: [4, 9, 2, 7, 11, 4],
  ukulele: [7, 0, 4, 9],
}

/** A fret per string, low to high. `null` is a muted string, `0` is open. */
export type Fret = number | null

export interface ChordShape {
  frets: Fret[]
  /** Which chord this is a voicing of, after any simplification. */
  family: string
  /**
   * True when the suffix asked for something the table does not carry and a
   * near relative was used — a 13th drawn as a dominant seventh, say.
   */
  simplified: boolean
}

interface Family {
  /** Intervals from the root, in semitones. */
  intervals: number[]
  /** Intervals a voicing must contain, or it is not this chord. */
  required: number[]
}

/**
 * The families the diagrams cover. `required` is what separates a real voicing
 * from a root-and-fifth that happens to fit: a major shape without its third is
 * not a major chord.
 */
export const FAMILIES: Record<string, Family> = {
  '': { intervals: [0, 4, 7], required: [0, 4] },
  m: { intervals: [0, 3, 7], required: [0, 3] },
  '7': { intervals: [0, 4, 7, 10], required: [0, 4, 10] },
  m7: { intervals: [0, 3, 7, 10], required: [0, 3, 10] },
  maj7: { intervals: [0, 4, 7, 11], required: [0, 4, 11] },
  '6': { intervals: [0, 4, 7, 9], required: [0, 4, 9] },
  m6: { intervals: [0, 3, 7, 9], required: [0, 3, 9] },
  sus4: { intervals: [0, 5, 7], required: [0, 5] },
  sus2: { intervals: [0, 2, 7], required: [0, 2] },
  '7sus4': { intervals: [0, 5, 7, 10], required: [0, 5, 10] },
  dim: { intervals: [0, 3, 6], required: [0, 3, 6] },
  dim7: { intervals: [0, 3, 6, 9], required: [0, 3, 6, 9] },
  m7b5: { intervals: [0, 3, 6, 10], required: [0, 3, 6, 10] },
  aug: { intervals: [0, 4, 8], required: [0, 4, 8] },
  '9': { intervals: [0, 2, 4, 7, 10], required: [0, 2, 4, 10] },
  m9: { intervals: [0, 2, 3, 7, 10], required: [0, 2, 3, 10] },
  maj9: { intervals: [0, 2, 4, 7, 11], required: [0, 2, 11] },
  add9: { intervals: [0, 2, 4, 7], required: [0, 2, 4] },
}

/**
 * Movable forms. Each is written at its open position — the E form is the shape
 * of E major, the A form the shape of A major — and moving it means adding the
 * same number to every fretted string, open strings included, which is what a
 * barre does.
 */
const FORMS: { root: PitchClass; shapes: Record<string, Fret[]> }[] = [
  {
    // Root on the sixth string.
    root: 4,
    shapes: {
      '': [0, 2, 2, 1, 0, 0],
      m: [0, 2, 2, 0, 0, 0],
      '7': [0, 2, 0, 1, 0, 0],
      m7: [0, 2, 0, 0, 0, 0],
      maj7: [0, 2, 1, 1, 0, 0],
      '6': [0, 2, 2, 1, 2, 0],
      m6: [0, 2, 2, 0, 2, 0],
      sus4: [0, 2, 2, 2, 0, 0],
      sus2: [0, 2, 4, 4, 0, 0],
      '7sus4': [0, 2, 0, 2, 0, 0],
      dim: [0, 1, 2, 0, null, null],
      dim7: [0, 1, 2, 0, 2, null],
      m7b5: [0, 1, 0, 0, null, null],
      aug: [0, 3, 2, 1, 1, 0],
      '9': [0, 2, 0, 1, 0, 2],
      m9: [0, 2, 0, 0, 0, 2],
      maj9: [0, 2, 1, 1, 0, 2],
      add9: [0, 2, 2, 1, 0, 2],
    },
  },
  {
    // Root on the fifth string.
    root: 9,
    shapes: {
      '': [null, 0, 2, 2, 2, 0],
      m: [null, 0, 2, 2, 1, 0],
      '7': [null, 0, 2, 0, 2, 0],
      m7: [null, 0, 2, 0, 1, 0],
      maj7: [null, 0, 2, 1, 2, 0],
      '6': [null, 0, 2, 2, 2, 2],
      m6: [null, 0, 2, 2, 1, 2],
      sus4: [null, 0, 2, 2, 3, 0],
      sus2: [null, 0, 2, 2, 0, 0],
      '7sus4': [null, 0, 2, 0, 3, 0],
      dim: [null, 0, 1, 2, 1, null],
      dim7: [null, 0, 1, 2, 1, 2],
      m7b5: [null, 0, 1, 0, 1, null],
      aug: [null, 0, 3, 2, 2, 1],
      '9': [null, 0, 2, 4, 2, 3],
      m9: [null, 0, 2, 4, 1, 3],
      add9: [null, 0, 2, 4, 2, 0],
    },
  },
]

/**
 * Shapes played at the nut, keyed by root pitch class and family. These are the
 * ones where a barre would be the wrong answer.
 */
const OPEN: Record<string, Fret[]> = {
  '0:': [null, 3, 2, 0, 1, 0],
  '0:7': [null, 3, 2, 3, 1, 0],
  '0:maj7': [null, 3, 2, 0, 0, 0],
  '2:': [null, null, 0, 2, 3, 2],
  '2:m': [null, null, 0, 2, 3, 1],
  '2:7': [null, null, 0, 2, 1, 2],
  '2:m7': [null, null, 0, 2, 1, 1],
  '2:maj7': [null, null, 0, 2, 2, 2],
  '2:sus4': [null, null, 0, 2, 3, 3],
  '2:sus2': [null, null, 0, 2, 3, 0],
  '5:maj7': [null, null, 3, 2, 1, 0],
  '7:': [3, 2, 0, 0, 0, 3],
  '7:7': [3, 2, 0, 0, 0, 1],
  '7:maj7': [3, 2, 0, 0, 0, 2],
  '11:7': [null, 2, 1, 2, 0, 2],
}

/**
 * Reduces any canonical suffix to a family the table carries.
 *
 * A simplification may only ever *omit* a note, never contradict one. Dropping
 * the thirteenth from a 13th chord leaves a dominant seventh, and every string
 * still belongs to what the chart asked for. Drawing a plain ninth for a `7b9`
 * would instead sound the natural ninth the chart flattens, and a plain seventh
 * for a `7b5` the fifth it lowers — so those give up and let the dialog show the
 * notes instead of a shape that is quietly wrong.
 *
 * Order matters the same way it does in `normalizeSuffix`: the minor tests run
 * after `maj` and `m7b5`, because those also begin with an `m`.
 */
export function familyOf(rawSuffix: string): { family: string; simplified: boolean } | null {
  const suffix = normalizeSuffix(rawSuffix)
  if (suffix in FAMILIES) return { family: suffix, simplified: false }

  const has = (text: string) => suffix.includes(text)
  const near = (family: string) => ({ family, simplified: true })

  if (suffix.startsWith('m7b5')) return near('m7b5')
  if (suffix.startsWith('dim')) return near(has('7') ? 'dim7' : 'dim')
  if (suffix.startsWith('aug')) return near('aug')

  // An altered fifth cannot be omitted: the shape would sound the natural one.
  if (has('b5') || has('#5') || has('+5')) return null

  if (suffix.startsWith('maj')) return near(has('9') && !has('add') ? 'maj9' : 'maj7')

  if (suffix.startsWith('m')) {
    // `madd9` has no seventh, so the minor triad is the honest subset.
    if (has('add')) return near('m')
    if (has('9')) return near('m9')
    if (has('7') || has('11') || has('13')) return near('m7')
    if (has('6')) return near('m6')
    return near('m')
  }

  if (has('sus2')) return near('sus2')
  if (has('7sus') || (has('sus') && has('7'))) return near('7sus4')
  if (has('sus')) return near('sus4')

  // A bare `4` (`A4`, `D4`, `E4`) is how chord sites shorten `sus4` — never a
  // stacked 11th, since nothing else in the suffix asks for one.
  if (suffix === '4') return near('sus4')

  // A sixth and a ninth together is not a dominant: no seventh belongs in it.
  if (has('6') && has('9')) return near('add9')
  if (has('add9')) return near('add9')
  if (has('add')) return near('')

  // An altered ninth keeps the seventh underneath and simply loses the alteration.
  if (has('b9') || has('#9')) return near('7')
  if (has('9')) return near('9')
  if (has('7') || has('11') || has('13')) return near('7')
  if (has('6')) return near('6')

  return null
}

/** The notes a shape actually sounds, low to high, as pitch classes. */
export function shapeNotes(frets: Fret[], instrument: Instrument = 'guitar'): PitchClass[] {
  const strings = TUNING[instrument]
  const notes: PitchClass[] = []

  frets.forEach((fret, string) => {
    if (fret !== null) notes.push(mod12(strings[string] + fret))
  })
  return notes
}

/**
 * The twelve pitch classes as bits of one integer.
 *
 * The search below tries about thirteen thousand fingerings per chord, and the first
 * version asked `shapeNotes` for an array and built two Sets for each one: 168 ms to
 * answer a capo suggestion for a ten-chord song, in a synchronous render, on the first
 * press. As bitmasks the same question is an `&`, the masks for the chord are computed
 * once instead of thirteen thousand times, and the answer is the same one — which the
 * tests check independently, over every root and family of both instruments.
 */
function maskOf(intervals: number[], root: PitchClass): number {
  return intervals.reduce((mask, interval) => mask | (1 << mod12(root + interval)), 0)
}

function soundedMask(frets: Fret[], strings: PitchClass[]): number {
  let mask = 0
  for (let string = 0; string < frets.length; string += 1) {
    const fret = frets[string]
    if (fret !== null) mask |= 1 << mod12(strings[string] + fret)
  }
  return mask
}

/** Four frets under one hand, and where a ukulele stops being one. */
const REACH = 3
const LAST_FRET = 12

/**
 * The frets a hand covers without leaving the nut, which is where a chart wants to be.
 *
 * `REACH` is the span of one hand; planted at the nut that hand reaches the fourth
 * fret, and every shape a ukulele book prints on its first pages lives inside it.
 */
const COMFORT = REACH + 1

/**
 * Strings left silent with a sounding string on either side of them.
 *
 * Not the same concession as an outer string left out, which is why the two are counted
 * separately: an outer string is one the strum simply misses, while an inner one has to
 * be damped while its neighbours ring — on four strings played with a thumb or the back
 * of the nails, that is a different technique rather than a harder version of the same
 * one.
 */
function silentInside(frets: Fret[]): number {
  const sounding = frets
    .map((fret, string) => (fret === null ? -1 : string))
    .filter((string) => string !== -1)
  if (sounding.length === 0) return 0

  let count = 0
  for (let string = sounding[0]; string < sounding[sounding.length - 1]; string += 1) {
    if (frets[string] === null) count += 1
  }
  return count
}

/**
 * How a ukulele voicing is judged, lowest cost first: strings damped in the middle of
 * the chord, then whether the hand has to leave the first four frets, then strings left
 * out at the edges, then how far up the neck it sits, then how far the hand has to
 * stretch, then how many fingers it takes.
 *
 * The order of the last three is the whole difference between a chart someone would
 * recognise and one they would not. Ranked by stretch first, the search answers F
 * with 5555 — four fingers in a row at the fifth fret, span zero, perfectly valid and
 * not what anybody plays — instead of 2010 at the nut. Position first, and the famous
 * shapes appear on their own.
 *
 * **Leaving the nut costs more than dropping an outer string**, and that ordering is
 * the answer to a real complaint. Silence-first alone is defensible on an instrument
 * with only four strings — one of them is a quarter of the sound — but taken absolutely
 * it bought that quarter at any price: a D diminished came out `7545`, at the seventh
 * fret, where `121x` at the first sounds the same three notes and simply leaves the A
 * string alone. Nobody climbs to the seventh fret to keep a string the chord does not
 * need. An *inner* string is a different matter and outranks even position: F
 * diminished can be had at the first fret only by damping the C string between two
 * ringing ones, so it stays where it was, at `4542`.
 *
 * None of this can disturb a shape that was already at home. Every winner inside the
 * first four frets scores zero on the first three terms — nothing there is silent at
 * all — so it still beats everything above them, and among the shapes down there the
 * order is the one this function always used. Where no low voicing exists — a major
 * ninth needs four distinct tones and can be out of reach — every candidate scores the
 * same on position and the ranking below decides exactly as it did before.
 */
function cost(frets: Fret[]): number[] {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0)
  const highest = fretted.length === 0 ? 0 : Math.max(...fretted)
  const span = fretted.length === 0 ? 0 : highest - Math.min(...fretted)

  return [
    silentInside(frets),
    highest > COMFORT ? 1 : 0,
    frets.filter((fret) => fret === null).length,
    highest,
    span,
    fretted.length,
  ]
}

function cheaper(one: number[], other: number[]): boolean {
  for (let index = 0; index < one.length; index += 1) {
    if (one[index] !== other[index]) return one[index] < other[index]
  }
  return false
}

/** Answers are the same every time, and the same chord is asked for again and again. */
const searched = new Map<string, Fret[] | null>()

/**
 * The best ukulele voicing, or null when four strings cannot hold the chord.
 *
 * Null is a real answer, not a failure: `m9` needs four distinct tones, so one root in
 * twelve has no voicing inside twelve frets, and the dialog then shows the notes —
 * which is more use than a shape at the fourteenth fret of an instrument that has
 * twelve.
 */
function ukuleleShape(root: PitchClass, family: string): Fret[] | null {
  const key = `${root}:${family}`
  const known = searched.get(key)
  if (known !== undefined) return known

  const spec = FAMILIES[family]
  const allowed = maskOf(spec.intervals, root)
  const required = maskOf(spec.required, root)
  const strings = TUNING.ukulele

  let best: Fret[] | null = null
  let bestCost: number[] | null = null

  for (let base = 0; base + REACH <= LAST_FRET; base += 1) {
    const options: Fret[] = [null, 0]
    for (let fret = base; fret <= base + REACH; fret += 1) if (fret > 0) options.push(fret)

    for (const a of options) {
      for (const b of options) {
        for (const c of options) {
          for (const d of options) {
            const frets = [a, b, c, d]
            const sounded = soundedMask(frets, strings)

            // Nothing foreign, nothing missing, and something sounding.
            if (sounded === 0) continue
            if ((sounded & ~allowed) !== 0) continue
            if ((sounded & required) !== required) continue

            const price = cost(frets)
            if (bestCost === null || cheaper(price, bestCost)) {
              best = frets
              bestCost = price
            }
          }
        }
      }
    }
  }

  searched.set(key, best)
  return best
}

/** Every candidate shape for a root and family on one instrument. */
export function candidates(
  root: PitchClass,
  family: string,
  instrument: Instrument = 'guitar',
): Fret[][] {
  if (instrument === 'ukulele') {
    const found = ukuleleShape(root, family)
    return found === null ? [] : [found]
  }

  const found: Fret[][] = []

  const open = OPEN[`${mod12(root)}:${family}`]
  if (open !== undefined) found.push(open)

  for (const form of FORMS) {
    const shape = form.shapes[family]
    if (shape === undefined) continue

    const offset = mod12(root - form.root)
    found.push(shape.map((fret) => (fret === null ? null : fret + offset)))
  }

  return found
}

function highestFret(frets: Fret[]): number {
  return Math.max(...frets.map((fret) => fret ?? 0))
}

/**
 * The shape to draw for a chord, or null when there is none to draw.
 *
 * On a guitar a curated open shape wins outright, and otherwise the movable form that
 * sits lowest on the neck, which is what keeps a Bb from being drawn at the tenth fret
 * when the sixth will do. On a ukulele the search has already chosen.
 */
/**
 * A shape written the way a chord chart prints it: one cell per string, low to high,
 * `x` for a string that is not played and `0` for one left open — `320003` for a G,
 * `x32010` for a C.
 *
 * Run together when every cell is a single character, which is the whole of the open
 * position and most of what a song ever asks for, and spaced out the moment one of them
 * is not: a barre at the tenth fret would otherwise print `101212101010` and mean
 * nothing at all. Spacing rather than truncating, because a shape up the neck is exactly
 * where a reader most needs the numbers.
 */
export function fingeringText(frets: Fret[]): string {
  const cells = frets.map((fret) => (fret === null ? 'x' : String(fret)))
  return cells.some((cell) => cell.length > 1) ? cells.join(' ') : cells.join('')
}

export function shapeFor(chord: Chord, instrument: Instrument = 'guitar'): ChordShape | null {
  const resolved = familyOf(chord.suffix)
  if (resolved === null) return null

  const options = candidates(chord.root, resolved.family, instrument)
  if (options.length === 0) return null

  const openShape = instrument === 'guitar' ? OPEN[`${mod12(chord.root)}:${resolved.family}`] : undefined
  const best =
    openShape !== undefined
      ? openShape
      : options.reduce((a, b) => (highestFret(b) < highestFret(a) ? b : a))

  return { frets: best, family: resolved.family, simplified: resolved.simplified }
}

/**
 * Whether this chord is one a hand holds in open position.
 *
 * Two conditions, and the same two on either instrument: **at least one string left
 * open**, and **nothing past the third fret**. An open string is what a barre takes
 * away — a barre stops all six — so "has an open string" says "no barre" without
 * having to detect one, which is worth avoiding: three fingers side by side at the
 * second fret look exactly like a barre to any test for it, and that shape is an open
 * A, one of the easiest chords there is.
 *
 * It sorts the guitar's chords the way a player would: C, A, G, E, D, Am, Em and their
 * sevenths are easy; F, Bm, Bb, F#m are not, and those are precisely the chords a capo
 * gets put on to avoid. On a ukulele it separates C, F, Am and D from Bb and E the same
 * way.
 *
 * An earlier version asked instead whether the curated open-position table had an
 * entry. It looked principled and was wrong: open A reaches the page through a movable
 * form that happens to land at the nut, so the table has no entry for it and a capo
 * suggestion counted A as hard.
 *
 * Used to suggest a capo, so it has to rank fingerings sensibly rather than settle what
 * any given player finds hard.
 */
export function isEasyShape(root: PitchClass, suffix: string, instrument: Instrument): boolean {
  const shape = shapeFor(
    { root: mod12(root), rootName: 'C', suffix, bass: null, bassName: null },
    instrument,
  )
  if (shape === null) return false

  const fretted = shape.frets.filter((fret): fret is number => fret !== null && fret > 0)
  return shape.frets.includes(0) && (fretted.length === 0 || Math.max(...fretted) <= 3)
}

/**
 * The chord's notes as names, for the times a shape cannot be drawn — and as
 * something to read next to the one that can.
 */
export function chordNoteNames(chord: Chord): string[] {
  const resolved = familyOf(chord.suffix)
  const intervals = resolved === null ? [0] : FAMILIES[resolved.family].intervals
  // Follow the chord's own spelling: a Bb chord names its notes with flats.
  const flats = chord.rootName.includes('b')

  const names = intervals.map((interval) => spellPitchClass(mod12(chord.root + interval), flats))
  if (chord.bass !== null && !intervals.some((i) => mod12(chord.root + i) === chord.bass)) {
    names.push(spellPitchClass(chord.bass, flats))
  }
  return names
}
