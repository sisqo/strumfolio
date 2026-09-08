'use client'

import { useRouter } from 'next/navigation'

import { RATE_LIMIT_MESSAGE } from '@/lib/accounts/types'
import { useAdminAction } from '@/lib/accounts/useAdminAction'
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
  const router = useRouter()
  const online = useOnline()
  const { busy, error, done, run } = useAdminAction(
    () => clearRateLimitFor(ownerEmail),
    RATE_LIMIT_MESSAGE,
    () => router.refresh(),
  )

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
