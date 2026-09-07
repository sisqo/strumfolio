'use client'

import { useState } from 'react'

import { removePasswordFor, setPasswordFor } from '@/lib/auth/actions'
import { MIN_PASSWORD, PASSWORD_MESSAGE, type PasswordResult } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * A global owner setting or removing the password of an account they are not signed in
 * as — the only way in for an address with no matching Google account, since this app
 * sends no invite email (see `setPasswordFor`'s own comment). No "current password"
 * field, unlike the self-service `PasswordScreen`: a global owner is not proving they
 * already know it, only that they may act on this account at all.
 *
 * Always visible on the Security tab, unlike the old
 * `AccountPasswordButton` this replaces: the detail page is already the explicit choice to
 * act on this one account, so there is nothing left to reveal behind a trigger.
 *
 * `Account Detail.dc.html` draws only `Set password` in this card. `Remove` stays, quietly,
 * beside it: it is not copy the mock reworded but the only way to take a password *away*, and
 * an account whose password is removed goes back to Google-only sign-in — a capability with no
 * other surface in this app, which a redesign is not the place to delete.
 */
export function PasswordForm({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const run = async (action: () => Promise<PasswordResult>, said: string) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (result.ok) {
        setDone(said)
        setPassword('')
      } else {
        setError(PASSWORD_MESSAGE[result.reason])
      }
    } catch {
      setError(PASSWORD_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="acct-card"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => setPasswordFor(ownerEmail, password), 'Password set.')
      }}
    >
      <h3 className="acct-card-title">Set a new password</h3>

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

      <label className="acct-label" htmlFor="acct-new-password">
        New password
      </label>
      {/* Which account this sets a password *for* is the page's own `<h1>` and nothing in this
          field's label, so it is said here instead: the visible label the mock draws, and the
          address as the field's description. One `aria-label` carrying both would have to
          replace the visible label, and then the two could drift apart. */}
      <input
        id="acct-new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={`At least ${MIN_PASSWORD} characters`}
        aria-describedby="acct-new-password-for"
        className="acct-field"
        minLength={MIN_PASSWORD}
      />
      <span id="acct-new-password-for" className="sr-only">
        for {ownerEmail}
      </span>

      <div className="acct-actions">
        <span className="acct-hint">Takes effect at once. Sessions already open stay open.</span>
        <span className="acct-actions-pair">
          <button
            type="button"
            className="acct-pill"
            disabled={!online || busy}
            onClick={() => void run(() => removePasswordFor(ownerEmail), 'Password removed.')}
          >
            Remove
          </button>
          <button type="submit" className="acct-save" disabled={!online || busy || password.length < MIN_PASSWORD}>
            Set password
          </button>
        </span>
      </div>
    </form>
  )
}
