'use client'

/**
 * Everything about notes that lives outside the sheet: the panel beside it, the card over
 * it, and the two things that tell a reader what the page is currently waiting for.
 *
 * One component because they are driven by one piece of state — which of the four the
 * reader is in — and because the panel opens a card as often as a badge does.
 */

import { useEffect, useState } from 'react'

import { CommentCard } from '@/components/CommentCard'
import { CommentsRail } from '@/components/CommentsRail'
import { useComments } from '@/components/CommentsProvider'
import { NoteDraft } from '@/components/NoteDraft'
import { PointedCard } from '@/components/PointedCard'
import { IconCheck, IconPin, IconClose } from '@/components/icons'

/**
 * Whether the notes panel is actually on the screen.
 *
 * **A real width test, not a media query, and that is forced rather than chosen.** The
 * draft has to take focus the moment it appears, and focusing an element inside a
 * `display: none` subtree silently does nothing — so the usual idiom here, render both and
 * let CSS pick one, would hand a phone reader a draft they cannot type into and no
 * keyboard. The query string is the same `80rem` `.comments-rail` uses; the two are the
 * one pair in this feature that must be kept in step by hand.
 *
 * `false` until mounted, which costs nothing: a draft only ever exists after a click, so
 * there is no first paint for the wrong answer to spoil.
 */
function useRailOnScreen(): boolean {
  const [onScreen, setOnScreen] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 80rem)')
    const sync = () => setOnScreen(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return onScreen
}

export function LiveComments() {
  const { mode, armed, draft, saved, open, setOpen, cancel } = useComments()
  const railOnScreen = useRailOnScreen()

  /*
   * One listener for the whole flow rather than one per surface: Escape means «give up on
   * what I started», and which surface happens to be showing is not what decides that.
   * Only while armed, so it never competes with the card's own dismissal or with a menu.
   */
  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [armed, cancel])

  return (
    <>
      <CommentsRail onOpen={(ids, at) => setOpen({ ids, at })} />

      {open !== null && <CommentCard subject={open} onClose={() => setOpen(null)} />}

      {/* The draft's fallback home: no panel on screen, so it opens at the word instead —
          the same component, pinned rather than listed. */}
      {draft !== null && !railOnScreen && (
        <PointedCard
          at={draft.at}
          className="comment-card is-writing"
          label={`New note on ${draft.label}`}
          resizeKey={draft.label}
          onClose={cancel}
        >
          <NoteDraft label={draft.label} onCancel={cancel} />
        </PointedCard>
      )}

      {/*
        * The two things said over the song rather than in a panel, because in both cases
        * the reader is looking at the *song*: once to ask for a tap, once to confirm where
        * the tap landed. Above the reading bar and out of its way — see `.note-cues`.
        */}
      <div className="note-cues" aria-live="polite">
        {mode === 'waiting' && (
          <p className="note-cue is-asking">
            <IconPin size={17} />
            <span>Click a word or a chord to put the note there</span>
            <button type="button" className="note-cue-cancel" onClick={cancel} title="Cancel" aria-label="Cancel the new note">
              <IconClose size={15} />
            </button>
          </p>
        )}

        {saved !== null && (
          <p className="note-cue is-done">
            <IconCheck size={16} className="note-cue-check" />
            <span>
              Note {saved.number} added on {saved.label}
            </span>
          </p>
        )}
      </div>
    </>
  )
}
