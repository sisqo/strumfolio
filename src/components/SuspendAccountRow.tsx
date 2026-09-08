'use client'

import { useRouter } from 'next/navigation'

import { setAccountSuspended } from '@/lib/accounts/actions'
import { SUSPEND_MESSAGE } from '@/lib/accounts/types'
import { useAdminAction } from '@/lib/accounts/useAdminAction'
import { useOnline } from '@/lib/useOnline'

/**
 * Suspends or reactivates an account — blocks new sign-ins only, not a session already
 * issued (`setAccountSuspended`'s own comment). A
 * single toggle, not click-to-reveal like the delete row: fully reversible with one
 * more click, so the extra friction of a confirm step buys nothing here.
 *
 * The strip's own sentence changes with the state, not only the button's label: what
 * suspending *does* and what lifting it does are different facts, and the row is where an
 * operator reads them (`Account Detail.dc.html` — see `SendResetEmailRow` on why a strip).
 */
export function SuspendAccountRow({ ownerEmail, suspended }: { ownerEmail: string; suspended: boolean }) {
  const router = useRouter()
  const online = useOnline()
  const { busy, error, run } = useAdminAction(
    () => setAccountSuspended(ownerEmail, !suspended),
    SUSPEND_MESSAGE,
    () => router.refresh(),
  )

  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">{suspended ? 'Reactivate the account' : 'Suspend the account'}</span>
        <span className="acct-row-note">
          {suspended
            ? 'Lets this address sign in again. Nothing else about the account changed while it was suspended.'
            : 'Blocks the next sign-in. A session already open — including one already broadcasting in Strum Together — keeps working until it naturally expires. Songbooks and songs are untouched, and it can be lifted at any time.'}
        </span>
        {error && (
          <p className="notice notice-error mt-2 text-sm" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="button" className="acct-pill" disabled={!online || busy} onClick={() => void run()}>
        {suspended ? 'Reactivate account' : 'Suspend account'}
      </button>
    </div>
  )
}
