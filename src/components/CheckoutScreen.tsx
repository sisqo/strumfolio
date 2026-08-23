'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { loadCheckoutStatus, mockPurchase, type MockSubscriptionState } from '@/lib/plans/checkout'
import { euro, LIFETIME, PRICES, yearlyTotalOfMonthly } from '@/lib/plans/prices'
import type { BillingPeriod, CheckoutPlan, PaidPlan } from '@/lib/plans/prices'
import { subscriptionStatusLine } from '@/lib/plans/subscriptionCopy'
import { ACCEPTED_TEST_CARD, isAcceptedTestCard } from '@/lib/plans/testCard'
import { PLAN_LABEL } from '@/lib/plans/types'

/**
 * Fake, and never sent anywhere past this component: a real card was never going to reach
 * this database, and `mockPurchase` takes no card fields at all. What the number typed here
 * decides is read entirely in `buy`, below, before `mockPurchase` is ever called — see
 * `isAcceptedTestCard`'s own comment. Prefilled with the number that succeeds, so trying the
 * flow needs no typing; typing over it is how a tester tries the decline path instead.
 */
const FAKE_CARD = { name: '', number: ACCEPTED_TEST_CARD, expiry: '12 / 30', cvc: '123' }

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; current: MockSubscriptionState }

/**
 * The mock checkout's actual screen — see `lib/plans/checkout.ts`'s own header for what this
 * is standing in for and why it is open to anybody signed in. Everything that depends on who
 * is asking is asked from here, on mount, the same `/password` and `/accounts` already do:
 * the page around this is a static shell with no idea who is looking.
 *
 * Buying only — no cancel button lives here any more. Managing a plan already bought
 * (cancelling, undoing a scheduled change, the payment history) moved to `/billing`
 * (`BillingScreen`), the once place for both; this screen's own job is narrower than that
 * and stays narrow, with a link across for anyone who arrived here already holding a plan.
 */
export function CheckoutScreen({
  plan,
  initialCycle = 'year',
}: {
  plan: CheckoutPlan
  /** Carried over from /pricing's own toggle by the page, so arriving from Monthly there
      does not land on Yearly here. */
  initialCycle?: BillingPeriod
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [cycle, setCycle] = useState<BillingPeriod>(initialCycle)
  const [card, setCard] = useState(FAKE_CARD)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const refresh = () => {
    void loadCheckoutStatus().then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason:
            result.reason === 'disabled'
              ? 'Checkout is not available right now.'
              : result.reason === 'no-session'
                ? 'Sign in to continue.'
                : 'No database is configured, so there is nothing to write to.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const buy = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    if (!isAcceptedTestCard(card.number)) {
      setError('Card declined. Try 4111 1111 1111 1111.')
      setBusy(false)
      return
    }
    try {
      const result = await mockPurchase(plan, cycle)
      if (!result.ok) {
        setError(
          result.reason === 'not-applicable'
            ? 'This account is already on Lifetime — there is nothing left to buy.'
            : "That didn't go through. Try again.",
        )
        return
      }
      /*
       * A purchase that took effect leaves this screen entirely, for `/thanks` — the plan is
       * bought, and what a musician needs next is a songbook to put songs in, not a receipt line
       * on the form they just submitted. `router.push`, so Back still returns here rather than
       * replaying the purchase.
       *
       * A *scheduled* change deliberately stays put and keeps the inline sentence: nothing has
       * happened to this account's plan yet, so a page thanking somebody for a purchase would be
       * both premature and, on a downgrade, the wrong sentiment.
       */
      if (result.effect === 'immediate') {
        router.push('/thanks')
        return
      }

      setDone(`Scheduled — this account moves to ${PLAN_LABEL[plan]} once the plan it already paid for ends.`)
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
        <h1 className="screen-title">Checkout — {PLAN_LABEL[plan]}</h1>
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          One payment sets up your plan. You can change it or cancel any time from Billing.
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
            <h2 className="section-title">This account right now</h2>
            <p className="mt-1.5 text-sm text-muted">{subscriptionStatusLine(status.current)}</p>
            {status.current.plan !== 'free' && (
              <p className="mt-1.5 text-sm">
                <Link href="/billing" className="text-accent hover:underline">
                  Manage this plan, or see the payment history
                </Link>
              </p>
            )}
          </div>

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">Pay</h2>

            {plan === 'lifetime' ? (
              <p className="mt-3 text-2xl font-medium">{euro(LIFETIME.amount)}, once</p>
            ) : (
              <PaidCheckoutFields plan={plan} cycle={cycle} onCycle={setCycle} />
            )}

            {/*
              * Real controlled inputs rather than static text, so the flow feels like a
              * checkout — but only `number` is ever read, by `buy` above, and only to decide
              * accept or decline. Name, expiry and CVC stay decorative, the same as before.
              */}
            <div className="mt-4 grid gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="text-[0.84375rem] text-muted">Name on card</span>
                <input
                  value={card.name}
                  onChange={(event) => setCard({ ...card, name: event.target.value })}
                  placeholder="As printed on the card"
                  className="form-field"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[0.84375rem] text-muted">Card number</span>
                <input
                  value={card.number}
                  onChange={(event) => setCard({ ...card, number: event.target.value })}
                  inputMode="numeric"
                  className="form-field"
                />
              </label>
              <div className="flex gap-2.5">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[0.84375rem] text-muted">Expiry</span>
                  <input
                    value={card.expiry}
                    onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                    className="form-field"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[0.84375rem] text-muted">CVC</span>
                  <input
                    value={card.cvc}
                    onChange={(event) => setCard({ ...card, cvc: event.target.value })}
                    inputMode="numeric"
                    className="form-field"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              disabled={busy}
              onClick={() => void buy()}
            >
              Complete purchase
            </button>
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

/** The billing-period toggle and the price under it — split out so `plan` narrows to `PaidPlan` here, off the `plan === 'lifetime'` branch at the one call site. */
function PaidCheckoutFields({
  plan,
  cycle,
  onCycle,
}: {
  plan: PaidPlan
  cycle: BillingPeriod
  onCycle: (value: BillingPeriod) => void
}) {
  const price = PRICES[plan][cycle]

  return (
    <>
      <div className="segment mt-3 w-fit" role="group" aria-label="Billing period">
        {(['year', 'month'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === cycle ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={value === cycle}
            onClick={() => onCycle(value)}
          >
            {value === 'year' ? 'Yearly' : 'Monthly'}
          </button>
        ))}
      </div>

      <p className="mt-3 text-2xl font-medium">
        {euro(price.amount)} per {cycle}
      </p>
      {cycle === 'month' && (
        <p className="mt-1 text-sm text-muted">{yearlyTotalOfMonthly(price.amount)} over a year.</p>
      )}
    </>
  )
}
