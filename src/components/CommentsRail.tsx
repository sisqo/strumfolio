'use client'

/**
 * The list of notes beside the sheet, on a wide screen.
 *
 * Pure surplus: it lists exactly what the badges already reach, so a phone losing it loses
 * no note. That is what lets the sheet render the same way at every width — the parked
 * orphan badges are there on desktop too, and `SongSheet` never has to ask how wide the
 * window is.
 *
 * It sits beside the sheet without narrowing it: 896px of sheet, a 16px gap and 328px of rail,
 * so the words are exactly as wide with it as without.
 *
 * **It used to be free, and it is not any more.** At 48rem the sheet left a gutter inside the
 * 1112px the boards drew, and the rail simply moved into it. The sheet is 56rem since the app
 * settled on one width, so the row is 1240px and the rail is genuinely 328px of extra page —
 * which is why its threshold had to move too, to 80rem. See `.reading-layout` in globals.css
 * for what that costs and what the alternative was.
 */

import { useComments } from '@/components/CommentsProvider'
import { IconComment, IconPlus } from '@/components/icons'

import { pointOf } from '@/components/SongSheet'
import type { CardPoint } from '@/lib/comments/types'
import { whenOf } from '@/lib/comments/when'

export function CommentsRail({ onOpen }: { onOpen: (ids: string[], at: CardPoint) => void }) {
  const { comments, mode, setMode } = useComments()
  if (mode === 'hidden') return null

  return (
    <aside className="comments-rail" aria-label="Notes on this song">
      <div className="comments-rail-head">
        <IconComment size={17} className="comments-rail-icon" />
        <span className="comments-rail-title">Notes</span>
        <span className="comments-count">{comments.length}</span>
      </div>

      {comments.length === 0 && (
        <p className="comments-rail-empty">
          Nothing noted yet. Arm the pen, then tap a word or a chord.
        </p>
      )}

      {comments.map((comment, index) => (
        <button
          key={comment.id}
          type="button"
          className="comments-rail-row"
          onClick={(event) => onOpen([comment.id], pointOf(event.currentTarget))}
        >
          <span className={comment.anchor === null ? 'comment-badge is-orphan' : 'comment-badge'} aria-hidden>
            {index + 1}
          </span>
          <span className="comments-rail-body">
            <span className="comments-rail-meta">
              {comment.anchor === null ? (
                // The label would be a lie here — the words it named are gone — so the
                // row says so instead, and keeps the old text only as a memory of what
                // the note was about.
                <>
                  no longer on the words
                  {comment.anchorLabel !== '' && <> · was on {comment.anchorLabel}</>}
                </>
              ) : (
                <>
                  on <span className="comments-rail-anchor">{comment.anchorLabel}</span>
                </>
              )}
              <span className="comments-rail-dot"> · </span>
              {whenOf(comment.updatedAt)}
            </span>
            <span className="comments-rail-text">{comment.body}</span>
          </span>
        </button>
      ))}

      <div className="comments-rail-foot">
        <button type="button" className="comments-rail-add" onClick={() => setMode('adding')}>
          <IconPlus size={15} />
          Add a note
        </button>
        <span className="comments-rail-private">only you see these</span>
      </div>
    </aside>
  )
}
