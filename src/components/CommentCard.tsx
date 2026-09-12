'use client'

/**
 * The card that opens on a note: reading it, and editing one that is there.
 *
 * It says what it is anchored to in its own header — «on grace» — because a mark beside a
 * syllable is not precise enough to be self-evident once the card is covering the line it
 * came from.
 *
 * Several notes on one point stack **inside one card** rather than opening several: they
 * are the same place, and reading them in order is the point.
 *
 * **It no longer writes new ones.** That was its third job and the one it was worst at:
 * writing means looking at the words you are writing about, and this card opens on top of
 * them. A new note is composed in the notes panel now, or — where the screen is too narrow
 * for one — in a card of its own built from the same `NoteDraft`. What is left here is the
 * two jobs that genuinely want to be next to the badge.
 */

import { useEffect, useState } from 'react'

import { useComments } from '@/components/CommentsProvider'
import { PointedCard } from '@/components/PointedCard'
import { whenOf } from '@/lib/comments/when'
import type { OpenNotes } from '@/lib/comments/types'

export function CommentCard({ subject, onClose }: { subject: OpenNotes; onClose: () => void }) {
  const { comments, edit, remove } = useComments()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const shown = comments.filter((comment) => subject.ids.includes(comment.id))

  // A stack that just lost its last note has nothing left to be a card about. In an effect
  // rather than during render: `onClose` writes the provider's state, and doing that while
  // this component is rendering would be React setting state on another component mid-render.
  useEffect(() => {
    if (shown.length === 0) onClose()
  }, [shown.length, onClose])

  const label = shown[0]?.anchorLabel ?? ''
  const orphaned = shown[0]?.anchor === null

  function save() {
    const body = draft.trim()
    if (body === '' || editing === null) return // Save stays inert until something is typed.
    edit(editing, body)
    setDraft('')
    setEditing(null)
  }

  return (
    <PointedCard
      at={subject.at}
      className="comment-card"
      label={`Notes on ${label}`}
      resizeKey={`${shown.length}:${editing ?? ''}`}
      onClose={onClose}
    >
      <p className="comment-card-head">
        {orphaned ? (
          <>
            No longer on the words
            {label !== '' && (
              <>
                {' · was on '}
                <span className="comment-card-anchor">{label}</span>
              </>
            )}
          </>
        ) : (
          <>
            on <span className="comment-card-anchor">{label}</span>
            {shown.length > 1 && <span className="comment-card-count"> · {shown.length} notes</span>}
          </>
        )}
      </p>

      {shown.map((comment) =>
        editing === comment.id ? (
          <div key={comment.id} className="comment-card-note">
            <textarea
              className="comment-card-field"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              autoFocus
            />
            <div className="comment-card-actions">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={draft.trim() === ''}>
                Save
              </button>
            </div>
          </div>
        ) : (
          <div key={comment.id} className="comment-card-note">
            <p className="comment-card-when">{whenOf(comment.updatedAt)}</p>
            <p className="comment-card-text">{comment.body}</p>
            <div className="comment-card-actions">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setEditing(comment.id)
                  setDraft(comment.body)
                }}
              >
                Edit
              </button>
              <button type="button" className="btn btn-quiet btn-sm comment-card-delete" onClick={() => remove(comment.id)}>
                Delete
              </button>
            </div>
          </div>
        ),
      )}
    </PointedCard>
  )
}
