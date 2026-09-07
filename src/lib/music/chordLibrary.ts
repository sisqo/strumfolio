/**
 * The whole chord table, for a page that lists it rather than for a song that uses it.
 *
 * Everywhere else in the app a shape is asked for one chord at a time, because a reader
 * tapped it. The two chart pages (`/tools/guitar-chords`, `/tools/ukulele-chords`) ask the
 * opposite question — *every* chord, in an order somebody can scan — so the ordering, the
 * spelling and the names live here rather than in the pages, and `npm test` covers them.
 *
 * Nothing here decides a fingering. Every shape comes from `shapesFor`, whose first entry
 * is `shapeFor`'s own answer, so the chart cannot draw a chord differently from the way the
 * reading screen draws it — the same property `CapoCalculator` is built on, and the reason
 * these pages are worth having at all rather than being a second table to maintain. The
 * whole list is carried and not just that first entry, because the chart offers the same
 * alternate-forms picker a song does (`ShapeCarousel`); on a ukulele that is four shapes a
 * chord rather than one, and all of them come out of the search that has already run.
 *
 * It is also why this module is pure and synchronous: the ukulele's shapes come from a
 * search, about thirteen thousand fingerings per chord, and a full library is two hundred
 * and sixteen of them. That is a second and a half of arithmetic — nothing at build time,
 * where it happens once, and unaffordable in a browser. Both pages are server components
 * for exactly that reason, and a client-side filter over this data would have to hide what
 * is already rendered rather than ask for it again.
 */

import { type Chord } from './chord'
import { type PitchClass } from './notes'
import {
  type ChordShape,
  type Instrument,
  chordNoteNames,
  fingeringText,
  shapesFor,
} from './shapes'

/** One chord type, in the order the chart prints it. */
export interface LibraryFamily {
  /** The key into `FAMILIES`, which is also the suffix written after the root. */
  family: string
  /** What the chord type is called in words — the card's own second line. */
  label: string
}

/**
 * Every family `shapes.ts` carries, ordered by how often a song asks for one rather than
 * alphabetically or by size: the triads and sevenths a chart is mostly made of first, then
 * the suspensions and the added ninth, then the ones that turn up a few times a year.
 *
 * All eighteen are here on purpose. A chart that lists what somebody already knows is a
 * chart nobody opens twice, and the diminished sevenths and half-diminisheds are precisely
 * the entries a player goes looking for a picture of.
 */
export const LIBRARY_FAMILIES: readonly LibraryFamily[] = [
  { family: '', label: 'Major' },
  { family: 'm', label: 'Minor' },
  { family: '7', label: 'Dominant seventh' },
  { family: 'm7', label: 'Minor seventh' },
  { family: 'maj7', label: 'Major seventh' },
  { family: '6', label: 'Sixth' },
  { family: 'm6', label: 'Minor sixth' },
  { family: 'sus2', label: 'Suspended second' },
  { family: 'sus4', label: 'Suspended fourth' },
  { family: '7sus4', label: 'Seventh suspended fourth' },
  { family: 'add9', label: 'Added ninth' },
  { family: '9', label: 'Dominant ninth' },
  { family: 'm9', label: 'Minor ninth' },
  { family: 'maj9', label: 'Major ninth' },
  { family: 'dim', label: 'Diminished' },
  { family: 'dim7', label: 'Diminished seventh' },
  { family: 'm7b5', label: 'Half-diminished' },
  { family: 'aug', label: 'Augmented' },
]

/** One root note, as the chart heads its section. */
export interface LibraryRoot {
  pitchClass: PitchClass
  /** The spelling the chart prints — `Eb`, not `D#`. */
  name: string
  /** The same note spelled the other way, for the five roots that have two names. */
  alias: string | null
}

/**
 * The twelve roots, chromatically, each spelled the way a chord chart spells it.
 *
 * Not `SHARP_NAMES` and not `FLAT_NAMES`: a book prints `C#` and `F#` but `Eb`, `Ab` and
 * `Bb`, and a page that renamed three of those to be internally consistent would be
 * consistent with itself and with nothing a player has ever read. The other spelling is
 * carried alongside rather than dropped, because it is the name somebody may be searching
 * for — a chart that has no `D#` on it anywhere looks like a chart missing a chord.
 *
 * The spelling is a name, never an argument: the same pitch class is the same shape either
 * way. What it does decide is how the *notes* are written, since `chordNoteNames` follows
 * the chord's own root name — so a Bb chord lists Bb, D and F rather than A#, D and F.
 */
export const LIBRARY_ROOTS: readonly LibraryRoot[] = [
  { pitchClass: 0, name: 'C', alias: null },
  { pitchClass: 1, name: 'C#', alias: 'Db' },
  { pitchClass: 2, name: 'D', alias: null },
  { pitchClass: 3, name: 'Eb', alias: 'D#' },
  { pitchClass: 4, name: 'E', alias: null },
  { pitchClass: 5, name: 'F', alias: null },
  { pitchClass: 6, name: 'F#', alias: 'Gb' },
  { pitchClass: 7, name: 'G', alias: null },
  { pitchClass: 8, name: 'Ab', alias: 'G#' },
  { pitchClass: 9, name: 'A', alias: null },
  { pitchClass: 10, name: 'Bb', alias: 'A#' },
  { pitchClass: 11, name: 'B', alias: null },
]

/** How many cards one instrument's chart carries — twelve roots by eighteen types. */
export const LIBRARY_SIZE = LIBRARY_ROOTS.length * LIBRARY_FAMILIES.length

/**
 * One candidate shape, with the text a chart prints under it.
 *
 * The fingering is carried rather than derived at the point of use because the chart's
 * picker is a client component: `fingeringText` lives in `shapes.ts` beside the whole
 * open-position table and the ukulele search, and none of that has any business being
 * shipped to a browser for a page that computed its answers at build time.
 */
export interface LibraryShape extends ChordShape {
  /** The same shape written out the way a chart prints it — `x32010`. */
  fingering: string
}

/** One card: a chord, every shape it has, and what to say when it has none. */
export interface LibraryChord {
  /**
   * The chord as it is printed — `C`, `Cm7`, `F#maj9`.
   *
   * One name, not two. The root's *other* spelling is on `LibraryRoot` and is said once
   * in the section heading, which is where a reader who came looking for `D#` needs to be
   * told they are in the right place. Repeating it on all eighteen cards underneath would
   * be eighteen more chord names in a card 152px wide, saying nothing the heading has not
   * already said.
   */
  name: string
  family: string
  label: string
  /**
   * Every shape this instrument has for the chord, best first — empty when it has none.
   *
   * `shapes[0]` is `shapeFor`'s own answer, which is what the card draws; the rest are
   * what the picker pages through. One array rather than a default plus a count: the two
   * used to be separate fields and the second was only ever read by a test, which is the
   * state a redundant field ends in.
   */
  shapes: LibraryShape[]
  /** The chord's notes, always — the whole answer on a card with no shape. */
  notes: string[]
}

/** One root's section of the chart. */
export interface LibraryGroup {
  root: LibraryRoot
  /** The heading's own anchor, so a jump list can point at it — `c-sharp`, `b-flat`. */
  id: string
  chords: LibraryChord[]
}

/**
 * A root's anchor: the letter, then the accidental in words.
 *
 * Spelled out rather than kept as `#`, which is a fragment identifier's own delimiter in a
 * URL and arrives at the page percent-encoded or not at all depending on who wrote the
 * link.
 */
export function rootAnchor(name: string): string {
  return name
    .replace('#', '-sharp')
    .replace('b', '-flat')
    .toLowerCase()
}

/** The chord `root` + `family` would be written as, given a spelling for the root. */
function chordName(rootName: string, family: string): string {
  return `${rootName}${family}`
}

function chordFor(root: LibraryRoot, family: string): Chord {
  return { root: root.pitchClass, rootName: root.name, suffix: family, bass: null, bassName: null }
}

/**
 * Every chord this instrument's chart shows, grouped by root.
 *
 * A chord with no shape keeps its card. Four strings genuinely cannot hold some ninths —
 * `shapesFor` returning nothing is an answer, not a failure — and a card saying so beside
 * the chord's notes is worth more than a gap where a reader would look for a picture and
 * conclude the page is broken.
 */
export function chordLibrary(instrument: Instrument): LibraryGroup[] {
  return LIBRARY_ROOTS.map((root) => ({
    root,
    id: rootAnchor(root.name),
    chords: LIBRARY_FAMILIES.map(({ family, label }) => {
      const chord = chordFor(root, family)

      return {
        name: chordName(root.name, family),
        family,
        label,
        shapes: shapesFor(chord, instrument).map((shape) => ({
          ...shape,
          fingering: fingeringText(shape.frets),
        })),
        notes: chordNoteNames(chord),
      }
    }),
  }))
}

/**
 * How many of one instrument's chords have no shape at all — the number the page states
 * about itself, counted rather than written down, so it cannot go stale when a family is
 * added or the ukulele search is retuned.
 */
export function unplayableCount(instrument: Instrument): number {
  return chordLibrary(instrument).reduce(
    (total, group) => total + group.chords.filter((chord) => chord.shapes.length === 0).length,
    0,
  )
}

/**
 * How many boxes one instrument's chart draws in total, alternatives included — the
 * second number the pages state about themselves, counted for the same reason
 * `unplayableCount` is: it is a property of the shape search, and the search is retuned
 * from time to time. `LIBRARY_SIZE` counts chords and is a constant; this counts shapes
 * and is not.
 */
export function shapeCount(instrument: Instrument): number {
  return chordLibrary(instrument).reduce(
    (total, group) => total + group.chords.reduce((sum, chord) => sum + chord.shapes.length, 0),
    0,
  )
}
