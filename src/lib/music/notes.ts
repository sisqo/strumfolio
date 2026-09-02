/**
 * Pitch classes, enharmonic spelling, and key signatures.
 *
 * A pitch class is 0..11 with C = 0. Every spelling decision in the app comes
 * back to one rule: the target key decides whether accidentals are written as
 * sharps or flats, so transposing to Bb gives `Bb`, never `A#`.
 */

export type PitchClass = number

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * The same twelve, as a German chord sheet prints them: `H` for the note the tables
 * above call `B`, and `B` for the one they call `Bb`.
 *
 * Two cells differ and no others, which is the whole of the notation as it appears on a
 * chart. The classical German spellings — `Cis`, `Dis`, `Es`, `As`, `Ais` — are
 * deliberately not used, and the reason is that this app never prints a note on its own:
 * it prints a chord, which is a note plus a suffix, and those two do not compose. `A#m`
 * is a chord a German player reads; `Aism` is a word no songbook prints.
 *
 * `B` therefore names different pitches in the two notations, and that asymmetry is why
 * these are display tables with no counterpart on the reading side — see `readRoots`,
 * which has no German case precisely because a source's `[B]` could not be told apart
 * from an international one.
 */
export const GERMAN_SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H']
export const GERMAN_FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B', 'H']

/**
 * The seven degrees of the major scale and the five chromatic steps between them, as a
 * Nashville chart numbers them.
 *
 * Flats for the three degrees borrowed from the parallel minor and a sharp for the raised
 * fourth: that is the convention, not a preference, so this is the one table in the app
 * `GlobalPrefs.accidentals` does not reach. A reader's ♯/♭ answer says how to spell a
 * *letter*, and there are no letters here — `b3` is what a chart calls the flat third
 * whether or not the same reader wants to see `A#` rather than `Bb` elsewhere.
 */
const DEGREE_NAMES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7']

const NATURAL_PITCH_CLASS: Record<string, PitchClass> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

/** Note names in Italian, indexed the same way as the natural letters above. */
const ITALIAN_NOTE: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
}

export type Mode = 'major' | 'minor'

/**
 * For each pitch class, the key spelling with the fewest accidentals, and
 * whether that key writes its accidentals as flats.
 *
 * Two ties are resolved by convention rather than by counting: pitch class 6
 * major is written F# (6 sharps) instead of Gb (6 flats) because guitar music
 * overwhelmingly spells it that way, and pitch class 3 minor is written Ebm
 * instead of D#m for the same reason in the other direction.
 */
const MAJOR_KEYS: { name: string; flats: boolean }[] = [
  { name: 'C', flats: false },
  { name: 'Db', flats: true },
  { name: 'D', flats: false },
  { name: 'Eb', flats: true },
  { name: 'E', flats: false },
  { name: 'F', flats: true },
  { name: 'F#', flats: false },
  { name: 'G', flats: false },
  { name: 'Ab', flats: true },
  { name: 'A', flats: false },
  { name: 'Bb', flats: true },
  { name: 'B', flats: false },
]

const MINOR_KEYS: { name: string; flats: boolean }[] = [
  { name: 'Cm', flats: true },
  { name: 'C#m', flats: false },
  { name: 'Dm', flats: true },
  { name: 'Ebm', flats: true },
  { name: 'Em', flats: false },
  { name: 'Fm', flats: true },
  { name: 'F#m', flats: false },
  { name: 'Gm', flats: true },
  { name: 'G#m', flats: false },
  { name: 'Am', flats: false },
  { name: 'Bbm', flats: true },
  { name: 'Bm', flats: false },
]

/** Italian note names, mapped to the letter they are the same note as. */
const ITALIAN_LETTER: Record<string, string> = {
  do: 'C',
  re: 'D',
  mi: 'E',
  fa: 'F',
  sol: 'G',
  la: 'A',
  si: 'B',
}

/** `sol` before `si` so the longer name is not cut short by the shorter one. */
const ITALIAN_ROOT = /^(sol|do|re|mi|fa|la|si)([#b]*)/i

export interface RootRead {
  /** The root in international spelling, e.g. `Bb`, whatever the source wrote. */
  name: string
  /** What follows the root: the suffix, and any slash bass. */
  rest: string
  /** Whether the source wrote this root in Italian. */
  italian: boolean
}

/**
 * How the start of a chord token could be read, best guess first.
 *
 * Sources are Italian, and Italian sources write `[re]` and `[mi7]`, so both
 * notations have to be readable — the alternative is a repertoire whose chords
 * are inert text that cannot be transposed, respelled or drawn.
 *
 * Italian comes first, and that settles the one ambiguous token: `Do` is C, not a
 * D diminished spelled with the `o` alias. Italian charts write diminished as `°`
 * or `dim`, so this reading is the one that is nearly always meant.
 *
 * Both readings are returned because the first may not survive the suffix check:
 * `Fadd9` begins with `fa`, and `dd9` is not a suffix, so it has to fall back to
 * F plus `add9`.
 *
 * International roots stay uppercase-only — that is what keeps `[assolo]` from
 * parsing as A plus nonsense. Italian roots have to allow lowercase, because that
 * is how the sources write them, which does let words in: see the guard in
 * `parseChord`.
 */
export function readRoots(token: string): RootRead[] {
  const reads: RootRead[] = []

  const italian = ITALIAN_ROOT.exec(token)
  if (italian !== null) {
    reads.push({
      name: ITALIAN_LETTER[italian[1].toLowerCase()] + italian[2].toLowerCase(),
      rest: token.slice(italian[0].length),
      italian: true,
    })
  }

  const international = /^([A-G][#b]*)/.exec(token)
  if (international !== null) {
    reads.push({
      name: international[1],
      rest: token.slice(international[0].length),
      italian: false,
    })
  }

  return reads
}

/** Parses a note name such as `C`, `F#`, `Bbb` into a pitch class. */
export function noteToPitchClass(name: string): PitchClass | null {
  const match = /^([A-Ga-g])([#b]*)$/.exec(name.trim())
  if (!match) return null

  const letter = match[1].toUpperCase()
  let pc = NATURAL_PITCH_CLASS[letter]
  for (const accidental of match[2]) {
    pc += accidental === '#' ? 1 : -1
  }
  return mod12(pc)
}

export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12
}

/** Spells a pitch class, using flats or sharps as the target key requires. */
export function spellPitchClass(pc: PitchClass, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]
}

/** Rewrites an international note name in Italian: `Bb` becomes `Sib`. */
export function noteToItalian(name: string): string {
  const match = /^([A-G])([#b]*)$/.exec(name)
  if (!match) return name
  return ITALIAN_NOTE[match[1]] + match[2]
}

/**
 * Rewrites an international note name in German: `B` becomes `H`, `Bb` becomes `B`.
 *
 * Goes through the pitch class rather than substituting letters the way `noteToItalian`
 * does, because German is not a letter-for-letter map: `Bb` loses its accidental
 * entirely, so there is nothing to carry over. The round trip also settles the spellings
 * no reading screen produces but a source may still hold — `Cb` comes out `H`, the same
 * enharmonic answer the rest of the app gives it (see `readChord`).
 */
export function noteToGerman(name: string): string {
  const pc = noteToPitchClass(name)
  if (pc === null) return name
  return (name.includes('b') ? GERMAN_FLAT_NAMES : GERMAN_SHARP_NAMES)[pc]
}

/** Which degree of `tonic` a pitch class is, as a Nashville chart numbers it. */
export function degreeOf(pc: PitchClass, tonic: PitchClass): string {
  return DEGREE_NAMES[mod12(pc - tonic)]
}

export interface Key {
  pc: PitchClass
  mode: Mode
  /** Canonical spelling of this key, e.g. `Bb` or `F#m`. */
  name: string
  /** Whether music in this key writes accidentals as flats. */
  flats: boolean
}

/** The canonical key for a pitch class and mode. */
export function keyFor(pc: PitchClass, mode: Mode): Key {
  const table = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS
  const entry = table[mod12(pc)]
  return { pc: mod12(pc), mode, name: entry.name, flats: entry.flats }
}

/** Moves a key by a number of semitones, keeping its mode. */
export function transposeKey(key: Key, semitones: number): Key {
  return keyFor(mod12(key.pc + semitones), key.mode)
}

export const C_MAJOR: Key = keyFor(0, 'major')
