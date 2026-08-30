'use client'

/**
 * The parts of the reading page that have to follow the song rather than the page.
 *
 * Each is a few lines around a component that still takes plain props, so the
 * pieces themselves stay testable and reusable — the preview inside the editing
 * form renders the same sheet with no provider anywhere near it.
 */

import { useMemo, useState } from 'react'

import { CommentsToggle } from '@/components/CommentsToggle'
import { useComments } from '@/components/CommentsProvider'
import { ControlBar, type NavSteps } from '@/components/ControlBar'
import { EditSongLink } from '@/components/EditSongLink'
import { usePrefs } from '@/components/PrefsProvider'
import { SongSheet } from '@/components/SongSheet'
import { useSong } from '@/components/SongProvider'
import { IconExternal, IconNote, IconPencil, IconPlus } from '@/components/icons'
import { chordTokens } from '@/lib/chordpro'
import { buildAnchorMap } from '@/lib/comments/anchorMap'
import { labelFor } from '@/lib/comments/reanchor'
import { fromSource } from '@/lib/editor/document'
import { transposeNoteText } from '@/lib/music/capo'

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
  const { song, deleted } = useSong()
  const links = [song.link1, song.link2, song.link3].filter((link) => link !== null)

  return (
    <header className="mb-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[1.6875rem] font-medium leading-[1.12] tracking-[-0.03em]">
          {song.title}
        </h1>
        <HeadingNotes />
        <EditSongLink slug={song.slug} placement="top" />
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

      <TransposeNote />
      <SongNote />

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
 * That the chords on this sheet are not the ones written in the file — a capo, a
 * transposition, or both — and that what's shown is still exactly what to play.
 *
 * The one thing on this screen that has to be here rather than in the reading panel:
 * the panel is shut almost all the time, and a capo or a transposition kept from
 * yesterday renames every chord on the page. Without this line the sheet would say Do
 * where it said Re and nothing would explain why — the sort of silent surprise this
 * app avoids elsewhere. Both facts belong in the same note for that reason: a reader
 * who left a capo on last time is exactly as likely to have left a transposition on,
 * and the risk the note exists to close is identical either way.
 *
 * It no longer names the key that comes out, because nothing on this screen names a
 * key any more. What it has to say is the half that was doing the work: the letters
 * below are what the hand does, whichever of the two moved them.
 *
 * Nothing at all when neither is set, because then there is nothing to explain.
 */
function TransposeNote() {
  const { song: prefs } = usePrefs()
  const text = transposeNoteText(prefs.capo, prefs.semitones)

  if (text === null) return null

  return (
    <p className="transpose-note mt-2.5">
      <IconNote size={13} />
      {text}
    </p>
  )
}

/**
 * A reminder to self, above the sheet rather than behind a button: the point of
 * "watch the bridge" or "capo 2, not 3" is to be read before the fingers start
 * moving, not found by whoever remembers a panel exists.
 *
 * Saved through the same debounced queue as the key and the capo — see
 * `PrefsProvider`'s own comment — so there is nothing here to explicitly save.
 * "Done" only closes the editor; every keystroke before it already queued.
 */
function SongNote() {
  const { song: prefs, setNote } = usePrefs()
  const [editing, setEditing] = useState(false)

  if (!editing) {
    if (prefs.note.trim() === '') {
      return (
        <button type="button" className="btn btn-quiet btn-sm mt-2.5" onClick={() => setEditing(true)}>
          <IconPlus size={13} />
          Add a note
        </button>
      )
    }

    return (
      <div className="song-note mt-2.5">
        <IconNote size={13} />
        <span className="song-note-text">{prefs.note}</span>
        <button
          type="button"
          className="song-note-edit"
          onClick={() => setEditing(true)}
          aria-label="Edit note"
        >
          <IconPencil size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2.5">
      <textarea
        autoFocus
        value={prefs.note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Capo 2, watch the bridge…"
        rows={2}
        className="form-field song-note-field text-sm"
      />
      <button type="button" className="btn btn-sm mt-2" onClick={() => setEditing(false)}>
        Done
      </button>
    </div>
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
        onOpen: (ids) => setOpen({ kind: 'read', ids }),
        onPlace: (anchor) =>
          setOpen({ kind: 'write', anchor, label: labelFor(fromSource(song.body), anchor) }),
      }}
    />
  )
}

/**
 * The chords are handed to the bar because a capo worth suggesting depends on which
 * chords the song actually holds — and they come from the live copy, so a chord added
 * in the editor counts the moment it is saved.
 */
export function LiveControlBar({ steps }: { steps: NavSteps | null }) {
  const { song, parsed } = useSong()
  return <ControlBar songSlug={song.slug} chords={chordTokens(parsed)} steps={steps} />
}
