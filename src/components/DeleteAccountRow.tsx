'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { IconTrash } from '@/components/icons'
import { deleteAccount } from '@/lib/accounts/actions'
import { ACCOUNT_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The one safety net for an otherwise unblocked, immediate cascade: retyping the
 * account's own address before the button
 * does anything. Enforced here for the same reason `deleteAccount` also checks it
 * server-side — a disabled button is a hint, not a guarantee, so both layers ask.
 *
 * This is the one control on the Security tab that still hides behind a trigger rather than
 * sitting always open like `GiftForm`/`PasswordForm` beside it — deliberately: the
 * click-to-reveal here is a safety net, not a click-to-see-what-this-is convenience, and the
 * two are not the same thing even though they look alike.
 *
 * The last of the tab's strips, and the only one drawn in the danger tint
 * (`Account Detail.dc.html`) — a tinted hairline and a red pill, where this used to be a
 * "Danger zone" section of its own with a solid red button. The tint is what replaced the
 * heading: four identical white strips with one red edge among them says which is which
 * without a section that exists only to hold one row.
 */
export function DeleteAccountRow({ ownerEmail }: { ownerEmail: string }) {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmEmail.trim().toLowerCase() === ownerEmail.toLowerCase()

  const cancel = () => {
    setOpen(false)
    setConfirmEmail('')
    setError(null)
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await deleteAccount(ownerEmail, confirmEmail)
      // `router.push`, not `router.refresh()`: a refresh would re-render the detail page of
      // an account that no longer has a row — this control no longer lives on a list row a
      // refresh could simply drop.
      if (result.ok) router.push('/accounts')
      else setError(ACCOUNT_MESSAGE[result.reason])
    } catch {
      setError(ACCOUNT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acct-row is-danger">
      <div className="acct-row-text">
        <span className="acct-row-title">Delete the account</span>
        <span className="acct-row-note">
          {open ? (
            <>
              This deletes every songbook, section and song in <strong>{ownerEmail}</strong> — not just the
              account, everything in it. Type the address to confirm.
            </>
          ) : (
            'Removes every songbook, section and song in it — not just the account, everything in it.'
          )}
        </span>
      </div>

      {open ? (
        <div className="acct-reveal">
          <input
            autoFocus
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
            }}
            placeholder={ownerEmail}
            aria-label={`Retype ${ownerEmail} to confirm deletion`}
            className="acct-field"
          />
          <button type="button" className="acct-pill is-danger" disabled={!matches || busy} onClick={confirm}>
            <IconTrash size={14} />
            Delete
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
        <button type="button" className="acct-pill is-danger" disabled={!online} onClick={() => setOpen(true)}>
          <IconTrash size={14} />
          Delete account
        </button>
      )}
    </div>
  )
}
