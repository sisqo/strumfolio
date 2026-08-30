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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useComments } from '@/components/CommentsProvider'
import { whenOf } from '@/lib/comments/when'
import type { CardPoint, CardSubject } from '@/lib/comments/types'

/** How wide the card would like to be, and how close to the edge it may come. */
const CARD_WIDTH = 320
const MARGIN = 12
/** The gap between the mark and the card, so the badge stays visible beside it. */
const GAP = 10

/**
 * Pins the card under the mark it belongs to, clamped so it never runs off the screen.
 *
 * At **every** width, with no bottom-sheet branch. The first version fell back to a sheet
 * below 480px on the reasoning that a 320px card is most of a phone screen anyway — but
 * the point of the card is that the words it is about stay in view beside it, and a sheet
 * at the foot of the page is exactly what breaks that. On a narrow screen the card
 * narrows instead.
 *
 * Takes the measured height rather than guessing one: whether there is room below the
 * mark depends on how tall the card actually turned out, which is only knowable once it
 * has rendered — hence the layout effect that calls this again with a real number.
 */
function placeCard(at: CardPoint, height: number): React.CSSProperties {
  if (typeof window === 'undefined') return {}

  const width = Math.min(CARD_WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.min(
    Math.max(MARGIN, at.x - width / 2),
    Math.max(MARGIN, window.innerWidth - width - MARGIN),
  )

  // Under the mark by default; above it when the card would otherwise run off the bottom,
  // which is what a note near the foot of a long song would do on every open.
  const fitsBelow = at.y + GAP + height <= window.innerHeight - MARGIN
  const top = fitsBelow
    ? at.y + GAP
    : Math.max(MARGIN, Math.min(at.y - GAP - height, window.innerHeight - height - MARGIN))

  return { position: 'fixed', left, top, width, margin: 0 }
}

export function CommentCard({ subject, onClose }: { subject: CardSubject; onClose: () => void }) {
  const { comments, add, edit, remove, setMode } = useComments()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement | null>(null)
  const card = useRef<HTMLDivElement | null>(null)

  const [placed, setPlaced] = useState<React.CSSProperties>(() => placeCard(subject.at, 0))

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

  /*
   * Placed once against a zero height, then again against the real one before the browser
   * paints — `useLayoutEffect`, not `useEffect`, so the card is never seen in the wrong
   * place for a frame.
   *
   * Re-run on the three things that change how tall it is: which card this is, how many
   * notes are stacked in it, and whether one of them is open in a textarea. A card that
   * grew after opening would otherwise keep a `top` computed for its old height and could
   * run off the bottom of the screen.
   */
  useLayoutEffect(() => {
    setPlaced(placeCard(subject.at, card.current?.offsetHeight ?? 0))
  }, [subject, shown.length, editing])

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

    if (subject.kind === 'write') {
      /*
       * Back to reading once a note is written.
       *
       * Armed mode paints nothing on the words any more — that tinted box over every word
       * read as "everything is selected" — so the only sign it is still on is the track in
       * the header. Leaving it armed here would mean the next tap on a word, made to read
       * a note, quietly wrote a second one instead. Adding several in a row costs one tap
       * on the pen; that is the cheaper of the two mistakes.
       */
      setMode('visible')
      onClose()
    }
  }

  return (
    <div className="comment-card-backdrop" onClick={onClose} role="presentation">
      <div
        className={subject.kind === 'write' ? 'comment-card is-writing' : 'comment-card'}
        ref={card}
        style={placed}
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
              <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={draft.trim() === ''}>
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
