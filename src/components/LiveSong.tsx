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
import { ControlBar, type NavSteps } from '@/components/ControlBar'
import { EditSongLink } from '@/components/EditSongLink'
import { SongControls } from '@/components/SongControls'
import { SongSheet } from '@/components/SongSheet'
import { useSong } from '@/components/SongProvider'
import { IconExternal } from '@/components/icons'
import { chordTokens } from '@/lib/chordpro'
import { buildAnchorMap } from '@/lib/comments/anchorMap'
import { labelFor } from '@/lib/comments/reanchor'
import { fromSource } from '@/lib/editor/document'

/**
 * Where this song sits in the sequence it is being read in.
 *
 * `within` names the **section** the song is in, while the two numbers count the whole
 * songbook — which is what the arrows step through, so it is what they should count.
 * The songbook itself is named by the way back at the top of the screen, one line above,
 * so saying it again here would be the same word twice on a phone-width line.
 */
export interface Place {
  position: number
  total: number
  within: string | null
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
export function SongHeading({ place }: { place: Place | null }) {
  const { song, parsed, deleted } = useSong()
  const links = [song.link1, song.link2, song.link3].filter((link) => link !== null)

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
          <HeadingNotes />
          <EditSongLink slug={song.slug} placement="top" />
        </div>
      </div>
      <p className="mt-2.5 flex flex-wrap items-center gap-2 text-base text-muted">
        {song.artist !== null && <span>{song.artist}</span>}
        {place !== null && (
          <span className="text-muted">
            {place.within !== null && `${place.within} · `}
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
 */
export function LiveControlBar({ steps }: { steps: NavSteps | null }) {
  const { song } = useSong()
  return <ControlBar songSlug={song.slug} steps={steps} />
}
