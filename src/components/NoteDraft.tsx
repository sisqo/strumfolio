'use client'

/**
 * The note being written: what it is attached to, the words themselves, and the two ways
 * out.
 *
 * **One component, two homes.** It renders inside the notes panel wherever there is one on
 * screen, and inside a card pinned to the tapped word where there is not — see
 * `LiveComments` for which, and why that choice cannot be made in CSS. What it *is* does
 * not change between them; only where it sits. The header line is the reason it can move at
 * all: «New note on grace» says what the note hangs off, so the draft no longer has to be
 * standing next to the word to be about it.
 *
 * It never asks what it is attached to. A draft exists only once a word or a chord has been
 * picked — that is what `composing` means — so there is no empty state here and no way to
 * save a note that hangs off nothing.
 */

import { useEffect, useRef, useState } from 'react'

import { useComments } from '@/components/CommentsProvider'

/**
 * Which key the hint should name. `⌘` until the browser says otherwise, because that is
 * also what an iPad with a keyboard wants and the alternative flashes the wrong word on
 * the commonest case.
 *
 * After mount rather than during render: `navigator` does not exist on the server, and a
 * draft is only ever reached by a click, so there is no first paint to get wrong.
 */
function useCommandKey(): string {
  const [key, setKey] = useState('⌘')
  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) setKey('Ctrl ')
  }, [])
  return key
}

export function NoteDraft({ label, onCancel }: { label: string; onCancel: () => void }) {
  const { commit } = useComments()
  const [body, setBody] = useState('')
  const field = useRef<HTMLTextAreaElement | null>(null)
  const commandKey = useCommandKey()

  /*
   * Focused on arrival, and on every *re-*arrival: picking a second word while composing
   * replaces the draft without unmounting this, so a dependency on the label is what puts
   * the caret back rather than leaving it wherever the second tap left it.
   */
  useEffect(() => {
    field.current?.focus()
  }, [label])

  const empty = body.trim() === ''

  return (
    <div className="note-draft">
      <p className="note-draft-head">
        New note on <span className="note-draft-anchor">{label}</span>
      </p>

      <textarea
        ref={field}
        className="note-draft-field"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          /* Saves without reaching for the mouse. `Escape` is not handled here: it means
             "give up on the whole thing", which is the session's business and not this
             field's — `LiveComments` listens for it once, for every state that has a way
             out. */
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit(body)
        }}
        placeholder="What should you remember here?"
        rows={3}
      />

      <div className="note-draft-actions">
        {/* Inert rather than absent until something has been typed: a note with no words
            is not a note, and a button that vanished would move the two beside it. */}
        <button type="button" className="btn btn-note btn-sm" onClick={() => commit(body)} disabled={empty}>
          Save
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <span className="note-draft-hint" aria-hidden>
          {commandKey}↵ to save
        </span>
      </div>
    </div>
  )
}
