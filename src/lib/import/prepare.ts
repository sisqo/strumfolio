/**
 * Turns one paste into the songs it holds, ready for the screen to show.
 *
 * The three guesses — where the songs are cut, what is chords and what is words,
 * which lines are a heading — happen here, once, and everything after this point
 * works on the result rather than on the text. That is what lets the screen show
 * what it understood *before* anything is saved, which is the only real defence
 * against a heuristic: not being right every time, but being visible when wrong.
 */

import { type InputFormat, convert } from './convert'
import { deduce } from './deduce'
import type { Dialect } from './dialect'
import { splitSongs } from './split'

export interface PreparedSong {
  /** Stable through edits and removals, so React keeps each row's own state. */
  id: number
  title: string
  artist: string
  /** Comma-separated, as the fields hold them. */
  tags: string
  link1: string
  link2: string
  link3: string
  body: string
  format: InputFormat
  /**
   * The songbook the source claims, when it claims one.
   *
   * Not obeyed — the destination chosen on the screen is — but worth saying out
   * loud: re-importing an export means every song carries the filing it had, and
   * silently overruling all of it would be a surprise the next morning.
   */
  declares: string | null
  /**
   * The section it claims, when it claims one — obeyed, unlike `declares` above:
   * see `resolveSection`'s own comment on why a section name can win over the
   * chosen destination when a songbook name never does.
   */
  declaresSection: string | null
  /**
   * Whose conventions this song was read under.
   *
   * Shown, not merely carried: the same directive means different things in different
   * apps, so «understood as OnSong» is part of what the preview is *for*. A person who
   * can see it named can tell before saving whether the guess was right, which is the
   * same bargain the format label beside it already makes.
   */
  dialect: Dialect
}

export function prepareSongs(text: string): PreparedSong[] {
  return splitSongs(text).map((piece, index) => {
    const converted = convert(piece)
    const found = deduce(converted.body)

    return {
      id: index,
      title: found.title,
      artist: found.artist ?? '',
      tags: found.tags.join(', '),
      link1: found.link1 ?? '',
      link2: found.link2 ?? '',
      link3: found.link3 ?? '',
      body: found.body,
      format: converted.format,
      declares: found.songbookName,
      declaresSection: found.sectionName,
      dialect: found.dialect,
    }
  })
}
