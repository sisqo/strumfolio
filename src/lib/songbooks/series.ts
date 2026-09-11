import type { Song } from '@/lib/data'

/**
 * A song the arrows can step to: where it leads, and what it is called.
 *
 * The title rides along because the reading bar names the neighbours on a wide screen —
 * «Rock of Ages ‹ … › Be Thou My Vision» rather than two bare chevrons — and the only
 * place that already holds every sibling's title is the read this module is built from.
 * Asking for it again from the browser would be a second request per song opened, for
 * two strings the server had in its hand.
 */
export interface SongStep {
  slug: string
  title: string
}

export interface Series {
  position: number
  total: number
  previous: SongStep | null
  next: SongStep | null
}

/**
 * Where a song sits among the others of its songbook: not just its section, but the
 * whole songbook in the order `listSongs` reads it — section by section, and inside
 * each the order somebody put them in — so the last song of one section is followed by
 * the first of the next. A songbook stays one sequence and the sections are its
 * structure: stopping at a boundary would mean going back and reopening a section in
 * the middle of an evening.
 *
 * `null` when the songbook holds only this one song: there is nothing to step through.
 */
export function seriesOf(song: Song, songs: Song[]): Series | null {
  return sequenceOf(siblingsOf(song, songs), song.slug)
}

/**
 * The songs of the songbook this song is in, in the order `listSongs` reads it.
 *
 * Split out of `seriesOf` so the browser can build a *different* sequence from the same
 * order — the starred songs of this songbook, when the reader has the favorites filter on
 * (`favoritesSeries` below). The two must be cut from one list or the arrows and the list
 * behind them would disagree about what follows what.
 *
 * Slugs *and* titles, not slugs alone: the narrowed sequence is built in the browser, so
 * anything the bar draws about a neighbour has to survive the narrowing. Handing over
 * slugs and looking the titles up separately would mean two lists to keep in step, which
 * is the drift this function exists to prevent.
 */
export function siblingsOf(song: Song, songs: Song[]): SongStep[] {
  return songs
    .filter((entry) => entry.songbookSlug === song.songbookSlug)
    .map((entry) => ({ slug: entry.slug, title: entry.title }))
}

/**
 * The same sequence, narrowed to the songs this reader has starred.
 *
 * `null` — meaning "there is no favorites sequence here, use the whole songbook" — in
 * three cases, and the third is the one worth naming: **the song being read is not itself
 * starred.** That happens constantly and innocently — a song reached from a link, from
 * "Recently played", or one whose star was just taken off while reading it — and the
 * answer must not be a pair of arrows leading somewhere the reader has no way to relate
 * to where they are. Falling back to the whole songbook is what keeps «previous» meaning
 * «the one before this one».
 *
 * The other two are `seriesOf`'s own: nothing to step through with fewer than two songs.
 */
export function favoritesSeries(
  siblings: readonly SongStep[],
  favorites: ReadonlySet<string>,
  current: string,
): Series | null {
  if (!favorites.has(current)) return null
  return sequenceOf(
    siblings.filter((step) => favorites.has(step.slug)),
    current,
  )
}

/** Where one song sits among an ordered list of them, and what is either side of it. */
function sequenceOf(steps: readonly SongStep[], current: string): Series | null {
  const index = steps.findIndex((step) => step.slug === current)
  if (index === -1 || steps.length < 2) return null

  const at = (position: number): SongStep | null => steps[position] ?? null

  return {
    position: index + 1,
    total: steps.length,
    previous: at(index - 1),
    next: at(index + 1),
  }
}
