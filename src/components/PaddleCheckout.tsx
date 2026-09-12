'use client'

/**
 * The real checkout: a button that opens Paddle's overlay on a transaction the server made.
 *
 * **It never names a price.** `startPaddleCheckout` decides which price this plan and cycle
 * are sold at, stamps the account on the transaction and hands back only its id — so
 * everything this component can ask Paddle to open is something the server already agreed to
 * sell. That is the same rule `mockPurchase` states about coupons, kept rather than traded
 * away for the shorter client-side form where the page passes `items: [{ priceId }]`.
 *
 * `initializePaddle` is called once and guarded on `Initialized`: the SDK warns and refuses a
 * second call, and React in development mounts every effect twice.
 *
 * Nothing here provisions anything. The overlay closing is not a payment, and a reader who
 * closes the tab mid-redirect has still paid — `api/paddle/webhook` is what grants the plan,
 * which is why this shows «we are finishing up» rather than «you now have Premium».
 */

import { initializePaddle, type Environments, type Paddle } from '@paddle/paddle-js'
import { useEffect, useRef, useState } from 'react'

import { startPaddleCheckout, type PaddleCheckoutFailure } from '@/lib/plans/paddleCheckout'
import { PLAN_LABEL, type Plan } from '@/lib/plans/types'
import type { BillingPeriod } from '@/lib/plans/prices'

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

interface Props {
  plan: Plan
  cycle: BillingPeriod
  /** Euro as `/pricing` prints it — passed in rather than read here, for `prices.ts`' reason:
      the page that renders this already had to name the amount, and a second reader of the
      table is a second thing to keep in step with it. */
  amount: string
}

export function PaddleCheckout({ plan, cycle, amount }: Props) {
  const paddle = useRef<Paddle | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

    const result = await startPaddleCheckout(plan, cycle)

    if (!result.ok) {
      setMessage(REFUSALS[result.reason])
      setBusy(false)
      return
    }

    paddle.current?.Checkout.open({ transactionId: result.transactionId })
    setBusy(false)
  }

  return (
    <div className="paddle-checkout">
      <p className="paddle-checkout-amount">
        {PLAN_LABEL[plan]} — {amount}
        {plan === 'lifetime' ? ' once' : cycle === 'year' ? ' a year' : ' a month'}
      </p>
      <button type="button" className="button-primary" onClick={buy} disabled={!ready || busy}>
        {busy ? 'One moment…' : `Pay for ${PLAN_LABEL[plan]}`}
      </button>
      {message !== null && <p role="status">{message}</p>}
    </div>
  )
}
