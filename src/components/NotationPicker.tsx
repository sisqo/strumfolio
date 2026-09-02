'use client'

import { usePrefs } from '@/components/PrefsProvider'
import { NOTATIONS, NOTATION_LABEL, NOTATION_TITLE } from '@/lib/prefs/types'

/**
 * Which alphabet the chords on the sheet are spelled in — Do/Re/Mi, C/D/E, the German
 * H/B convention, or Nashville numbers.
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
 * That was decided anyway — a guest reads in whatever notation the *leader* has set
 * on their own account, pushed in every poll (`PushBroadcastNotation` in
 * `FollowSession.tsx`), with nowhere on their own screen to override it.
 *
 * **Four answers now, in two rows** (`.segment.is-wrap`), and the two new ones are labelled
 * by the thing that gives them away rather than by name: `C D H` is where German differs
 * from international at all, and `1 4 5` is the progression every player recognises as
 * numbers. Neither says much to a reader who does not already want it, which is the right
 * trade at this size — `NOTATION_TITLE` is what a screen reader and a hover get instead.
 */
export function NotationPicker() {
  const { global, setNotation } = usePrefs()

  return (
    <div className="px-1.5 pb-1 pt-2">
      <p className="group-label mb-2">Notation</p>
      <span className="segment is-wrap w-full" role="group" aria-label="Chord notation">
        {NOTATIONS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={global.notation === entry ? 'segment-button is-on' : 'segment-button'}
            aria-pressed={global.notation === entry}
            aria-label={NOTATION_TITLE[entry]}
            title={NOTATION_TITLE[entry]}
            onClick={() => setNotation(entry)}
          >
            {NOTATION_LABEL[entry]}
          </button>
        ))}
      </span>
    </div>
  )
}
