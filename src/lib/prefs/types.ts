import type { Notation } from '../music/chord'
import type { Instrument } from '../music/shapes'

export { clampCapo } from '../music/capo'

/**
 * Whether the sheet shows a chord as its name (`Am`) or as its shape, drawn the same
 * size the name would take. A reader's preference, like the notation — the same
 * person wants the same answer on the phone and on the tablet.
 */
export type ChordDisplay = 'name' | 'shape'

/** Preferences that belong to the reader, not to any one song. */
export interface GlobalPrefs {
  /** Index into ZOOM_STEPS. */
  zoomStep: number
  notation: Notation
  /** Which instrument the chord shapes are drawn for. */
  instrument: Instrument
  chordDisplay: ChordDisplay
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
 * cache. Anything unrecognised means `name`, the mode every existing row already
 * answers with (the column defaults to it) and the one that changes nothing for a
 * reader who has never touched this preference.
 */
export function readChordDisplay(value: unknown): ChordDisplay {
  return value === 'shape' ? 'shape' : 'name'
}

export const DEFAULT_SONG_PREFS: SongPrefs = { semitones: 0, scrollSpeed: 3, capo: 0 }

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
