'use client'

import { useState } from 'react'

import { sendPasswordResetFor } from '@/lib/auth/actions'
import { PASSWORD_MESSAGE } from '@/lib/auth/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Sends a password-reset email instead of setting the password directly (`PasswordForm`
 * beside it) — for when the admin would rather the account holder choose their own.
 */
export function SendResetEmailButton({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = async () => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await sendPasswordResetFor(ownerEmail)
      if (result.ok) setDone(true)
      else setError(PASSWORD_MESSAGE[result.reason])
    } catch {
      setError(PASSWORD_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {error && (
        <p className="notice notice-error mb-2" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mb-2" role="status">
          Reset email sent.
        </p>
      )}
      <button type="button" className="btn btn-sm" disabled={!online || busy} onClick={() => void run()}>
        Send password-reset email
      </button>
    </div>
  )
}
