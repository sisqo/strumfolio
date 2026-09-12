'use client'

/**
 * The three-segment track in the song header: hidden, visible, and the pen that arms the
 * page for a new note.
 *
 * Three states rather than two, and only the active segment carries a word, so the control
 * stays the width of one label plus two icons and never grows past the header row. The
 * count rides in the middle segment, where it answers «are there any?» without a fourth
 * element.
 *
 * **Armed, the pen fills and says «Placing».** The whole track used to take a tint instead,
 * on the reasoning that arming changes what every word in the song does and a control that
 * looked merely selected would undersell it. The reasoning held; the tint was the wrong
 * answer to it, because a shade of blue is not an instruction — a reader who pressed the pen
 * was left on a page that looked exactly as before, with nothing saying a tap was expected
 * or what it would do. A word says it. The tint is gone, and the fill sits on the segment
 * that owns the state rather than on its two neighbours as well.
 *
 * Not in `ControlBar`. That dock's rule — a control tapped mid-song lives out here, one set
 * once lives behind the settings button — does not decide this one, because this is not a
 * reading control at all: it belongs to the song's own header, beside Edit, which is where
 * both reader boards put it.
 */

import { IconComment, IconCommentAdd, IconCommentOff } from '@/components/icons'

export function CommentsToggle({
  hidden,
  armed,
  count,
  onShow,
  onToggleArm,
}: {
  hidden: boolean
  /** True while a note is being placed or written — `waiting` or `composing`. */
  armed: boolean
  count: number
  onShow: (visible: boolean) => void
  onToggleArm: () => void
}) {
  return (
    <span className="comments-toggle" role="group" aria-label="Notes">
      <button
        type="button"
        className={hidden ? 'comments-segment is-on' : 'comments-segment'}
        onClick={() => onShow(false)}
        aria-pressed={hidden}
        aria-label="Hide notes"
        title="Hide notes"
      >
        <IconCommentOff size={17} />
      </button>

      <button
        type="button"
        className={hidden ? 'comments-segment' : 'comments-segment is-on'}
        onClick={() => onShow(true)}
        aria-pressed={!hidden}
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
        className={armed ? 'comments-segment is-placing' : 'comments-segment'}
        onClick={onToggleArm}
        aria-pressed={armed}
        aria-label={armed ? 'Stop adding a note' : 'Add a note on a word or a chord'}
        title={armed ? 'Stop adding a note' : 'Add a note on a word or a chord'}
      >
        <IconCommentAdd size={17} />
        {/*
          * Only while armed, and that asymmetry is the point: idle, the pen is one icon in a
          * row of icons; armed, it is the thing on screen that says what the page is waiting
          * for. A word that were always there would make it a third label competing with
          * «Notes» for a header that has none to spare.
          */}
        {armed && <span className="comments-placing-label">Placing</span>}
      </button>
    </span>
  )
}
