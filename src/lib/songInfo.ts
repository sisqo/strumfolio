/**
 * What the info panel prints about a song: the fields the file declares and this app stores
 * nowhere, turned into labelled rows.
 *
 * Here rather than inside the component for the reason `plans/planChange.ts` states about its
 * own sibling: `npm test` in this repo reaches a module and not a React tree, and the two
 * rules below are exactly the kind that break quietly and are never noticed on screen.
 */

import type { ParsedSong } from './chordpro'

export interface InfoRow {
  label: string
  value: string
}

/**
 * The rows, in the order they are printed, or an empty list when the file says nothing —
 * which is nearly every song, and is what keeps the panel's own button off the header.
 *
 * `artist` comes from the row and not from the parse, because that is where it lives: the
 * importer consumes `{artist:}` into a column and strips the line, so the body a reader is
 * looking at usually carries no artist at all.
 */
export function songInfoRows(song: ParsedSong, artist: string | null): InfoRow[] {
  const rows: InfoRow[] = []
  const add = (label: string, value: string | null) => {
    if (value !== null && value.trim() !== '') rows.push({ label, value })
  }

  /*
   * A subtitle that only repeats the artist is not printed, and this is the one rule here
   * worth stating: of the 223 songs in the archive, 37 carry a `{subtitle:}` and **all 37
   * hold exactly what their artist column holds** — OnSong's convention, in files that
   * nothing identifies as OnSong, so the importer had no reason to consume them. Printing
   * them would put the same name twice, one line apart, on one song in six. A subtitle that
   * says something else is a real subtitle and is printed.
   *
   * Compared case-insensitively because the archive disagrees with itself on capitals
   * («Bandabardò» against «BandaBardò») and a capital is not a difference worth a row.
   */
  if (
    song.subtitle !== null &&
    (artist === null || song.subtitle.trim().toLowerCase() !== artist.trim().toLowerCase())
  ) {
    add('Subtitle', song.subtitle)
  }

  // The written key, printed exactly as the file spells it — `Sol` stays `Sol`. It is the
  // song's own statement about itself, not a chord this app is drawing, so nothing
  // transposes or respells it.
  add('Key', song.key)

  add('Composer', song.metadata.composer)
  add('Lyricist', song.metadata.lyricist)
  add('Album', song.metadata.album)
  add('Year', song.metadata.year)
  add('Duration', song.metadata.duration)
  add('CCLI', song.metadata.ccli)
  add('Copyright', song.metadata.copyright)

  /*
   * Last, and printed at all only because the alternative is a file field nobody can see.
   * They are sorting keys for a list this app does not build — it orders by title — so they
   * are the least interesting thing here and sit where the eye arrives last.
   */
  add('Sorts as', song.metadata.sortTitle)
  add('Artist sorts as', song.metadata.sortArtist)

  return rows
}
