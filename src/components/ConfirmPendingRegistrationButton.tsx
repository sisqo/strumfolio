'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { confirmPendingRegistration } from '@/lib/accounts/actions'
import { CONFIRM_PENDING_MESSAGE } from '@/lib/accounts/types'
import { useOnline } from '@/lib/useOnline'

/**
 * Creates the account for a stuck pending registration immediately, bypassing the
 * verification link entirely (`PLAN-account-admin.md`, point 11) — the case: an expired
 * link, a spam filter, an email that never arrived. Lives inline in the "Pending
 * registrations" row on `/accounts`, not on a detail page of its own (Decision #8).
 *
 * Accepted risk, stated once here because no code path can check it: creates a real,
 * immediately-usable account for an address that never proved control of its own inbox.
 */
export function ConfirmPendingRegistrationButton({ email }: { email: string }) {
  const router = useRouter()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await confirmPendingRegistration(email)
      if (result.ok) router.refresh()
      else setError(CONFIRM_PENDING_MESSAGE[result.reason])
    } catch {
      setError(CONFIRM_PENDING_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className="btn btn-sm" disabled={!online || busy} onClick={() => void run()}>
        Confirm now
      </button>
      {error && (
        <p className="notice notice-error text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
