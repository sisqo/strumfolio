'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PaymentHistoryTable } from '@/components/PaymentHistoryTable'
import {
  clearPendingChange,
  forceExpireNow,
  loadCheckoutStatus,
  loadMyPaymentHistory,
  mockCancel,
  type MockSubscriptionState,
} from '@/lib/plans/checkout'
import type { PaymentHistoryLine } from '@/lib/plans/history'
import { PLAN_LABEL } from '@/lib/plans/types'

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; current: MockSubscriptionState; history: PaymentHistoryLine[] }

/** The plan in a sentence, resolved — never a raw column past its own date, see `resolveSubscription`. */
function statusLine(current: MockSubscriptionState): string {
  if (current.plan === 'free') return 'Free — nothing bought yet.'
  if (current.plan === 'lifetime') return 'Lifetime — bought once, nothing to renew or cancel.'
  if (current.status === 'expired') return `${PLAN_LABEL[current.plan]}, expired.`
  if (current.expiresAt === null) return `${PLAN_LABEL[current.plan]}, no end.`

  const until = current.expiresAt.toISOString().slice(0, 10)
  return current.pendingPlan !== null
    ? `${PLAN_LABEL[current.plan]} until ${until}, then ${PLAN_LABEL[current.pendingPlan]}.`
    : `${PLAN_LABEL[current.plan]}, active until ${until}.`
}

function canCancel(current: MockSubscriptionState): boolean {
  return current.plan !== 'free' && current.plan !== 'lifetime' && current.status !== 'expired' && current.pendingPlan === null
}

function canForceExpire(current: MockSubscriptionState): boolean {
  return current.plan !== 'free' && current.plan !== 'lifetime' && current.status !== 'expired'
}

/**
 * The one hub for a plan already bought: what it is, what it is about to become, the
 * payment history, and the controls to cancel it, undo a scheduled change, or — test only —
 * skip ahead to its end. Choosing a *different* plan is deliberately not answered here: that
 * is `/pricing`'s own comparison table and `/checkout/[plan]`'s buy flow, and reproducing
 * that table here would be the exact duplication `PLAN.md` (v3.6) decided against.
 *
 * Reachable from `UserMenu`'s Settings screen, as a plain link — the same way "Change
 * password" already leaves that panel for its own dedicated page instead of trying to fit
 * inline.
 */
export function BillingScreen() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const refresh = () => {
    void Promise.all([loadCheckoutStatus(), loadMyPaymentHistory()]).then(([checkoutResult, historyResult]) => {
      if (!checkoutResult.ok) {
        setStatus({
          state: 'unavailable',
          reason:
            checkoutResult.reason === 'disabled'
              ? 'Billing is not switched on right now.'
              : checkoutResult.reason === 'no-session'
                ? 'Sign in to see your plan.'
                : 'No database is configured, so there is nothing to read.',
        })
        return
      }
      setStatus({
        state: 'ready',
        current: checkoutResult.current,
        history: historyResult.ok ? historyResult.history : [],
      })
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const run = async (
    action: () => Promise<{ ok: true } | { ok: false; reason: string }>,
    said: string,
  ) => {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const result = await action()
      if (!result.ok) {
        setError(result.reason === 'not-applicable' ? 'Nothing to do here right now.' : "That didn't go through. Try again.")
        return
      }
      setDone(said)
      refresh()
    } catch {
      setError("That didn't go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Billing</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          What this account has bought, and the history of it.
        </p>
      </header>

      {status.state === 'loading' && <p className="mt-4 text-sm text-muted">One moment…</p>}
      {status.state === 'unavailable' && (
        <p className="notice notice-error mt-4" role="alert">
          {status.reason}
        </p>
      )}

      {status.state === 'ready' && (
        <>
          {done !== null && <p className="notice mt-4">{done}</p>}
          {error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">This account&apos;s plan</h2>
            <p className="mt-1.5 text-sm text-muted">{statusLine(status.current)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {status.current.pendingPlan !== null && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  onClick={() => void run(clearPendingChange, `Kept — staying on ${PLAN_LABEL[status.current.plan]}.`)}
                >
                  Keep {PLAN_LABEL[status.current.plan]}
                </button>
              )}

              <Link href="/pricing" className="btn btn-sm">
                Change plan
              </Link>

              {canCancel(status.current) && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => void run(mockCancel, 'Scheduled — this plan cancels once the period already paid for ends.')}
                >
                  Cancel my plan
                </button>
              )}
            </div>

            {canForceExpire(status.current) && (
              <p className="mt-3 text-[0.8125rem] text-muted">
                Testing the freeze without waiting for a real date:{' '}
                <button
                  type="button"
                  className="text-accent hover:underline"
                  disabled={busy}
                  onClick={() => void run(forceExpireNow, 'Expired now.')}
                >
                  force this plan to expire right now
                </button>
                .
              </p>
            )}
          </div>

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">Payment history</h2>
            <div className="mt-2">
              <PaymentHistoryTable lines={status.history} />
            </div>
          </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/pricing" className="text-accent hover:underline">
          Back to plans
        </Link>
      </p>
    </>
  )
}
