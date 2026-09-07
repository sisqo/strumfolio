'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { changeAccountEmail } from '@/lib/accounts/actions'
import { EMAIL_CHANGE_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Renames an account's address — a real support
 * request ("I typo'd my email", "switch me to my work address") that today has no
 * answer short of deleting and recreating the account and losing everything in it.
 *
 * Click-to-reveal, like `DeleteAccountRow`, given a higher risk profile than the
 * rest of the Identity tab — but no retype-to-confirm on top of that: typing the
 * new address correctly and pressing the button *is* the confirmation, there being
 * nothing already-known to retype against, unlike deleting an account whose address is
 * already on screen.
 *
 * One strip either way (`Account Detail.dc.html`): the trigger is the pill on its right, and
 * what it reveals opens inside the same row rather than replacing it, so the sentence
 * explaining what this does stays on screen while the address is being typed.
 */
export function ChangeEmailForm({ ownerEmail }: { ownerEmail: string }) {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">Email address</span>
        <span className="acct-row-note">
          Moves this account — its songbooks, songs, password, sign-in history and payment history — to a
          new address. The old address stops existing; anyone signed in under it stays signed in until they
          next sign out.
        </span>
      </div>

      {open ? (
        <div className="acct-reveal">
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
            className="acct-field"
          />
          <button
            type="button"
            className="acct-save"
            disabled={!online || busy || newEmail.trim() === ''}
            onClick={() => void confirm()}
          >
            Change
          </button>
          <button type="button" className="acct-pill" onClick={cancel}>
            Cancel
          </button>
          {error && (
            <p className="notice notice-error acct-reveal-error text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <button type="button" className="acct-pill" disabled={!online} onClick={() => setOpen(true)}>
          Change email
        </button>
      )}
    </div>
  )
}
