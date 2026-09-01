'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { updateAccountName } from '@/lib/accounts/actions'
import { ADMIN_NAME_MESSAGE } from '@/lib/accounts/types'
import type { AdminNameResult } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * An admin correcting an account's first and last name — a typo, a name missing
 * entirely (`PLAN-account-admin.md`, point 4). `/profile` is the normal, self-service
 * way this changes; this form exists for support cases only, and writes the same two
 * columns with no coordination against `updateOwnName` — last write wins, a risk judged
 * trivial for a field like this.
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
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => updateAccountName(ownerEmail, first, last), 'Name saved.')
        }}
      >
        <input
          value={first}
          onChange={(event) => setFirst(event.target.value)}
          placeholder="First name"
          aria-label="First name"
          className="form-field min-w-0 flex-1"
        />
        <input
          value={last}
          onChange={(event) => setLast(event.target.value)}
          placeholder="Last name"
          aria-label="Last name"
          className="form-field min-w-0 flex-1"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!online || busy || first.trim() === '' || last.trim() === ''}
        >
          Save
        </button>
      </form>
    </div>
  )
}
