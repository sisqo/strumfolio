'use client'

/**
 * The list of notes beside the sheet, on a wide screen.
 *
 * Pure surplus: it lists exactly what the badges already reach, so a phone losing it loses
 * no note. That is what lets the sheet render the same way at every width — the parked
 * orphan badges are there on desktop too, and `SongSheet` never has to ask how wide the
 * window is.
 *
 * It occupies the gutter the reading column already left empty (768px of sheet inside
 * 1112px of content), so turning it on does not narrow the words.
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
