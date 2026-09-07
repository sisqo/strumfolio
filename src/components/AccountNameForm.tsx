'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { updateAccountName } from '@/lib/accounts/actions'
import { ADMIN_NAME_MESSAGE } from '@/lib/accounts/types'
import type { AdminNameResult } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * An admin correcting an account's first and last name — a typo, a name missing
 * entirely. `/profile` is the normal, self-service
 * way this changes; this form exists for support cases only, and writes the same two
 * columns with no coordination against `updateOwnName` — last write wins, a risk judged
 * trivial for a field like this.
 *
 * Two labelled columns and one button (`Account Detail.dc.html`), where this used to be two
 * placeholder-only fields inline with a `Save`. The labels are the substance of the change:
 * an empty account shows two identical empty boxes, and «First name» in the placeholder
 * disappears the moment somebody types into the wrong one.
 */
export function AccountNameForm({
  ownerEmail,
  firstName,
  lastName,
}: {
  ownerEmail: string
  firstName: string | null
  lastName: string | null
}) {
  const router = useRouter()
  const online = useOnline()
  const [first, setFirst] = useState(firstName ?? '')
  const [last, setLast] = useState(lastName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = async (action: () => Promise<AdminNameResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        // The name is also in the page header, which is server-rendered.
        router.refresh()
      } else {
        setError(ADMIN_NAME_MESSAGE[result.reason])
      }
    } catch {
      setError(ADMIN_NAME_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="acct-card"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => updateAccountName(ownerEmail, first, last), 'Name saved.')
      }}
    >
      <h3 className="acct-card-title">Name</h3>

      {error && (
        <p className="notice notice-error mb-3 text-sm" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mb-3 text-sm" role="status">
          {done}
        </p>
      )}

      <div className="acct-grid-2">
        <div>
          <label className="acct-label" htmlFor="acct-first-name">
            First name
          </label>
          <input
            id="acct-first-name"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            className="acct-field"
          />
        </div>
        <div>
          <label className="acct-label" htmlFor="acct-last-name">
            Last name
          </label>
          <input
            id="acct-last-name"
            value={last}
            onChange={(event) => setLast(event.target.value)}
            className="acct-field"
          />
        </div>
      </div>

      <div className="acct-actions">
        <span className="acct-hint">Shown to the account itself, and on anything they share.</span>
        <button
          type="submit"
          className="acct-save"
          disabled={!online || busy || first.trim() === '' || last.trim() === ''}
        >
          Save the name
        </button>
      </div>
    </form>
  )
}
