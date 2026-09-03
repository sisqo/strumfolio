/**
 * How long a set will actually run: the arithmetic behind `/tools/setlist-length-calculator`.
 *
 * The first module in this app that belongs to a tool and to nothing else. The other two
 * tools borrow the app's own modules on purpose — the transposer and the capo calculator must
 * not be able to disagree with the reading screen — but a set's running time is a question the
 * app has never asked: nothing in a repertoire stores a duration, and no screen adds any up.
 * So it lives here rather than in `lib/music/`, where it would sit among modules the app
 * imports and imply a feature that does not exist.
 *
 * Pure, and every rule in it, for the reason the whole repo repeats: `npm test` reaches a
 * module and not a React tree. What that buys here specifically is the clock, which is the one
 * part a person will check against their own watch.
 *
 * **No `Date` and no `Intl` anywhere.** Times are minutes since midnight, integers, formatted
 * by hand. `prices.ts` documents the reason at length — a rendered string that depends on the
 * runtime's locale data is a string this project cannot promise — and a set that starts at
 * 22:30 and ends at 00:45 is exactly the case a `Date` would make interesting for no reason.
 */

/** Minutes in a day, for the one place the clock has to wrap. */
const DAY_MINUTES = 24 * 60

/**
 * A duration written the one way this reads: `M:SS`, `MM:SS`, or `H:MM:SS`.
 *
 * **A bare number is not a duration here, deliberately.** `4` at the end of a line is far
 * more often the end of a title — `Interlude 2`, `Blues No. 5`, `Take 4` — than it is four
 * minutes, and a calculator that quietly turned `Interlude 2` into a two-minute song called
 * «Interlude» would be wrong in a way nobody would think to check. Same argument retires
 * `3.45` (three and a half minutes, or three minutes forty-five?) and `4m10s`: one written
 * form, stated on the page, and everything else falls through to the default length where it
 * is visible as an assumption rather than invisible as a misreading.
 */
const DURATION = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/

/**
 * A trailing token that was *trying* to be a duration — reported rather than read as a word.
 *
 * A separator is required, and that requirement is the whole point: `Take 4` ends in a number
 * that is part of the title and must not be reported as a broken length, while `3:75` and
 * `3.45` are unmistakably somebody writing a duration this refuses to guess at. Found by the
 * test above, which is where the difference is written down.
 */
const DURATION_SHAPED = /^\d+[:.][\d:.]*$/

/**
 * Seconds from `H:MM:SS`, `MM:SS` or `M:SS`, or null when the token is not one of those.
 *
 * Minutes may run past 60 in the two-part form (`75:00` is a seventy-five minute set closer,
 * and refusing it would be pedantry), while seconds may not: `3:75` is a typo, not an hour
 * and a quarter, and reading it as 4:15 would be inventing music.
 */
export function parseDuration(token: string): number | null {
  const match = DURATION.exec(token)
  if (match === null) return null

  const hours = match[1] === undefined ? 0 : Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])

  /* In the three-part form the middle field is minutes-within-an-hour, so it has the same
     ceiling as seconds. Without this `1:75:00` would come back as two hours fifteen. */
  if (hours > 0 && minutes > 59) return null

  return hours * 3600 + minutes * 60 + seconds
}

/** One line of the box: a song, its length if it stated one, and whether it tried and failed. */
export interface SetlistSong {
  title: string
  /** Seconds, or null when the line named no length and the default applies. */
  seconds: number | null
  /**
   * True when the line ended in something duration-shaped that could not be read — `3:75`,
   * `1:2:3:4`. The page shows these rather than silently treating them as part of the title,
   * because a mistyped length is the one error that changes the total without looking wrong.
   */
  unreadable: boolean
}

/**
 * The songs in a pasted list, one per non-empty line.
 *
 * A length is taken from the end of the line, which is where every setlist anybody writes by
 * hand puts it. Everything before it is the title, untouched — no title-casing, no trimming
 * of the numbering somebody put at the front, because it is their list.
 */
export function readSetlist(text: string): SetlistSong[] {
  const songs: SetlistSong[] = []

  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.trim()
    if (line === '') continue

    const cut = line.lastIndexOf(' ')
    const tail = cut === -1 ? line : line.slice(cut + 1)
    const head = cut === -1 ? '' : line.slice(0, cut).trim()

    const seconds = parseDuration(tail)
    if (seconds !== null) {
      /* A line that is *only* a duration is a song with no name rather than a nameless
         length: somebody listing six lengths to add up is a real use of this box. */
      songs.push({ title: head === '' ? 'Untitled' : head, seconds, unreadable: false })
      continue
    }

    songs.push({ title: line, seconds: null, unreadable: DURATION_SHAPED.test(tail) })
  }

  return songs
}

/** What the set adds up to. */
export interface SetlistTotals {
  songs: number
  /** Seconds of music: the stated lengths, plus `defaultSeconds` for every song without one. */
  playSeconds: number
  /** Seconds of gaps: one gap *between* songs, so `songs − 1` of them and none after the last. */
  gapSeconds: number
  totalSeconds: number
  /** How many songs fell back on the default length — the number that makes the total a guess. */
  assumed: number
}

/**
 * Play time, gap time and the sum.
 *
 * The gap count is `songs − 1` and that is the whole of what makes this worth a function: a
 * gap belongs *between* two songs, and counting one after the last one adds a tuning break to
 * a set that has already finished. On a twenty-song set with a thirty-second gap that single
 * off-by-one is half a minute of pure fiction, which is exactly the size of error nobody
 * notices and everybody plans around.
 */
export function setlistTotals(
  songs: readonly SetlistSong[],
  defaultSeconds: number,
  gapSeconds: number,
): SetlistTotals {
  const playSeconds = songs.reduce((total, song) => total + (song.seconds ?? defaultSeconds), 0)
  const gaps = Math.max(0, songs.length - 1) * Math.max(0, gapSeconds)

  return {
    songs: songs.length,
    playSeconds,
    gapSeconds: gaps,
    totalSeconds: playSeconds + gaps,
    assumed: songs.filter((song) => song.seconds === null).length,
  }
}

/** `225` → `3:45`, `4530` → `1:15:30`. The form a musician writes a length in. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const rest = whole % 60

  const pad = (value: number) => String(value).padStart(2, '0')

  return hours === 0 ? `${minutes}:${pad(rest)}` : `${hours}:${pad(minutes)}:${pad(rest)}`
}

/**
 * `4530` → `1 h 16 min`. The same length said the way a set is talked about.
 *
 * Rounded up to the minute, not to the nearest: a set that runs 44:20 is a 45-minute set to
 * whoever booked the room, and rounding down would promise a slot the band overruns.
 */
export function formatSpoken(seconds: number): string {
  const minutes = Math.ceil(Math.max(0, seconds) / 60)
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} h`
  return `${hours} h ${rest} min`
}

/** `'21:30'` → minutes since midnight, or null when it is not a time. */
export function parseClockTime(value: string): number | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim())
  if (match === null) return null

  const hours = Number(match[1])
  if (hours > 23) return null

  return hours * 60 + Number(match[2])
}

/** Minutes since midnight → `'21:30'`. Wraps, so 25:10 is not a time this can print. */
export function formatClockTime(minutes: number): string {
  const wrapped = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES

  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

/** When the set ends, and whether that is tomorrow — which for a gig it usually is. */
export interface FinishTime {
  /** `'00:45'`, on a 24-hour clock. */
  clock: string
  /** True when the finish is past midnight, which the page says out loud rather than implying. */
  nextDay: boolean
}

/**
 * Start time plus running time, on a wall clock.
 *
 * Rounded up to the minute for the same reason `formatSpoken` is: a finish time is a promise
 * to somebody with keys to the venue, and the direction to be wrong in is late.
 */
export function finishTime(startMinutes: number, totalSeconds: number): FinishTime {
  const end = startMinutes + Math.ceil(Math.max(0, totalSeconds) / 60)

  return { clock: formatClockTime(end), nextDay: end >= DAY_MINUTES }
}
