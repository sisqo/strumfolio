'use client'

/**
 * The list of notes over the sheet, on a wide screen — and, since the flow was redrawn,
 * the place a new one is written.
 *
 * It lists exactly what the badges already reach, so a phone losing it loses no note. That
 * is what lets the sheet render the same way at every width — the parked orphan badges are
 * there on desktop too, and `SongSheet` never has to ask how wide the window is.
 *
 * **It is laid on the page's right edge rather than standing beside it**, overlapping the
 * sheet's own margin and taking no width from the row. So the song does not move when the
 * notes open: the sheet is centred on the page, and stays exactly where it is whether these
 * are shown or hidden. See `.reading-layout` in globals.css for the arithmetic.
 *
 * **Writing happens here now, at the top of the list.** It used to happen in a card pinned
 * to the word, which is still what a screen too narrow for this panel gets. The panel is
 * the better home wherever there is one: the card covered the line it was about, and the
 * note being written is the same kind of thing as the notes underneath it — so it is drawn
 * as one of them, in the place they will live, with the number it is going to carry.
 */

import { useComments } from '@/components/CommentsProvider'
import { NoteDraft } from '@/components/NoteDraft'
import { IconComment, IconPlus } from '@/components/icons'

import { pointOf } from '@/components/SongSheet'
import { type CardPoint, positionFor } from '@/lib/comments/types'
import { whenOf } from '@/lib/comments/when'

export function CommentsRail({ onOpen }: { onOpen: (ids: string[], at: CardPoint) => void }) {
  const { comments, mode, armed, draft, arm, cancel, remove } = useComments()
  if (mode === 'hidden') return null

  const waiting = mode === 'waiting'

  /* The number the note will carry once it lands, not «one more than there are»: notes are
     numbered by where they sit in the song, so one added to the first verse takes 1 and
     pushes the rest down. Nothing is picked yet while `waiting`, so there the count is the
     only honest guess. */
  const nextNumber = draft === null ? comments.length + 1 : positionFor(comments, draft.anchor)

  return (
    <aside className="comments-rail" aria-label="Notes on this song">
      <div className="comments-rail-head">
        <IconComment size={17} className="comments-rail-icon" />
        <span className="comments-rail-title">Notes</span>
        <span className="comments-count">{comments.length}</span>
      </div>

      {/*
        * Armed but nothing picked. It is a note-shaped hole in the list — dashed where a
        * real row is solid — because the thing it is standing in for is a row here, and
        * saying so is most of the instruction. The sentence under it is the rest.
        */}
      {waiting && (
        <div className="note-pending" role="status">
          <span className="note-pending-badge" aria-hidden>
            {nextNumber}
          </span>
          <span className="note-pending-body">
            <span className="note-pending-title">New note — pick where it goes</span>
            <span className="note-pending-text">
              Click a word or a chord in the song. The note opens there, already attached to it.
            </span>
          </span>
        </div>
      )}

      {draft !== null && (
        <div className="note-draft-row">
          <span className="note-draft-badge" aria-hidden>
            {nextNumber}
          </span>
          <NoteDraft label={draft.label} onCancel={cancel} />
        </div>
      )}

      {comments.length === 0 && !armed && (
        <p className="comments-rail-empty">
          Nothing yet. A note hangs off a word or a chord, so you always know what it is about.
        </p>
      )}

      {comments.map((comment, index) => (
        <div key={comment.id} className="comments-rail-entry">
          <button
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

          {/*
            * Beside the row rather than inside it: the row is a button that opens the note,
            * and a button inside a button is not markup a browser will render as written.
            */}
          <button
            type="button"
            className="comments-rail-remove"
            onClick={() => remove(comment.id)}
            title="Delete this note"
            aria-label={`Delete the note on ${comment.anchorLabel}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ))}

      <div className="comments-rail-foot">
        {/*
          * The second way in, and the one a reader finds by looking at the notes rather than
          * at the song's header. It becomes the way *out* while armed, so the footer always
          * offers the move that undoes whatever the panel is currently in the middle of.
          */}
        {armed ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="comments-rail-add" onClick={arm}>
            <IconPlus size={15} />
            Add a note
          </button>
        )}
        <span className="comments-rail-private">only you see these</span>
      </div>
    </aside>
  )
}
