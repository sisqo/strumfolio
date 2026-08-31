'use client'

import { useCallback, useEffect, useState } from 'react'

import { IconOffline } from '@/components/icons'
import { loadOwnName, updateOwnName } from '@/lib/accounts/actions'
import { NAME_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Your own first and last name, set by you (`/profile`, `PLAN-account-name.md` point 5)
 * — same shell as `PasswordScreen`: nothing baked in, nothing cached, because whether a
 * name exists yet is a fact about the server that offline cannot answer.
 */
export function ProfileScreen() {
  const online = useOnline()

  const [name, setName] = useState<{ firstName: string; lastName: string } | null>(null)
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const refresh = useCallback(async () => {
    try {
      const loaded = await loadOwnName()
      setName(loaded)
      setFirstName(loaded?.firstName ?? '')
      setLastName(loaded?.lastName ?? '')
    } catch {
      setName(null)
    } finally {
      setAsked(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await updateOwnName(firstName, lastName)
      if (result.ok) {
        setDone(true)
        await refresh()
      } else {
        setError(NAME_MESSAGE[result.reason])
      }
    } catch {
      setError(NAME_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  if (!asked) return <p className="text-sm text-muted">One moment…</p>

  if (name === null) {
    return (
      <p className="notice notice-accent">
        <IconOffline />
        {online
          ? "Couldn't read your account. Reload the page."
          : 'You need a connection to change your name.'}
      </p>
    )
  }

  return (
    <div>
      {error !== null && (
        <p className="notice notice-error mb-4" role="alert">
          {error}
        </p>
      )}

      {done && (
        <p className="notice notice-accent mb-4" role="status">
          Saved.
        </p>
      )}

      <form className="grid max-w-sm gap-3" onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="field-label">First name</span>
          <input
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="form-field"
            required
          />
        </label>

        <label className="block">
          <span className="field-label">Last name</span>
          <input
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="form-field"
            required
          />
        </label>

        <div>
          <button type="submit" className="btn btn-primary" disabled={!online || busy}>
            Save
          </button>
        </div>
      </form>

      {!online && (
        <p className="notice notice-accent mt-4">
          <IconOffline />
          Your name can&apos;t be changed without a connection.
        </p>
      )}
    </div>
  )
}
