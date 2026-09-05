/**
 * The capo: how far the chords you *read* are from the chords that *sound*.
 *
 * Two shifts live on this page at once and they are not the same shift, which is the
 * whole reason this is a module with tests rather than a subtraction inlined in a
 * component:
 *
 * - **Transposing** moves the sound. Up two semitones and the song comes out a tone
 *   higher, which is what you do when a key does not suit a voice.
 * - **A capo** moves the *hand* and leaves the sound alone. Clamp it on the second
 *   fret and every shape you finger is two semitones lower than what comes out, so
 *   the sheet has to show those lower shapes for the sound to stay put.
 *
 * Together: `read = written + semitones − capo`, while what sounds is `written +
 * semitones`. A capo of 2 with a transposition of +2 therefore shows the chords exactly
 * as written and sounds a tone above them — the case worth testing, because it is the
 * one where getting either sign wrong still looks plausible.
 *
 * Only the reading side has a function here. The sounding key had one too, until nothing
 * on the screen named a key any more; the sheet shows what the hand does, and what comes
 * out is the instrument's business.
 */

import { type Instrument, familyOf, isEasyShape } from './shapes'
import { type Key, type PitchClass, mod12, transposeKey } from './notes'
import { parseChord } from './chord'

/** Highest fret worth offering: above this a capo simplifies nothing. */
export const MAX_CAPO = 7

export function clampCapo(fret: number): number {
  return Math.max(0, Math.min(MAX_CAPO, Math.round(fret)))
}

/**
 * How many fret buttons the reading panel shows at once.
 *
 * Six, plus one cell for the arrow that reveals the rest — seven cells across a panel
 * that is 340px wide, which is the widest a 44px tap target survives. `MAX_CAPO + 1`
 * positions do not fit in six, hence the paging below.
 */
export const FRET_PAGE = 6

/**
 * The nearest place a run of `size` fret buttons can start and still show only frets.
 *
 * Never before the nut, and never so late that the row would have to draw empty cells
 * past `max` to stay full — for frets 0..7 and a page of six that is 2 at the most,
 * showing 2..7. Paging in the menu goes through this and nothing else: it moves the
 * window by one page and clamps, with no opinion about where the capo is.
 */
export function clampFretWindow(
  desired: number,
  max: number = MAX_CAPO,
  size: number = FRET_PAGE,
): number {
  const last = Math.max(0, max - size + 1)
  return Math.min(Math.max(Math.round(desired), 0), last)
}

/**
 * Where the run of fret buttons starts when the menu *opens*.
 *
 * Two things decide it, and the order matters: what was asked for, and then where the
 * capo actually is. The second always wins — a menu opened with the capo on fret 7 must
 * show fret 7, whatever page was asked for, or the row would claim a capo the reader
 * cannot see and the badge above it would be the only tell.
 *
 * Exactly once, though. This is the rule for the first page, not for every page after it:
 * run on each render, with the capo still on 0 as every song starts, it drags each page the
 * reader asks for straight back to the nut, and the arrow that pages forward does nothing.
 * That is what it did for a while, so the menu keeps the answer in state and pages with
 * `clampFretWindow` from then on.
 *
 * A function rather than clamping inline in the component because it is the one piece of
 * this control with a rule in it, and a rule belongs where a test can hold it: every
 * off-by-one here is invisible on screen (a row that looks fine and hides one fret).
 */
export function fretWindowStart(
  desired: number,
  capo: number,
  max: number = MAX_CAPO,
  size: number = FRET_PAGE,
): number {
  let start = clampFretWindow(desired, max, size)

  if (capo < start) start = capo
  else if (capo > start + size - 1) start = capo - size + 1

  return clampFretWindow(start, max, size)
}

/** How far to move the written chords to get the ones on the page. */
export function readShift(semitones: number, capo: number): number {
  return semitones - capo
}

/**
 * The key whose letters are on the page, which is where the capo shows up.
 *
 * Unread since v4.1, for the same reason and on the same terms as `estimateKey` itself —
 * see the note at the top of `key.ts`. `readShift` above, which is the half that says how
 * far the chords moved, is still what every sheet runs on.
 */
export function readKey(original: Key, semitones: number, capo: number): Key {
  return transposeKey(original, readShift(semitones, capo))
}

/**
 * How far the song has been moved from the key it was written in, in full — used as
 * the Key badge's accessible name, since the badge itself shows only the bare signed
 * number.
 */
export function formatSemitones(semitones: number): string {
  if (semitones === 0) return '0 semitones'
  const sign = semitones > 0 ? '+' : '−'
  const size = Math.abs(semitones)
  return `${sign}${size} ${size === 1 ? 'semitone' : 'semitones'}`
}

/**
 * The sentence that explains why the chords shown aren't the ones written.
 *
 * The booklet's per-song annotation is its only reader now. It used to be shared with the
 * reading screen, which carried the same sentence under the title precisely because capo
 * and transposition were hidden in a shut panel; since v4.1 the Key and Capo chips state
 * their values outright and that line was the same fact twice. A page being printed has no
 * chips, so it still needs the words.
 *
 * Null when neither capo nor transposition is set, because then there is nothing to
 * explain.
 */
export function transposeNoteText(capo: number, semitones: number): string | null {
  if (capo === 0 && semitones === 0) return null

  const facts: string[] = []
  if (capo !== 0) facts.push(`capo on fret ${capo}`)
  if (semitones !== 0) facts.push(`transposed ${formatSemitones(semitones)}`)

  return `${facts.join(', ')} · the chords are already what to play`
}

/** What a capo would do for the hands: how many of the song's chords come out easy. */
export interface CapoOption {
  fret: number
  easy: number
  total: number
}

/**
 * The distinct chords of a song, as root and family — the only two things a fingering
 * depends on. `[x2]` and `[assolo]` are dropped by the parser, and a suffix outside
 * the table keeps its chord in the count as a hard one, because that is what it is.
 */
function distinctChords(tokens: string[]): { root: PitchClass; suffix: string }[] {
  const seen = new Map<string, { root: PitchClass; suffix: string }>()

  for (const token of tokens) {
    const chord = parseChord(token)
    if (chord === null) continue

    const family = familyOf(chord.suffix)
    const suffix = family === null ? chord.suffix : family.family
    seen.set(`${chord.root}:${suffix}`, { root: chord.root, suffix })
  }

  return [...seen.values()]
}

/**
 * How many distinct chords a song has — the same count `easeByFret`'s own `total`
 * gives, exposed on its own for a caller that has no reason to also pay for
 * `easeByFret`'s per-fret search: the Chords menu wants this to say "6 in this song"
 * and never asks which frets are easy.
 */
export function distinctChordCount(tokens: string[]): number {
  return distinctChords(tokens).length
}

/** How many of these chords are easy to hold once moved by `shift`. */
function easeAt(
  chords: { root: PitchClass; suffix: string }[],
  shift: number,
  instrument: Instrument,
): number {
  return chords.filter((chord) =>
    isEasyShape(mod12(chord.root + shift), chord.suffix, instrument),
  ).length
}

/** How many of a song's chords are easy at every fret from 0 to `MAX_CAPO`, at once. */
export interface FretEase {
  /** Distinct chords in the song — what every count below is out of. */
  total: number
  /** Indexed by fret: how many of those chords are easy to hold there. */
  easyByFret: number[]
}

/**
 * The capo menu's own dots, one call for the whole row rather than one per cell.
 *
 * `easeOf` and `suggestCapo` below are both written in terms of this now, rather than
 * each running its own loop over the same frets — the menu asks the identical question
 * of every visible fret that `suggestCapo` already asks internally to find its one
 * answer, so computing it once and reading off an array is the same cost as before,
 * not six or eight times it. `isEasyShape` caches its own search per chord family
 * (`shapes.ts`'s own `searched` map), so the first fret asked anywhere pays the full
 * cost and every fret after — in this array or in a sibling call — reads it back.
 */
export function easeByFret(tokens: string[], semitones: number, instrument: Instrument): FretEase {
  const chords = distinctChords(tokens)
  const easyByFret = Array.from({ length: MAX_CAPO + 1 }, (_, fret) =>
    easeAt(chords, readShift(semitones, fret), instrument),
  )
  return { total: chords.length, easyByFret }
}

/** How the song sits under the hands as it is now: the baseline a suggestion must beat. */
export function easeOf(
  tokens: string[],
  semitones: number,
  capo: number,
  instrument: Instrument,
): CapoOption {
  const { total, easyByFret } = easeByFret(tokens, semitones, instrument)
  return { fret: capo, easy: easyByFret[capo], total }
}

/**
 * A capo worth suggesting, or null when none is.
 *
 * Null in three cases, all of them "there is nothing useful to say": a song with no
 * chords, a song already all easy, and a song no capo improves. Ties go to the lowest
 * fret, since a capo further up the neck shortens the instrument for nothing.
 *
 * It compares against the capo currently on, not against no capo at all: once a reader
 * has chosen the second fret, being told that the second fret would help is noise.
 */
export function suggestCapo(
  tokens: string[],
  semitones: number,
  capo: number,
  instrument: Instrument,
): CapoOption | null {
  const { total, easyByFret } = easeByFret(tokens, semitones, instrument)
  if (total === 0) return null

  const current = easyByFret[capo]
  if (current === total) return null

  let best: CapoOption | null = null

  for (let fret = 0; fret <= MAX_CAPO; fret += 1) {
    if (fret === capo) continue

    const easy = easyByFret[fret]
    if (best === null || easy > best.easy) best = { fret, easy, total }
  }

  return best !== null && best.easy > current ? best : null
}
