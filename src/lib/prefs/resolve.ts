/**
 * What the app acts on, out of what the reader chose and what the song declares.
 *
 * Three preferences work this way and they all work the same: the reader's answer wins, the
 * song's own directive answers when the reader never gave one, and a fixed value answers when
 * neither does. `bpm` has done it since the metronome shipped; `capo` and `semitones` joined
 * it in `0048`, once `{capo: 3}` and `{transpose: 2}` were read instead of discarded.
 *
 * **Null is the whole mechanism.** It is «I never chose», and it has to be distinguishable
 * from a real zero — a reader who took the capo off chose 0, and seeding the song's fret over
 * that would put it back on somebody who had removed it on purpose. That distinction is why
 * the two columns stopped being `NOT NULL DEFAULT 0`.
 *
 * Here rather than inside a component because `npm test` reaches a module and not a React
 * tree, and because the reading screen, the booklet and Strum Together must not each arrive
 * at their own answer.
 */

import { clampCapo, clampSemitones } from './types'

/** The fret the capo is on: this reader's answer, then the song's, then none. */
export function resolvedCapo(chosen: number | null, declared: number | null): number {
  return clampCapo(chosen ?? declared ?? 0)
}

/** How far the chords move: this reader's answer, then the song's `{transpose: …}`, then not at all. */
export function resolvedSemitones(chosen: number | null, declared: number | null): number {
  return clampSemitones(chosen ?? declared ?? 0)
}

/**
 * Whether there is a song value to go back *to* — what the «back to the song's own» control
 * asks before offering itself.
 *
 * A song that declares nothing has nothing to return to, so the control stays hidden rather
 * than promising a journey to 0 that the ordinary stepper already makes.
 */
export function canTakeSongValue(chosen: number | null, declared: number | null): boolean {
  return declared !== null && chosen !== null
}
