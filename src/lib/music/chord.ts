/**
 * Chord parsing, suffix normalisation, transposition and formatting.
 *
 * Three rules govern spelling, and they are not the same rule:
 *
 * 1. Untransposed, a chord keeps the spelling the source wrote. A `Bb` in a
 *    song in C stays `Bb` — respelling it as `A#` because C major "uses sharps"
 *    would be wrong, since a borrowed flat chord is always written flat.
 * 2. Transposed, the target key decides. Moving that song up ten semitones puts
 *    it in Bb, where accidentals are flats, so `Ab` and never `G#`.
 * 3. A reader who has said which they want overrides both, at every shift including none
 *    at all. Rules 1 and 2 are what happens when nobody has said — and since v4.1 nobody
 *    reading a song is in that position, so `readChord` below, not `transposeChord`, is
 *    what every screen actually calls.
 *
 * Everything formats from the *canonical* suffix, never from the raw text of the
 * source. Without that step the claim "in international notation the display
 * matches the source" would only hold for files written consistently: a
 * hand-typed `Cmin7` would render as-is and would never map to `Do-7`.
 *
 * The root is read in either notation — `[re]` and `[D]` are the same chord — and
 * stored international, so the three rules above are about spelling the accidental,
 * not about which language the source used.
 */

import {
  type Key,
  type PitchClass,
  type RootRead,
  mod12,
  noteToItalian,
  noteToPitchClass,
  readRoots,
  spellPitchClass,
} from './notes'

export type Notation = 'it' | 'int'

/**
 * Which way the page writes an accidental — the reader's own answer, rule 3 above.
 *
 * A pair rather than a three-valued type with an "auto": the reading screen draws this
 * as two segments with one of them always lit, so there is no third state for it to
 * show. What the two rules below it would have decided is not lost — it is simply not
 * asked for once a reader has answered.
 */
export type Accidentals = 'sharp' | 'flat'

export interface Chord {
  root: PitchClass
  /** Spelling to display, e.g. `Bb`. Set from the source, or from the target key when transposed. */
  rootName: string
  /** Canonical suffix: '', 'm', 'm7', 'maj7', 'dim', 'aug', 'm7b5', 'sus4', … */
  suffix: string
  bass: PitchClass | null
  bassName: string | null
}

/**
 * Ordered alias rules, applied to the *start* of the suffix only. The first
 * match wins, so the specific patterns have to come before the general ones:
 * `m7b5` before `m`, and the whole major-seventh family before `m`, because
 * `maj7` also starts with an `m`.
 */
const SUFFIX_ALIASES: [RegExp, string][] = [
  [/^(?:ø7|ø|m7b5|min7b5|-7b5|m7-5|mi7b5)/, 'm7b5'],
  [/^(?:maj|Maj|MAJ|M|Δ|△|ma|j)(?=\d)/, 'maj'],
  [/^(?:maj|Maj|Δ|△)(?![a-z0-9])/, ''],
  [/^(?:dim|°|o)(?=7|$)/, 'dim'],
  [/^(?:aug|\+)(?![a-z0-9])/, 'aug'],
  [/^(?:min|mi|m|-)/, 'm'],
]

/** Reduces equivalent spellings of a suffix to one canonical form. */
export function normalizeSuffix(raw: string): string {
  const suffix = raw.trim()
  if (suffix === '') return ''

  for (const [pattern, replacement] of SUFFIX_ALIASES) {
    const match = pattern.exec(suffix)
    if (match) return replacement + suffix.slice(match[0].length)
  }
  return suffix
}

/**
 * The characters and tokens a real chord suffix is built from. This is the
 * second of two defences against reading an annotation as a chord: without it,
 * `[assolo]` parses as A plus a suffix of `ssolo`, and the word disappears from
 * the lyrics into a bogus chord.
 */
const VALID_SUFFIX =
  /^(?:maj|Maj|MAJ|M|Δ|△|ma|j|min|mi|m|-|dim|°|o|aug|\+|ø|sus|add|alt|[#b()\d,^/]|\s)*$/

/**
 * Parses a chord token as it appears between square brackets. Returns null for
 * anything that is not a chord, so annotations like `[x2]` or `[assolo]` pass
 * through the renderer as text instead of being mangled into a chord.
 *
 * The root must be an uppercase letter: chord names are written that way, and
 * accepting lowercase would let ordinary words in brackets parse as chords.
 */
export function parseChord(raw: string): Chord | null {
  const token = raw.trim()
  if (token === '') return null

  // Italian first, then international; see readRoots for why both, and why in
  // that order.
  for (const root of readRoots(token)) {
    const chord = build(root)
    if (chord !== null) return chord
  }

  return null
}

/** Completes one reading of a token, or rejects it so the next can be tried. */
function build(root: RootRead): Chord | null {
  const pc = noteToPitchClass(root.name)
  if (pc === null) return null

  // A trailing `/X` is a slash bass only when X is a note; `C6/9` is a suffix.
  let rawSuffix = root.rest
  let bassName: string | null = null

  const cut = root.rest.lastIndexOf('/')
  if (cut !== -1) {
    const bass = readRoots(root.rest.slice(cut + 1)).find((read) => read.rest === '')
    if (bass !== undefined) {
      rawSuffix = root.rest.slice(0, cut)
      bassName = bass.name
    }
  }

  /**
   * `[solo]`, `[mio]`, `[fallo]`: an Italian root followed by the bare `o` that
   * also means diminished. The alias is real, but these are words, and a word read
   * as a chord vanishes from the lyrics — the same failure `[assolo]` once caused.
   * Anyone who means it writes `sol°` or `soldim`.
   */
  if (root.italian && /^o7?$/i.test(rawSuffix)) return null

  if (!VALID_SUFFIX.test(rawSuffix)) return null

  return {
    root: pc,
    rootName: root.name,
    suffix: normalizeSuffix(rawSuffix),
    bass: bassName === null ? null : noteToPitchClass(bassName),
    bassName,
  }
}

/**
 * Moves a chord by a number of semitones, respelling it for the key it lands
 * in. At zero semitones the chord is returned untouched, so the source spelling
 * survives when the reader has not transposed anything.
 *
 * Rules 1 and 2, in other words — which no screen reaches any more (see `readChord`). It
 * survives as the statement of those rules and as what `renderChord` and their tests are
 * written against, ready for the day an «auto» segment asks a key to decide again.
 */
export function transposeChord(chord: Chord, semitones: number, targetKey: Key): Chord {
  if (semitones === 0) return chord

  const root = mod12(chord.root + semitones)
  const bass = chord.bass === null ? null : mod12(chord.bass + semitones)

  return {
    root,
    rootName: spellPitchClass(root, targetKey.flats),
    suffix: chord.suffix,
    bass,
    bassName: bass === null ? null : spellPitchClass(bass, targetKey.flats),
  }
}

/**
 * Italian practice here follows the jazz convention chosen for this app: a dash
 * for minor and a triangle for major seventh. International practice uses the
 * standard suffixes, so in that notation the display matches the source.
 */
const ITALIAN_SUFFIX: [RegExp, string][] = [
  [/^m7b5/, '-7b5'],
  [/^maj/, '△'],
  [/^dim/, '°'],
  [/^aug/, '+'],
  [/^m/, '-'],
]

function formatSuffix(suffix: string, notation: Notation): string {
  if (notation === 'int') return suffix

  for (const [pattern, replacement] of ITALIAN_SUFFIX) {
    const match = pattern.exec(suffix)
    if (match) return replacement + suffix.slice(match[0].length)
  }
  return suffix
}

function formatNote(name: string, notation: Notation): string {
  return notation === 'it' ? noteToItalian(name) : name
}

export function formatChord(chord: Chord, notation: Notation): string {
  const root = formatNote(chord.rootName, notation)
  const suffix = formatSuffix(chord.suffix, notation)
  const bass = chord.bassName === null ? '' : `/${formatNote(chord.bassName, notation)}`
  return root + suffix + bass
}

/*
 * There is no `formatKey` and no `keyLabel` here any more, and their absence is the
 * point: a key is now an internal fact about the chords, worked out to decide an
 * accidental. Nothing writes one down and nothing prints one, so nothing has to turn one
 * into text — the only names on screen are the chords' own.
 */

/**
 * A chord as it is *read*: moved by however far the reader has moved the song, and spelled
 * the way the reader asked. The one thing every chord on a sheet or in a booklet goes
 * through, and the reason `readShift`/`readKey` in `capo.ts` are named the way they are.
 *
 * **There is no target key here, and its absence is the change.** Rules 1 and 2 at the top
 * of this file both answer one question — "how should this accidental be written when
 * nobody has said?" — and since v4.1 somebody always has: `Accidentals` has no unset state,
 * because the control that sets it is two segments with one of them always lit. So the
 * spelling is a function of the pitch class and the reader's answer, and nothing on a
 * reading screen has to guess what key a song is in to decide a letter. See `key.ts`, which
 * still knows how to guess and currently has nobody to guess for.
 *
 * It respells at every shift, zero included. That is the whole of what the control does on
 * a song nobody has transposed, which is most songs.
 *
 * Only the letters move. A chord *is* its pitch classes here, so `Bb` and `A#` differ in
 * nothing this app does with them — same shape, same sound, same everything but what is
 * printed above the syllable. Naturals are spelled identically in both tables, so a source's
 * `Cb` comes out `B` either way: the enharmonic spelling a reader asking for plain sharps or
 * plain flats is asking for.
 */
export function readChord(chord: Chord, semitones: number, accidentals: Accidentals): Chord {
  const flats = accidentals === 'flat'
  const root = mod12(chord.root + semitones)
  const bass = chord.bass === null ? null : mod12(chord.bass + semitones)

  return {
    root,
    rootName: spellPitchClass(root, flats),
    suffix: chord.suffix,
    bass,
    bassName: bass === null ? null : spellPitchClass(bass, flats),
  }
}

/**
 * Convenience for the common path: parse, transpose and format in one go.
 * `targetKey` is the key the song is in *after* transposition.
 */
export function renderChord(
  raw: string,
  semitones: number,
  notation: Notation,
  targetKey: Key,
): string {
  const chord = parseChord(raw)
  if (!chord) return raw
  return formatChord(transposeChord(chord, semitones, targetKey), notation)
}
