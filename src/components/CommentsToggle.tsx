'use client'

/**
 * The three-segment track in the song header: hidden, visible, adding.
 *
 * Three states rather than two, and only the active segment carries a word, so the control
 * stays the width of one label plus two icons and never grows past the header row. The
 * count rides in the middle segment, where it answers «are there any?» without a fourth
 * element.
 *
 * Arming `adding` tints the **whole track**, not just its own segment: while it is on,
 * every word in the song behaves differently, and a control that looked merely selected
 * would undersell that.
 *
 * Not in `ControlBar`. That dock's rule — a control tapped mid-song lives out here, one set
 * once lives behind the settings button — does not decide this one, because this is not a
 * reading control at all: it belongs to the song's own header, beside Edit, which is where
 * both reader boards put it.
 */

import type { CommentsMode } from '@/components/CommentsProvider'
import { IconComment, IconCommentAdd, IconCommentOff } from '@/components/icons'

export function CommentsToggle({
  mode,
  count,
  onChange,
}: {
  mode: CommentsMode
  count: number
  onChange: (mode: CommentsMode) => void
}) {
  return (
    <span
      className={mode === 'adding' ? 'comments-toggle is-arming' : 'comments-toggle'}
      role="group"
      aria-label="Notes"
    >
      <button
        type="button"
        className={mode === 'hidden' ? 'comments-segment is-on' : 'comments-segment'}
        onClick={() => onChange('hidden')}
        aria-pressed={mode === 'hidden'}
        aria-label="Hide notes"
        title="Hide notes"
      >
        <IconCommentOff size={17} />
      </button>

      <button
        type="button"
        className={mode === 'visible' ? 'comments-segment is-on' : 'comments-segment'}
        onClick={() => onChange('visible')}
        aria-pressed={mode === 'visible'}
        title="Notes are visible"
      >
        <IconComment size={17} />
        {/* The word is desktop-only: on a phone the track has no room for it, and the
            count alone still answers the question the segment is there to answer. */}
        <span className="comments-segment-label">Notes</span>
        <span className="comments-count">{count}</span>
      </button>

      <button
        type="button"
        className={mode === 'adding' ? 'comments-segment is-on' : 'comments-segment'}
        onClick={() => onChange(mode === 'adding' ? 'visible' : 'adding')}
        aria-pressed={mode === 'adding'}
        aria-label={mode === 'adding' ? 'Stop adding notes' : 'Tap a word or a chord to write a note'}
        title="Tap a word or a chord to write a note"
      >
        <IconCommentAdd size={17} />
      </button>
    </span>
  )
}
