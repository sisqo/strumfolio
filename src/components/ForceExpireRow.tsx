'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { subscriptionHeadline } from '@/lib/accounts/planText'
import type { AccountPlanLine } from '@/lib/accounts/read'
import { forceExpireNow } from '@/lib/plans/checkout'
import { FORCE_EXPIRE_MESSAGE } from '@/lib/plans/forceExpireMessage'
import { useOnline } from '@/lib/useOnline'

/**
 * The subscription side of the Plan & gift tab: what was bought, and the one way to end it
 * early. Ends the live subscription's entitlements right now instead of at its paid-until
 * date — restored here behind `isOwner` after being pulled from every customer-facing screen
 * in v3.11. For testing grace/expiry behaviour on a real account without waiting out a real
 * calendar date.
 *
 * **Two independent conditions, and they are not the same one.** The strip is drawn for any
 * account that has ever bought something (`plan !== 'free'`), because a lapsed Premium is a
 * fact an operator needs on this page and `Account Detail.dc.html` — drawn in the live state —
 * has no other place for it. The *button* appears only for a subscription that can actually be
 * expired, which is exactly what `forceExpireNow` itself checks (`liveSubscription`,
 * `checkout.ts`): never for `lifetime`, and never for a gift, since `effectivePlan` would
 * offer the button on a free account holding only a gifted plan, where the action always
 * answers `not-applicable`.
 *
 * Returns nothing at all for an account that never subscribed — a strip reading «No
 * subscription» beside no button is a row that exists to say nothing.
 */
export function ForceExpireRow({ ownerEmail, plan }: { ownerEmail: string; plan: AccountPlanLine }) {
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

  if (plan.plan === 'free') return null

  const expirable =
    plan.subscriptionPlan !== null && plan.subscriptionPlan !== 'free' && plan.subscriptionPlan !== 'lifetime'

  return (
    <div className="acct-row">
      <div className="acct-row-text">
        <span className="acct-row-title">{subscriptionHeadline(plan)}</span>
        {expirable && (
          <span className="acct-row-note">
            Expiring it now ends the paid period immediately — for testing what the account sees afterwards.
          </span>
        )}
        {error && (
          <p className="notice notice-error mt-2 text-sm" role="alert">
            {error}
          </p>
        )}
        {done && (
          <p className="notice notice-accent mt-2 text-sm" role="status">
            Expired.
          </p>
        )}
      </div>
      {expirable && (
        <button type="button" className="acct-pill" disabled={!online || busy} onClick={() => void run()}>
          Force expire now
        </button>
      )}
    </div>
  )
}
