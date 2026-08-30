'use client'

/**
 * The card that opens on a note: reading it, writing a new one, editing one that is there.
 *
 * It says what it is anchored to in its own header — «on grace» — because a mark beside a
 * syllable is not precise enough to be self-evident once the card is covering the line it
 * came from.
 *
 * Several notes on one point stack **inside one card** rather than opening several: they
 * are the same place, and reading them in order is the point.
 */

import { useEffect, useRef, useState } from 'react'

import { useComments } from '@/components/CommentsProvider'
import { whenOf } from '@/lib/comments/when'
import type { CardSubject } from '@/lib/comments/types'

export function CommentCard({ subject, onClose }: { subject: CardSubject; onClose: () => void }) {
  const { comments, add, edit, remove } = useComments()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    field.current?.focus()
  }, [subject])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown = subject.kind === 'read' ? comments.filter((c) => subject.ids.includes(c.id)) : []

  // A stack that just lost its last note has nothing left to be a card about.
  useEffect(() => {
    if (subject.kind === 'read' && shown.length === 0) onClose()
  }, [subject.kind, shown.length, onClose])

  const label = subject.kind === 'write' ? subject.label : (shown[0]?.anchorLabel ?? '')
  const orphaned = subject.kind === 'read' && shown.length > 0 && shown[0].anchor === null

  function save() {
    const body = draft.trim()
    if (body === '') return // Save stays inert until something has been typed.

    if (subject.kind === 'write') {
      add(subject.anchor, subject.label, body)
    } else if (editing !== null) {
      edit(editing, body)
    }
    setDraft('')
    setEditing(null)
    if (subject.kind === 'write') onClose()
  }

  return (
    <div className="comment-card-backdrop" onClick={onClose} role="presentation">
      <div
        className={subject.kind === 'write' ? 'comment-card is-writing' : 'comment-card'}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={subject.kind === 'write' ? `New note on ${label}` : `Notes on ${label}`}
      >
        <p className="comment-card-head">
          {subject.kind === 'write' ? (
            <>
              New note on <span className="comment-card-anchor">{label}</span>
            </>
          ) : orphaned ? (
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
                ref={field}
                className="comment-card-field"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
              />
              <div className="comment-card-actions">
                <button type="button" className="comment-card-cancel" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="comment-card-save" onClick={save} disabled={draft.trim() === ''}>
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
                  className="comment-card-cancel"
                  onClick={() => {
                    setEditing(comment.id)
                    setDraft(comment.body)
                  }}
                >
                  Edit
                </button>
                <button type="button" className="comment-card-delete" onClick={() => remove(comment.id)}>
                  Delete
                </button>
              </div>
            </div>
          ),
        )}

        {subject.kind === 'write' && (
          <div className="comment-card-note">
            <textarea
              ref={field}
              className="comment-card-field"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Write it here…"
              rows={3}
            />
            <div className="comment-card-actions">
              <button type="button" className="comment-card-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="comment-card-save" onClick={save} disabled={draft.trim() === ''}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
