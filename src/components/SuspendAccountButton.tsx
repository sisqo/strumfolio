'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { setAccountSuspended } from '@/lib/accounts/actions'
import { SUSPEND_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Suspends or reactivates an account — blocks new sign-ins only, not a session already
 * issued (`setAccountSuspended`'s own comment). A
 * single toggle, not click-to-reveal like the Danger zone: fully reversible with one
 * more click, so the extra friction of a confirm step buys nothing here.
 */
export function SuspendAccountButton({ ownerEmail, suspended }: { ownerEmail: string; suspended: boolean }) {
  const router = useRouter()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await setAccountSuspended(ownerEmail, !suspended)
      if (result.ok) router.refresh()
      else setError(SUSPEND_MESSAGE[result.reason])
    } catch {
      setError(SUSPEND_MESSAGE.failed)
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
      <button
        type="button"
        className={suspended ? 'btn btn-sm' : 'btn btn-danger btn-sm'}
        disabled={!online || busy}
        onClick={() => void run()}
      >
        {suspended ? 'Reactivate account' : 'Suspend account'}
      </button>
    </div>
  )
}
