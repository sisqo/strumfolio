'use client'

import { useEffect, useRef, useState } from 'react'

import { usePrefs } from '@/components/PrefsProvider'
import { IconStar } from '@/components/icons'

/**
 * How long the confirmation stays fully up, before it starts to go.
 *
 * Long enough to read three words while looking somewhere else, short enough that it is
 * gone before it is in the way.
 */
const HOLD_MS = 1500

/**
 * And how long it then takes to fade. **Must match `.favorite-flash.is-leaving`'s own
 * transition in globals.css**: this is what unmounts the element, and the two moving apart
 * would either cut the word off mid-fade or leave it sitting there invisible.
 */
const FADE_MS = 320

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

  /**
   * The word that appears for a moment after a tap, and the counter that makes it appear
   * *again* on the next one.
   *
   * The counter is the whole reason this is an object and not a string: the word arrives on
   * a CSS animation, and an animation does not replay because the text changed. Keying the
   * element by a number that always moves remounts it, so a reader tapping the star twice
   * in a second sees the second confirmation arrive rather than the text swapping silently
   * under a pill that is already halfway out.
   */
  const [flash, setFlash] = useState<{ id: number; text: string; leaving: boolean } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const taps = useRef(0)

  const clearTimers = () => {
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
  }

  /* The reading page swaps songs without unmounting, and a page can be left mid-flash.
     Clearing the timers on the way out is `CopyUrl`'s own precedent for the same shape. */
  useEffect(() => clearTimers, [])

  const tap = () => {
    toggleFavorite()

    clearTimers()
    taps.current += 1
    const id = taps.current

    setFlash({
      id,
      /* `on` is the state *before* this tap, so the word describes what just happened
         rather than what the button now offers. */
      text: on ? 'Removed from favorites' : 'Added to favorites',
      leaving: false,
    })

    /*
     * Two steps rather than one, and the second is what makes the word survive «reduce
     * motion»: the fade is a class this adds, not the tail of an animation that setting
     * collapses to nothing. See `.favorite-flash` in globals.css for the bug that taught it.
     * Both guard on the id, so a tap that lands during the fade of the one before it is not
     * then wiped by that older timer.
     */
    timers.current.push(
      setTimeout(() => {
        setFlash((current) => (current?.id === id ? { ...current, leaving: true } : current))
      }, HOLD_MS),
      setTimeout(() => {
        setFlash((current) => (current?.id === id ? null : current))
      }, HOLD_MS + FADE_MS),
    )
  }

  return (
    <span className="favorite-control">
      <button
        type="button"
        className={on ? 'btn is-inset song-heading-star is-on' : 'btn is-inset song-heading-star'}
        onClick={tap}
        aria-pressed={on}
        aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
        title={on ? 'Remove from favorites' : 'Add to favorites'}
      >
        <IconStar size={19} filled={on} />
      </button>

      {/*
        * Seen and not heard, deliberately. `aria-pressed` above already flips, and a screen
        * reader announces that flip as the outcome of the press — which is this same
        * message in that medium. A live region beside it would say it a second time, and
        * "Add to favorites, pressed. Added to favorites." is one confirmation too many.
        * This is the half a reader who can see the screen was missing: the star's own
        * change of colour and fill is easy to miss on a control you have just covered with
        * your thumb.
        */}
      {flash !== null && (
        <span
          key={flash.id}
          className={flash.leaving ? 'favorite-flash is-leaving' : 'favorite-flash'}
          aria-hidden
        >
          {flash.text}
        </span>
      )}
    </span>
  )
}
