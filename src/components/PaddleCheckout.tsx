'use client'

/**
 * The real checkout: a cycle to pick, and a button that opens Paddle's overlay on a
 * transaction the server made.
 *
 * **It never names a price.** The browser picks a *cycle*; `startPaddleCheckout` decides which
 * price that cycle is sold at, stamps the account on the transaction and hands back only its
 * id — so everything this component can ask Paddle to open is something the server already
 * agreed to sell, and a tampered value can at worst name the other plan we publish anyway.
 * That is the rule `mockPurchase` states about coupons, kept rather than traded away for the
 * shorter client-side form where the page passes `items: [{ priceId }]`.
 *
 * **The props are a union rather than one shape with optional fields**, because Lifetime has
 * no cycle and pretending otherwise is how it ends up sold with one. `prices.ts` keeps
 * `LIFETIME` out of `PRICES` for the same reason; this mirrors that split instead of flattening
 * it back.
 *
 * `initializePaddle` is called once and guarded on `Initialized`: the SDK warns and refuses a
 * second call, and React in development mounts every effect twice.
 *
 * Nothing here provisions anything. The overlay closing is not a payment, and a reader who
 * closes the tab mid-redirect has still paid — `api/paddle/webhook` is what grants the plan,
 * which is why this says «we are finishing up» rather than «you now have Premium».
 */

import { initializePaddle, type Environments, type Paddle } from '@paddle/paddle-js'
import { useEffect, useRef, useState } from 'react'

import { startPaddleCheckout, type PaddleCheckoutFailure } from '@/lib/plans/paddleCheckout'
import { euro, yearlyTotalOfMonthly, type BillingPeriod, type PaidPlan } from '@/lib/plans/prices'
import { PLAN_LABEL } from '@/lib/plans/types'

/**
 * What each refusal is called to a reader. `coupon-unsupported` is the only one that describes
 * a decision rather than a fault, and it says so plainly instead of blaming the reader's
 * coupon: the discount is real and this path cannot honour it yet, so the honest thing is to
 * ask them to wait rather than to sell them the plan at full price.
 */
const REFUSALS: Record<PaddleCheckoutFailure, string> = {
  'not-configured': 'Payments are not switched on here yet.',
  'no-database': 'We could not reach your account. Please try again in a moment.',
  'no-session': 'Please sign in again to continue.',
  'invalid-plan': 'That plan does not exist.',
  'no-price': 'This plan is not on sale in this environment.',
  'coupon-unsupported':
    'Your discount cannot be applied at checkout yet, and we will not charge you full price ' +
    'while it stands. Please come back shortly.',
  failed: 'Something went wrong starting your checkout. Please try again.',
}

type Props =
  | {
      plan: PaidPlan
      initialCycle: BillingPeriod
      /**
       * Both cycles, so the toggle needs no second round trip — and **unformatted**, exactly as
       * `PRICES` stores them. `euro()` is applied here rather than by the page, because this
       * also has to do arithmetic on the monthly figure for the comparison below, and a string
       * that already carries a currency symbol cannot be added up.
       */
      amounts: Record<BillingPeriod, string>
    }
  | { plan: 'lifetime'; amount: string }


export function PaddleCheckout(props: Props) {
  const paddle = useRef<Paddle | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [cycle, setCycle] = useState<BillingPeriod>(
    props.plan === 'lifetime' ? 'year' : props.initialCycle,
  )

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!token || paddle.current?.Initialized) return

    initializePaddle({
      token,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox') as Environments,
      eventCallback: (event) => {
        /* `checkout.completed` means Paddle took the money, not that the plan is granted —
           the webhook does that, and it may land a second or two later. */
        if (event.name === 'checkout.completed') {
          setMessage('Payment received — we are finishing up. Your plan will appear in a moment.')
        }
      },
    })
      .then((instance) => {
        if (instance) {
          paddle.current = instance
          setReady(true)
        }
      })
      .catch((error) => {
        console.error('Paddle failed to initialise', error)
        setMessage(REFUSALS.failed)
      })
  }, [])

  async function buy() {
    setBusy(true)
    setMessage(null)

    /* Null for Lifetime, which is bought once — the action refuses the mismatch either way. */
    const result = await startPaddleCheckout(props.plan, props.plan === 'lifetime' ? null : cycle)

    if (!result.ok) {
      setMessage(REFUSALS[result.reason])
      setBusy(false)
      return
    }

    paddle.current?.Checkout.open({ transactionId: result.transactionId })
    setBusy(false)
  }

  const amount = props.plan === 'lifetime' ? props.amount : props.amounts[cycle]

  return (
    <div className="mt-6">
      {/* `segment` / `segment-button is-on`, the same control `CheckoutScreen` uses for this
          exact choice — the classes already exist and carry the theme, so this is not the
          place to invent a second look for one switch. Yearly first, the side /pricing opens
          on. */}
      {props.plan !== 'lifetime' && (
        <div className="segment w-fit" role="group" aria-label="Billing period">
          {(['year', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCycle(option)}
              aria-pressed={cycle === option}
              className={option === cycle ? 'segment-button is-on px-4' : 'segment-button px-4'}
            >
              {option === 'year' ? 'Yearly' : 'Monthly'}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-lg">
        {PLAN_LABEL[props.plan]} — {euro(amount)}
        {props.plan === 'lifetime' ? ' once' : cycle === 'year' ? ' a year' : ' a month'}
      </p>

      {/* The comparison /pricing makes rather than a claim about savings: the reader puts the
          two numbers side by side themselves, which they do correctly and faster than they
          read a sentence about it. */}
      {props.plan !== 'lifetime' && cycle === 'month' && (
        <p className="mt-1 text-sm opacity-80">
          {yearlyTotalOfMonthly(props.amounts.month)} a year, against {euro(props.amounts.year)}{' '}
          paid yearly.
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        onClick={() => void buy()}
        disabled={!ready || busy}
      >
        {busy ? 'One moment…' : `Pay for ${PLAN_LABEL[props.plan]}`}
      </button>

      {message !== null && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
