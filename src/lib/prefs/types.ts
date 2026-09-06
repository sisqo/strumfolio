import type { Accidentals, Notation } from '../music/chord'
import type { Instrument } from '../music/shapes'

export { clampCapo } from '../music/capo'

/**
 * How much of a chord the sheet draws. A reader's preference, like the notation — the
 * same person wants the same answer on the phone and on the tablet.
 *
 * Four answers, and they split in two along a line worth naming: `name` and `shape`
 * decide what sits **above each syllable**, while `diagrams` and `fingerings` leave the
 * syllables alone and put one summary **above the whole song**. The two summaries are
 * what a reader consults once, before starting; `shape` is what a reader who does not
 * yet know the shapes needs on every line, and it is the only one of the four that costs
 * the song vertical space.
 *
 * `shape` is stored under a name from when there were only two of these, and stays that
 * way: it is written in every row that ever chose it, and renaming a value that is
 * already in the database buys a migration for nothing. `CHORD_DISPLAY_LABEL` is where
 * it gets the name a reader sees.
 */
export type ChordDisplay = 'name' | 'shape' | 'diagrams' | 'fingerings'

/**
 * In the order the menu offers them: heaviest first, down to the default that costs
 * the song nothing. `ChordDisplayMenu`'s own rows are what this order is for — it
 * runs from "a panel above the whole song" down to "nothing but the name", the reverse
 * of ranking by how little each one asks of the screen.
 */
export const CHORD_DISPLAYS: ChordDisplay[] = ['diagrams', 'fingerings', 'shape', 'name']

/**
 * Every notation a reader can pick, in the order `NotationPicker` draws them: the two
 * alphabets that can also be *read* from a source first (`readRoots`), then the two that
 * only ever get written out.
 */
export const NOTATIONS: Notation[] = ['int', 'it', 'de', 'nash']

/** The label each one wears on its own button, short enough for a quarter of a menu. */
export const NOTATION_LABEL: Record<Notation, string> = {
  int: 'C D E',
  it: 'Do Re Mi',
  de: 'C D H',
  nash: '1 4 5',
}

/**
 * What the button would say if it had room — its accessible name, and the only place the
 * four are named in words.
 *
 * `C D H` and `1 4 5` are legible to the reader who wants them and opaque to everyone
 * else, which is the right trade for a button this size but leaves a screen reader
 * announcing three letters. German is named by the thing that distinguishes it, because
 * "German" alone would not say why a chord sheet in it looks almost identical.
 */
export const NOTATION_TITLE: Record<Notation, string> = {
  int: 'International: C, D, E',
  it: 'Italian: Do, Re, Mi',
  de: 'German: H for B, B for B flat',
  nash: 'Nashville numbers: each chord as its degree of the key',
}

export const CHORD_DISPLAY_LABEL: Record<ChordDisplay, string> = {
  name: 'names',
  fingerings: 'fingerings',
  diagrams: 'diagrams',
  shape: 'diagrams inline',
}

/**
 * The full sentence each row in the Chords menu names itself with — distinct from
 * `CHORD_DISPLAY_LABEL` above, which is the word the compact chip badge shows
 * (`Chords: diagrams`) and is too short to stand alone as a row's own heading.
 */
export const CHORD_DISPLAY_TITLE: Record<ChordDisplay, string> = {
  diagrams: 'Diagrams before the song',
  fingerings: 'Fingerings before the song',
  shape: 'Diagrams in the lyrics',
  name: 'Names only',
}

/**
 * What each mode does, for the picker — one line, in the reader's own terms.
 *
 * `diagrams` and `fingerings` carry a generic fallback here, not their real sentence:
 * the Chords menu prefers to say it with the song's own chords ("All 6 shapes…", "One
 * line per chord: G 320003") and reaches for this only when there is nothing of the
 * reader's own to show — a song with no chords, or none the shape table recognises.
 */
export const CHORD_DISPLAY_HINT: Record<ChordDisplay, string> = {
  name: 'The name above the syllable, nothing else',
  fingerings: 'Fret numbers, once above the song',
  diagrams: 'Chord boxes, once above the song',
  shape: 'Drawn on the word where the chord falls',
}

/** Preferences that belong to the reader, not to any one song. */
export interface GlobalPrefs {
  /** Index into ZOOM_STEPS. */
  zoomStep: number
  notation: Notation
  /** Which instrument the chord shapes are drawn for. */
  instrument: Instrument
  chordDisplay: ChordDisplay
  /**
   * Whether the chords on the page are written with sharps or with flats.
   *
   * A reader's preference and not a song's: someone who reads `A#` more easily than `Bb`
   * reads it that way in every song, the same as with the notation beside it. It also
   * has nothing to say about the *key* — see `readChord`: this changes the letters and
   * nothing else.
   */
  accidentals: Accidentals
}

/** Preferences that belong to a song: the key you sing it in, the speed you read it at. */
export interface SongPrefs {
  semitones: number
  /** Index into SCROLL_SPEEDS. */
  scrollSpeed: number
  /**
   * Which fret the capo is on, 0 for none.
   *
   * A decision about this song — "I play this one with the capo at 2" — so it sits
   * here with the transposition rather than among the reader's global preferences: a
   * capo kept globally would silently change the chords of songs never opened.
   */
  capo: number
  /**
   * Which shape to draw instead of the default, for the chords of this song a reader has
   * picked an alternative for — never a preference kept across songs, the same reasoning
   * as `capo` just above.
   *
   * Keyed `${instrument}:${root}:${family}` — instrument because the two fingerboards
   * share nothing, root and family because that is the chord *as it is shown right now*,
   * after transposition and capo. Moving either later can make the key stop matching
   * anything on the page; nothing here notices or cleans that up; the reader simply sees
   * the default again until they pick once more.
   *
   * The value is the chosen shape's own fingering text (`fingeringText`, e.g. `'320003'`)
   * rather than an index into `shapesFor`'s list — an index would point at a different
   * shape the day that list's order changes, where a fingering that no longer appears
   * just falls back to the default on its own.
   */
  chordShapes: Record<string, string>
  /**
   * Whether this reader has starred the song.
   *
   * In this interface with the key and the capo because it is the same kind of fact —
   * something true of this reader and this song — and because every screen that already
   * reads a song's preferences should be able to ask this one without a second source.
   *
   * It is the one field here that does **not** travel through `saveSongPrefs`. The star
   * is a single tap on a control at the very top of a page that has just opened, which is
   * exactly the window in which a whole-row write would flush the defaults over the
   * reader's real capo — see `saveFavorite` and `PrefsProvider.toggleFavorite` for the
   * race written out in full. It is queued on its own key and written to its own column.
   */
  favorite: boolean
  /**
   * Whether this reader has chosen to see this song's tab blocks, rather than the
   * collapsed placeholder every tab starts under by default (v4.8).
   *
   * One flag for the whole song, not one per tab block: a song can hold more than one
   * `{start_of_tab}` … `{end_of_tab}`, and the choice is remembered "at the song level",
   * matching how a reader asked for it — there is nothing here to key a per-block answer
   * off with.
   *
   * The other field here that does **not** travel through `saveSongPrefs`, for the same
   * reason `favorite` just above does not: a tab can sit near the top of a song, so
   * tapping it open is exactly the "the instant the page opens" gesture that would flush
   * the defaults over a real capo — see `saveFavorite` and
   * `PrefsProvider.toggleTabsExpanded` for the race written out in full.
   */
  tabsExpanded: boolean
}

/** Font sizes for the sheet, in pixels. The text reflows; it is not a viewport zoom. */
export const ZOOM_STEPS = [14, 17, 20, 23, 26, 30] as const

/** Auto-scroll speeds in pixels per second. */
export const SCROLL_SPEEDS = [8, 13, 20, 28, 38, 50, 66, 86] as const

export const DEFAULT_GLOBAL_PREFS: GlobalPrefs = {
  zoomStep: 2,
  notation: 'int',
  instrument: 'guitar',
  chordDisplay: 'name',
  accidentals: 'sharp',
}

/**
 * Reads an instrument from a value that came out of the database or the cache.
 *
 * Anything unrecognised means the guitar rather than nothing: an unknown string is a
 * value from a newer version of the app or a corrupted cache, and neither is a reason
 * to show a reader no chord shapes at all.
 */
export function readInstrument(value: unknown): Instrument {
  return value === 'ukulele' ? 'ukulele' : 'guitar'
}

/**
 * Reads a chord display mode from a value that came out of the database or the
 * cache. Anything unrecognised means `name`, the mode the column defaults to and the
 * one that changes nothing for a reader who has never touched this preference.
 */
export function readChordDisplay(value: unknown): ChordDisplay {
  return CHORD_DISPLAYS.find((entry) => entry === value) ?? 'name'
}

/**
 * Reads an accidental preference from a value that came out of the database or the
 * cache. Sharps for anything unrecognised, which is the column's own default and so
 * the answer every row written before this preference existed already gives.
 */
export function readAccidentals(value: unknown): Accidentals {
  return value === 'flat' ? 'flat' : 'sharp'
}

/**
 * Reads a notation from a value that came out of the database, the cache, or a Strum
 * Together broadcast. International for anything unrecognised, matching both the column's
 * default and `DEFAULT_GLOBAL_PREFS`.
 *
 * It exists because the four places that used to narrow this inline did it by asking
 * whether the value was `int` and answering `it` if not — which was a correct pair of
 * answers while there were two notations and silently the wrong one the moment there were
 * four: a reader who had chosen German would have been handed Italian by their own cache,
 * with no error anywhere. One of those four also defaulted to `it` where the other three
 * defaulted to `int`; that disagreement goes with them.
 */
export function readNotation(value: unknown): Notation {
  return NOTATIONS.find((entry) => entry === value) ?? 'int'
}

/**
 * Reads the chord-shape overrides from a value that came out of the database or the
 * cache. An empty map for anything that is not a plain object of strings — a corrupted
 * or hand-edited value is not worth failing the rest of a song's preferences over, and
 * every key here is only ever a hint: `ChordPopup` falls back to the default shape the
 * moment a key does not resolve to one of the chord's own candidates anyway.
 */
export function readChordShapes(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}

export const DEFAULT_SONG_PREFS: SongPrefs = {
  semitones: 0,
  scrollSpeed: 3,
  capo: 0,
  chordShapes: {},
  favorite: false,
  tabsExpanded: false,
}

export function clampZoom(step: number): number {
  return Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(step)))
}

export function clampSpeed(step: number): number {
  return Math.max(0, Math.min(SCROLL_SPEEDS.length - 1, Math.round(step)))
}

/**
 * Transposition wraps at the octave: twelve semitones up is the same music, so
 * there is no reason to let the number run away.
 */
export function clampSemitones(semitones: number): number {
  const wrapped = Math.round(semitones) % 12
  if (wrapped > 6) return wrapped - 12
  if (wrapped < -5) return wrapped + 12
  return wrapped
}
