'use client'

import { usePrefs } from '@/components/PrefsProvider'
import { IconStar } from '@/components/icons'

/**
 * The star beside a song's title: this reader keeps this one to hand.
 *
 * In the header's action group with the notes track and the pencil, and first of the
 * three — it is the cheapest of them to reach for and the only one a reader taps without
 * having read anything yet.
 *
 * **No `useOnline` gate**, unlike `EditSongLink` right beside it, and the asymmetry is
 * the point rather than an oversight. Edit disables itself without a signal because the
 * editor route is `NetworkOnly` and the tap would fail the navigation outright; a star is
 * a preference with an offline queue behind it, so refusing it without a network would
 * break the one promise that queue exists to keep. It works in a rehearsal room with no
 * bars, the same as the capo.
 *
 * **No role gate either.** Which songs a reader reaches for is not a change to the
 * repertoire — the same reasoning `saveSongPrefs` gives for checking nothing — so this is
 * offered to anybody who can open the song at all, including a global owner looking at a
 * customer's account, whose stars are their own and never that customer's.
 *
 * The colour is `--accent`, which on a reading screen otherwise belongs to chords. That is
 * a declared exception, written down in `DESIGN.md` beside the Chord-First Rule: one glyph,
 * never an area, lit only when the value is not the default — the same licence the key
 * badge in `SongControls` already takes on this same screen.
 */
export function FavoriteButton() {
  const { song, toggleFavorite } = usePrefs()
  const on = song.favorite

  return (
    <button
      type="button"
      className={on ? 'btn is-inset song-heading-star is-on' : 'btn is-inset song-heading-star'}
      onClick={toggleFavorite}
      aria-pressed={on}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      title={on ? 'Remove from favorites' : 'Add to favorites'}
    >
      <IconStar size={19} filled={on} />
    </button>
  )
}
