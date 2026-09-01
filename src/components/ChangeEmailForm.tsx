'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { changeAccountEmail } from '@/lib/accounts/actions'
import { EMAIL_CHANGE_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Renames an account's address (`PLAN-account-admin.md`, point 4) — a real support
 * request ("I typo'd my email", "switch me to my work address") that today has no
 * answer short of deleting and recreating the account and losing everything in it.
 *
 * Click-to-reveal, like `DeleteAccountButton`, given a higher risk profile than the
 * rest of the Identity fieldset — but no retype-to-confirm on top of that: typing the
 * new address correctly and pressing the button *is* the confirmation, there being
 * nothing already-known to retype against, unlike deleting an account whose address is
 * already on screen.
 */
export function ChangeEmailForm({ ownerEmail }: { ownerEmail: string }) {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" disabled={!online} onClick={() => setOpen(true)}>
        Change email
      </button>
    )
  }

  const cancel = () => {
    setOpen(false)
    setNewEmail('')
    setError(null)
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await changeAccountEmail(ownerEmail, newEmail)
      if (result.ok) router.push(`/accounts/${encodeURIComponent(result.newEmail)}`)
      else setError(EMAIL_CHANGE_MESSAGE[result.reason])
    } catch {
      setError(EMAIL_CHANGE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel p-3.5 text-sm">
      <p className="mb-2">
        Moves this account — its songbooks, songs, password, sign-in history and payment history — to
        a new address. The old address stops existing; anyone signed in under it stays signed in until
        they next sign out.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          type="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
          placeholder="new@example.com"
          aria-label="New email address"
          className="form-field min-w-0 flex-1"
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!online || busy || newEmail.trim() === ''}
          onClick={() => void confirm()}
        >
          Change
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={cancel}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="notice notice-error mt-2.5" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
