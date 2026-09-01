'use client'

import { useState } from 'react'

import { RATE_LIMIT_MESSAGE } from '@/lib/accounts/types'
import { clearRateLimitFor } from '@/lib/auth/actions'
import { useOnline } from '@/lib/useOnline'

/**
 * Clears the login/registration/reset/feedback rate-limit buckets for this address —
 * for a legitimate reader blocked by accident (`PLAN-account-admin.md`, point 9).
 * Email-keyed only; never touches the IP-keyed buckets — see `clearRateLimitFor`'s own
 * comment on why.
 */
export function ClearRateLimitButton({ ownerEmail }: { ownerEmail: string }) {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = async () => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await clearRateLimitFor(ownerEmail)
      if (result.ok) setDone(true)
      else setError(RATE_LIMIT_MESSAGE[result.reason])
    } catch {
      setError(RATE_LIMIT_MESSAGE.failed)
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
          Rate limits cleared.
        </p>
      )}
      <button type="button" className="btn btn-sm" disabled={!online || busy} onClick={() => void run()}>
        Unlock rate limit
      </button>
    </div>
  )
}
