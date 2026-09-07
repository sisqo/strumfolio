/**
 * The arithmetic a metronome is made of, kept apart from the sound it makes.
 *
 * `useMetronome` holds an `AudioContext`, and an `AudioContext` cannot be created in
 * `node:test` — which is the whole test runner this repo has (see `CLAUDE.md`, and
 * `plans/testCard.ts` for the same split made for the same reason). So every decision that
 * can be made with numbers alone is made here: what a legal tempo is, how long a beat
 * lasts, which beats fall inside the next slice of time, and which of those carry the
 * accent. What is left in the hook is scheduling and oscillators, and nothing to reason
 * about.
 */

/**
 * The slowest and fastest the reader may set, and they are wider than music usually is on
 * purpose: 30 is a beat every two seconds, which is how a ballad in 4 gets counted in
 * half-notes, and 300 is the top of a punk tune counted in eighths. Nothing outside them
 * is a tempo somebody meant to type.
 */
export const MIN_BPM = 30
export const MAX_BPM = 300

/** What the metronome beats at when neither the reader nor the song has said anything. */
export const DEFAULT_BPM = 120

/** Four, when nothing says otherwise — the bar the overwhelming majority of this app's
 *  repertoire is in, and the one a reader who never opens the menu should get. */
export const DEFAULT_BEATS_PER_BAR = 4

/**
 * The bars the menu offers, in the order it draws them. `1` is not a bar at all: it is
 * every beat accented, which is the same sound as no accent, and it is how a reader turns
 * the accent off without a sixth control that means "off".
 *
 * A song can still hold a bar that is not on this list — `{time: 5/4}` is real — so this
 * is what the menu *offers*, never what a value may be: `clampBeatsPerBar` admits 1 to 12,
 * and `TempoMenu` adds the odd one out as a sixth button rather than lighting none.
 */
export const BEATS_PER_BAR_OPTIONS = [1, 2, 3, 4, 6] as const

/** The widest bar worth storing. Twelve is 12/8; past that a "bar" is a phrase. */
const MAX_BEATS_PER_BAR = 12

/**
 * How late a beat may be and still be played instead of dropped.
 *
 * Without it, «its moment has passed» would mean passed by a microsecond: a timer two
 * milliseconds late would silently drop a click that nobody could have told from an
 * on-time one, and the metronome would lose a beat here and there for no audible reason.
 * Thirty milliseconds is under the threshold at which two clicks stop sounding
 * simultaneous, so a beat inside it is played at its own (just-past) time, which the audio
 * clock renders as «now». Anything later than that is genuinely late and is dropped —
 * see `beatsDue`.
 */
const GRACE_SECONDS = 0.03

export function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)))
}

export function clampBeatsPerBar(value: number): number {
  return Math.max(1, Math.min(MAX_BEATS_PER_BAR, Math.round(value)))
}

/**
 * Reads a tempo from a value that came out of the database, the local cache, or a
 * `{tempo: …}` directive.
 *
 * `null` for anything that is not a number in range, and that answer is load-bearing rather
 * than defensive: null does not mean 120 here, it means **nobody has said**, which is what
 * lets the reader's own row fall back to the song's directive and the song's directive fall
 * back to the default. A `{tempo: fast}` — real files carry exactly that — is not a tempo
 * anything here can beat, so it says nothing rather than saying `NaN`.
 */
export function readBpm(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return null
  if (number < MIN_BPM || number > MAX_BPM) return null
  return Math.round(number)
}

/** The same narrowing for the bar, on the same terms: null is «nobody has said». */
export function readBeatsPerBar(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value.trim()) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) return null
  if (number < 1 || number > MAX_BEATS_PER_BAR) return null
  return Math.round(number)
}

/**
 * How many beats a `{time: …}` directive puts in a bar — the numerator, and nothing else.
 *
 * The denominator is deliberately dropped: what the accent needs to know is how many
 * clicks go by before the next downbeat, and 6/8 clicks six times whatever the eighth note
 * is worth. `{time: common}` and `{time: C}` are written by other apps and mean 4/4, but
 * they are not read here — a directive this cannot interpret says nothing, exactly as
 * `readBpm` refuses `fast`.
 */
export function parseTimeSignature(value: string): number | null {
  const match = /^\s*(\d{1,2})\s*\/\s*\d{1,2}\s*$/.exec(value)
  return match === null ? null : readBeatsPerBar(Number(match[1]))
}

/** Seconds between two beats. */
export function beatSeconds(bpm: number): number {
  return 60 / clampBpm(bpm)
}

/** One click, at a time on the audio clock. */
export interface Beat {
  /** `AudioContext.currentTime` this beat is to sound at. */
  time: number
  /** How many beats have gone by since the metronome started — what the accent counts. */
  index: number
  /** The first beat of a bar, drawn and sounded differently. */
  accent: boolean
}

/** Where the grid has got to: the next beat that has not been scheduled yet. */
export interface BeatPhase {
  time: number
  index: number
}

/**
 * The beats to schedule now, and where that leaves the grid.
 *
 * This is the shape a Web Audio metronome has to have, and the reason is worth stating
 * once: a `setInterval` that plays a click on every firing is audibly wrong within a
 * minute — timers are allowed to be late, and the lateness accumulates. So the timer
 * decides *what to schedule*, never *when a click sounds*; each beat is handed to the
 * audio clock ahead of time and lands exactly where the arithmetic put it. Every beat's
 * time comes from the phase, never from `now`, which is what keeps the grid even when the
 * timer is not.
 *
 * **A beat more than `GRACE_SECONDS` in the past is dropped rather than played late**, and
 * that is what
 * happens every time the phone is put in a pocket: `setTimeout` throttles to about once a
 * second in a hidden tab, so waking up to a phase two seconds behind is normal. Scheduling
 * those two seconds' worth would play them all at once — a burst, not a tempo. The phase
 * still advances over them by whole beats, so what comes back is the same grid, in step
 * with the bar, minus what nobody could have heard.
 *
 * The catch-up is arithmetic and not a loop, so a tab left hidden for an hour costs the
 * same as one hidden for a second.
 */
export function beatsDue(
  phase: BeatPhase,
  {
    now,
    horizon,
    seconds,
    beatsPerBar,
  }: {
    /** `AudioContext.currentTime` as this tick reads it. */
    now: number
    /** How far ahead to schedule. Longer than the tick, or a late timer leaves a gap. */
    horizon: number
    /** Seconds per beat, from `beatSeconds`. */
    seconds: number
    beatsPerBar: number
  },
): { beats: Beat[]; phase: BeatPhase } {
  let { time, index } = phase

  if (time < now - GRACE_SECONDS) {
    const missed = Math.ceil((now - GRACE_SECONDS - time) / seconds)
    time += missed * seconds
    index += missed
  }

  const beats: Beat[] = []
  const until = now + horizon
  while (time < until) {
    beats.push({ time, index, accent: index % Math.max(1, Math.round(beatsPerBar)) === 0 })
    time += seconds
    index += 1
  }

  return { beats, phase: { time, index } }
}
