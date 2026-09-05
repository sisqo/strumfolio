import type { Song } from '@/lib/data'

export interface Series {
  position: number
  total: number
  previous: string | null
  next: string | null
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
 * The slugs of the songbook this song is in, in the order `listSongs` reads it.
 *
 * Split out of `seriesOf` so the browser can build a *different* sequence from the same
 * order — the starred songs of this songbook, when the reader has the favorites filter on
 * (`favoritesSeries` below). The two must be cut from one list or the arrows and the list
 * behind them would disagree about what follows what.
 */
export function siblingsOf(song: Song, songs: Song[]): string[] {
  return songs
    .filter((entry) => entry.songbookSlug === song.songbookSlug)
    .map((entry) => entry.slug)
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
  siblings: readonly string[],
  favorites: ReadonlySet<string>,
  current: string,
): Series | null {
  if (!favorites.has(current)) return null
  return sequenceOf(
    siblings.filter((slug) => favorites.has(slug)),
    current,
  )
}

/** Where one slug sits among an ordered list of them, and what is either side of it. */
function sequenceOf(slugs: readonly string[], current: string): Series | null {
  const index = slugs.indexOf(current)
  if (index === -1 || slugs.length < 2) return null

  const at = (position: number): string | null => slugs[position] ?? null

  return {
    position: index + 1,
    total: slugs.length,
    previous: at(index - 1),
    next: at(index + 1),
  }
}
