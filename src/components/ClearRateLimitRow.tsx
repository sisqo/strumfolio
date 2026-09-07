'use client'

import { useState } from 'react'

import { RATE_LIMIT_MESSAGE } from '@/lib/accounts/types'
import { clearRateLimitFor } from '@/lib/auth/actions'
import { useOnline } from '@/lib/useOnline'

/**
 * Clears the login/registration/reset/feedback rate-limit buckets for this address —
 * for a legitimate reader blocked by accident.
 * Email-keyed only; never touches the IP-keyed buckets — see `clearRateLimitFor`'s own
 * comment on why. The Rate limit cell in the strip above reads exactly the four keys this
 * clears (`rateLimitStatusFor`), so the number up there and this button always agree.
 *
 * A strip, for the reason `SendResetEmailRow` states (`Account Detail.dc.html`).
 */
export function ClearRateLimitRow({ ownerEmail }: { ownerEmail: string }) {
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
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">Clear the rate limit</span>
        <span className="acct-row-note">
          Unlocks sign-in after too many failed attempts, without waiting for the window to pass.
        </span>
        {error && (
          <p className="notice notice-error mt-2 text-sm" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="notice notice-accent mt-2 text-sm" role="status">
            Rate limits cleared.
          </p>
        )}
      </div>
      <button type="button" className="acct-pill" disabled={!online || busy} onClick={() => void run()}>
        Clear rate limit
      </button>
    </div>
  )
}
