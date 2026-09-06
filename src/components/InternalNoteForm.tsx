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
 * Always visible and first after the header, unlike the click-to-reveal Danger zone:
 * this is the first thing an operator wants to read when opening an account for
 * support, not a safety net to hide behind a trigger.
 */
export function InternalNoteForm({ ownerEmail, note }: { ownerEmail: string; note: string | null }) {
  const online = useOnline()
  const [value, setValue] = useState(note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = async (action: () => Promise<AdminActionResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) setDone(said)
      else setError(NOTE_MESSAGE[result.reason])
    } catch {
      setError(NOTE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error && (
        <p className="notice notice-error mb-2.5" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mb-2.5" role="status">
          {done}
        </p>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => updateInternalNote(ownerEmail, value), 'Note saved.')
        }}
      >
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Support context, an exception granted, a flag — visible only here"
          aria-label="Internal note"
          className="form-field min-h-[4.5rem] w-full resize-y"
        />
        <button type="submit" className="btn btn-primary btn-sm self-start" disabled={!online || busy}>
          Save
        </button>
      </form>
    </div>
  )
}
