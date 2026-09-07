'use client'

import { useState } from 'react'

import { updateInternalNote } from '@/lib/accounts/actions'
import { NOTE_MESSAGE } from '@/lib/accounts/types'
import type { AdminActionResult } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * A global owner's free-text note about this account — support context, an exception
 * granted, a flag — visible only here, never to the account's own reader. A single
 * overwritable field, not a timestamped
 * log (decided in interview): whoever edits it replaces what was there.
 *
 * Read first, edit on request (`Account Detail.dc.html`), where this used to be an open
 * textarea. That is not the click-to-reveal of `DeleteAccountRow` — nothing is being hidden
 * behind a safety net here. It is the note *being the thing you came to read*: it sits above
 * the tabs, unconditionally, and an always-open field made the one sentence an operator opens
 * this page for look like an empty form.
 */
export function InternalNoteForm({ ownerEmail, note }: { ownerEmail: string; note: string | null }) {
  const online = useOnline()
  /*
   * The saved note as this component last knew it, not the `note` prop, and that is what
   * makes read-then-edit honest: this form does not `router.refresh()` (the note appears
   * nowhere else on the page, so there would be nothing else to update), so collapsing back
   * to the server-rendered prop after a save would show the *old* text under a "Note saved."
   * confirmation until something else re-rendered the page.
   */
  const [saved, setSaved] = useState(note ?? '')
  const [value, setValue] = useState(note ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = async (action: () => Promise<AdminActionResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        setSaved(value)
        setEditing(false)
      } else {
        setError(NOTE_MESSAGE[result.reason])
      }
    } catch {
      setError(NOTE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const written = saved.trim() !== ''

  return (
    <div className="acct-note">
      <div className="acct-note-head">
        <span className="acct-cell-label">Internal note</span>
        {!editing && (
          <button type="button" className="acct-quiet" disabled={!online} onClick={() => setEditing(true)}>
            {written ? 'Edit' : 'Add a note'}
          </button>
        )}
      </div>

      {error && (
        <p className="notice notice-error mt-2 text-sm" role="alert">
          {error}
        </p>
      )}
      {done && !editing && (
        <p className="notice notice-accent mt-2 text-sm" role="status">
          {done}
        </p>
      )}

      {editing ? (
        <form
          className="acct-note-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateInternalNote(ownerEmail, value), 'Note saved.')
          }}
        >
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Support context, an exception granted, a flag — visible only here"
            aria-label="Internal note"
            className="acct-field is-area"
          />
          <div className="acct-actions is-end">
            <button
              type="button"
              className="acct-pill"
              onClick={() => {
                // Back to the last saved text, not to the prop: same reason `saved` exists.
                setValue(saved)
                setEditing(false)
                setError(null)
              }}
            >
              Cancel
            </button>
            <button type="submit" className="acct-save" disabled={!online || busy}>
              Save the note
            </button>
          </div>
        </form>
      ) : (
        <p className={written ? 'acct-note-text' : 'acct-note-text is-empty'}>
          {written ? saved : 'Nothing written about this account yet.'}
        </p>
      )}
    </div>
  )
}
