'use client'

/**
 * The parts of the reading page that have to follow the song rather than the page.
 *
 * Each is a few lines around a component that still takes plain props, so the
 * pieces themselves stay testable and reusable — the preview inside the editing
 * form renders the same sheet with no provider anywhere near it.
 */

import { useMemo } from 'react'

import { CommentsToggle } from '@/components/CommentsToggle'
import { useComments } from '@/components/CommentsProvider'
import { ControlBar } from '@/components/ControlBar'
import { useFavorites } from '@/components/FavoritesProvider'
import { EditSongLink } from '@/components/EditSongLink'
import { FavoriteButton } from '@/components/FavoriteButton'
import { SongControls } from '@/components/SongControls'
import { SongSheet } from '@/components/SongSheet'
import { useSong } from '@/components/SongProvider'
import { IconExternal } from '@/components/icons'
import { chordTokens } from '@/lib/chordpro'
import { buildAnchorMap } from '@/lib/comments/anchorMap'
import { labelFor } from '@/lib/comments/reanchor'
import { fromSource } from '@/lib/editor/document'
import { type Series, favoritesSeries } from '@/lib/songbooks/series'

/**
 * The sequence this song is being read in, and what it is cut from.
 *
 * Two shapes because the answer depends on something the server does not know: with the
 * favorites filter on, the arrows step between starred songs and the count counts those.
 * `series` is the whole songbook as the server worked it out; `siblings` is that
 * songbook's slugs in the same order, for the browser to narrow.
 */
export interface Sequence {
  series: Series | null
  siblings: string[]
}

/**
 * The sequence actually in force, resolved in one place because it is read in two.
 *
 * The title's own «Prima parte · 3 of 12» and the bar's «3/12» are the same fact told
 * twice, and on a phone they are not even both visible — the bar hides its count below
 * `sm`, which is exactly why the header carries one. Compute it separately in each and
 * the two drift apart the moment the filter is on: the arrows would step between five
 * favorites while the only count on screen said twelve.
 *
 * Falls back to the whole songbook whenever there is no favorites sequence to be had —
 * see `favoritesSeries` for the three ways that happens, of which "this song is not
 * starred" is the everyday one.
 */
function useSequence({ series, siblings }: Sequence): Series | null {
  const { song } = useSong()
  const { favorites, only } = useFavorites()

  return useMemo(() => {
    if (!only) return series
    return favoritesSeries(siblings, favorites, song.slug) ?? series
  }, [only, series, siblings, favorites, song.slug])
}

/** The three-segment track, in the header row beside Edit — where both reader boards put it. */
function HeadingNotes() {
  const { comments, mode, setMode } = useComments()
  return <CommentsToggle mode={mode} count={comments.length} onChange={setMode} />
}

/**
 * Title, artist, and where the song sits in whatever led here.
 *
 * No rule under it any more. The title sits on the same sheet as the words and is
 * the first thing on it, so a line drawn between them was separating a song from
 * itself; the space does the work.
 */
export function SongHeading({
  within,
  sequence,
}: {
  /** The **section** the song is in. The songbook is named by the way back one line above,
      so saying it again here would be the same word twice on a phone-width line. */
  within: string | null
  sequence: Sequence
}) {
  const { song, parsed, deleted } = useSong()
  const links = [song.link1, song.link2, song.link3].filter((link) => link !== null)
  const place = useSequence(sequence)

  /*
   * From the live copy, not the baked one, so a chord added in the editor counts towards
   * the capo suggestion the moment it is saved — the same reasoning `LiveControlBar` used
   * to give for handing the bar its chords.
   */
  const chords = useMemo(() => chordTokens(parsed), [parsed])

  return (
    <header className="mb-4">
      {/*
        * The title and what you can do to the song.
        *
        * On a phone the two controls drop to a line of their own under the title, which
        * the boards do not show — they draw one wide row — but a 44px notes track plus a
        * 44px pencil beside a title leaves the title a few characters wide at 390px, and
        * the title is the thing this screen is about. On anything wider they sit level
        * with it, as drawn.
        */}
      <div className="song-heading-row">
        <h1 className="text-[1.6875rem] font-medium leading-[1.12] tracking-[-0.03em]">
          {song.title}
        </h1>
        <div className="song-heading-actions">
          {/* First of the three: the one control here that is tapped before anything on
              the page has been read, and the only one every reader is offered. */}
          <FavoriteButton />
          <HeadingNotes />
          <EditSongLink slug={song.slug} placement="top" />
        </div>
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-base text-muted">
        {song.artist !== null && <span>{song.artist}</span>}
        {place !== null && (
          <span className="text-muted">
            {within !== null && `${within} · `}
            {place.position} of {place.total}
          </span>
        )}
      </p>

      {links.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          {links.map((link) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent underline underline-offset-2"
            >
              {link.replace(/^https?:\/\//, '')}
              <span className="sr-only">(opens in a new tab)</span>
              <IconExternal size={12} />
            </a>
          ))}
        </p>
      )}

      <SongControls songSlug={song.slug} chords={chords} />

      {/*
        * Said only when the server has answered that the row is gone — never
        * because it could not be reached, which is the ordinary state offline.
        */}
      {deleted && (
        <p className="notice notice-accent mt-3" role="status">
          This song has been deleted. It stays readable here, but will disappear from the list.
        </p>
      )}
    </header>
  )
}

/**
 * The sheet with this reader's own notes on it.
 *
 * The anchor map is rebuilt from the *live* body rather than the baked one, so a note
 * placed right after an edit lands in the coordinates the edit produced — `SongProvider`
 * swaps the body under this component the moment a save comes back.
 */
export function LiveSheet() {
  const { song, parsed } = useSong()
  const { comments, mode, setOpen } = useComments()

  const anchors = useMemo(() => buildAnchorMap(song.body), [song.body])

  return (
    <SongSheet
      song={parsed}
      notes={{
        anchors,
        comments,
        mode,
        onOpen: (ids, at) => setOpen({ kind: 'read', ids, at }),
        onPlace: (anchor, at) =>
          setOpen({ kind: 'write', anchor, label: labelFor(fromSource(song.body), anchor), at }),
      }}
    />
  )
}

/**
 * The bar needs nothing about the song's own chords any more: the capo suggestion and the
 * key both moved onto the sheet's own header (`SongControls`), and what is left here —
 * play, speed, Strum Together, the step to the next song — is the same on every song.
 *
 * The one thing it does still work out is which sequence the arrows step through, and it
 * does that through the same hook the title's own count uses so the two can never
 * disagree. `NavSteps` and `Series` are the same four fields, so there is nothing to map.
 */
export function LiveControlBar({ sequence }: { sequence: Sequence }) {
  const { song } = useSong()
  const steps = useSequence(sequence)
  return <ControlBar songSlug={song.slug} steps={steps} />
}
