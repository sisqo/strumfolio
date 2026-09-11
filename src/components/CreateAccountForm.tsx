'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createAccount } from '@/lib/accounts/actions'
import { CREATE_ACCOUNT_MESSAGE } from '@/lib/accounts/types'
import { MIN_PASSWORD } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Opening an account by hand on `/accounts`, for the two cases self-service registration does
 * not reach — the pre-`02ac495` quirk whose repair is «delete and recreate the account from the
 * Accounts admin page», and an address that will never find the registration form. The action's
 * own comment carries the whole argument, the accepted risk included.
 *
 * **Closed until asked for**, because the page is a list of accounts before it is a place to
 * make one: a four-field form permanently above the table would be the first thing read on every
 * visit and is wanted on almost none of them.
 *
 * The disclosure is the one piece of state on this page that is **not** in the URL, and
 * deliberately: the tabs, the search, the sort and the page are all questions somebody would
 * paste to somebody else, and «the form is open» is not one. `/accounts` stays a server
 * component with client components in it, which is what that URL-state rule exists to protect.
 *
 * Keeps its own three `useState`s rather than `useAdminAction`, the one admin control here that
 * does: the hook hands its caller nothing but "it worked", and both things this form does next
 * are read off the result — the address to open, and whether the password it was given actually
 * landed.
 *
 * Ends on the new account's own page rather than back at the list. Whatever comes next for an
 * account opened this way — a plan, a password, the reset email that is the only way in when no
 * password was set here — is on that page, and after an A–Z sort the new row may not even be on
 * the page the operator is looking at. **At the address the server says it wrote**, never at one
 * spelled again here: `normalizeEmail` is the server's rule and a second copy of it on this side
 * would send the one operator it ever disagreed with to a 404 for an account that does exist.
 */
export function CreateAccountForm() {
  const router = useRouter()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* The account exists and its password does not — the one outcome that is neither a failure
     to report nor a success to walk away from, so it stays on screen instead of navigating. */
  const [halfDone, setHalfDone] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setHalfDone(null)
    try {
      const result = await createAccount({ email, firstName: first, lastName: last, password })
      if (!result.ok) {
        setError(CREATE_ACCOUNT_MESSAGE[result.reason])
        return
      }
      if (!result.passwordSaved) {
        setHalfDone(result.email)
        return
      }
      router.push(`/accounts/${encodeURIComponent(result.email)}`)
    } catch {
      setError(CREATE_ACCOUNT_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-3.5 flex justify-end">
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          New account
        </button>
      </div>
    )
  }

  const incomplete = email.trim() === '' || first.trim() === '' || last.trim() === ''

  return (
    <form
      className="acct-card mt-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        void run()
      }}
    >
      <h2 className="acct-card-title">New account</h2>

      {error && (
        <p className="notice notice-error mb-3 text-sm" role="alert">
          {error}
        </p>
      )}
      {halfDone !== null && (
        <p className="notice notice-error mb-3 text-sm" role="alert">
          The account was created, but its password was not saved. Set one on{' '}
          <Link href={`/accounts/${encodeURIComponent(halfDone)}`}>its own page</Link>, or send it a reset email from
          there.
        </p>
      )}

      <div className="acct-field-group">
        <label className="acct-label" htmlFor="new-acct-email">
          Email
        </label>
        <input
          id="new-acct-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="acct-field"
        />
      </div>

      <div className="acct-grid-2">
        <div>
          <label className="acct-label" htmlFor="new-acct-first">
            First name
          </label>
          <input
            id="new-acct-first"
            value={first}
            onChange={(event) => setFirst(event.target.value)}
            className="acct-field"
          />
        </div>
        <div>
          <label className="acct-label" htmlFor="new-acct-last">
            Last name
          </label>
          <input
            id="new-acct-last"
            value={last}
            onChange={(event) => setLast(event.target.value)}
            className="acct-field"
          />
        </div>
      </div>

      {/* `new-password`, not `off`: a password manager offering to *fill* this would offer the
          operator's own, which is the one password that must never end up here. */}
      <div className="acct-field-group mt-3.5">
        <label className="acct-label" htmlFor="new-acct-password">
          Password (optional)
        </label>
        <input
          id="new-acct-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="acct-field"
        />
        <p className="acct-hint mt-1.5">
          At least {MIN_PASSWORD} characters. Leave it empty to send a reset email from the account’s own page
          instead, or to let it sign in with Google.
        </p>
      </div>

      <div className="acct-actions">
        <span className="acct-hint">The account gets the welcome email, with its example songbook already in it.</span>
        <span className="acct-actions-pair">
          <button type="button" className="acct-pill" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" className="acct-save" disabled={!online || busy || incomplete}>
            Create the account
          </button>
        </span>
      </div>
    </form>
  )
}
