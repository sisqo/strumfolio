'use client'

import { usePrefs } from '@/components/PrefsProvider'

/**
 * Do/Re/Mi or C/D/E — the alphabet the chords on the sheet are spelled in.
 *
 * It used to sit inline in the reading panel, right after Key and Capo and before
 * Show, because it reads like a property of the song: pick a notation and every
 * chord on the sheet gets relettered. But nothing about the song itself changes the
 * way a transposition or a capo does — the notation is a fact about the reader, not
 * the sheet, answered once and carried to whichever song is opened next. That is why
 * it lives here now, with the instrument and the theme, instead of behind the
 * per-song controls.
 *
 * The cost of the move is real and was named, not avoided: an anonymous guest
 * following a Strum Together broadcast has no account and never reaches this menu, so
 * once notation left the reading panel it left guests with no door to it at all.
 * That was decided anyway — a guest is stuck with whatever notation their own prefs
 * already held, for as long as the session lasts, with nowhere on their screen left
 * to change it.
 */
export function NotationPicker() {
  const { global, setNotation } = usePrefs()

  return (
    <div className="px-1.5 pb-1 pt-2">
      <p className="group-label mb-2">Notation</p>
      <span className="segment w-full" role="group" aria-label="Chord notation">
        <button
          type="button"
          className={
            global.notation === 'int' ? 'segment-button is-on flex-1' : 'segment-button flex-1'
          }
          aria-pressed={global.notation === 'int'}
          onClick={() => setNotation('int')}
        >
          C D E
        </button>
        <button
          type="button"
          className={
            global.notation === 'it' ? 'segment-button is-on flex-1' : 'segment-button flex-1'
          }
          aria-pressed={global.notation === 'it'}
          onClick={() => setNotation('it')}
        >
          Do Re Mi
        </button>
      </span>
    </div>
  )
}
