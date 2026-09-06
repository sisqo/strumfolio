'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { forceExpireNow } from '@/lib/plans/checkout'
import { FORCE_EXPIRE_MESSAGE } from '@/lib/plans/forceExpireMessage'
import { useOnline } from '@/lib/useOnline'

/**
 * Ends the live subscription's entitlements right now instead of at its paid-until date
 * — restored here behind `isOwner` after being pulled from every customer-facing screen
 * in v3.11. For testing grace/expiry behaviour on a
 * real account without waiting out a real calendar date.
 */
export function ForceExpireButton({ ownerEmail }: { ownerEmail: string }) {
  const router = useRouter()
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const run = async () => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await forceExpireNow(ownerEmail)
      if (result.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(FORCE_EXPIRE_MESSAGE[result.reason])
      }
    } catch {
      setError(FORCE_EXPIRE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2.5">
      {error && (
        <p className="notice notice-error mb-2" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice notice-accent mb-2" role="status">
          Expired.
        </p>
      )}
      <button type="button" className="btn btn-sm" disabled={!online || busy} onClick={() => void run()}>
        Force expire now
      </button>
    </div>
  )
}
