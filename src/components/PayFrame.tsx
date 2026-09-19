'use client'

/**
 * Paddle's own payment form, opened for a transaction somebody arrived holding.
 *
 * This is the second page in the app that opens a Paddle checkout, and it exists for the one
 * Paddle opens on its own behalf: the **default payment link**. Paddle appends `?_ptxn=txn_…`
 * to it and sends the result in its own emails — the «update your payment method» link a
 * subscriber gets when their card fails, and the checkout link on any transaction. Until this
 * page existed that link landed on a page with no Paddle.js on it, which does nothing at all
 * and says nothing either.
 *
 * **It asks for no session, and that is the whole point.** The reader is somebody who followed
 * a link out of an email, on whatever device was to hand; requiring them to sign in first is
 * the friction that makes a failing card become a lapsed subscription. The transaction id *is*
 * the credential — it names one transaction, it is unguessable, and Paddle is the one that
 * issued it. Nothing here reads our database, so there is nothing for a stranger holding
 * somebody else's id to learn beyond what Paddle's own form would show them anyway.
 *
 * **It charges nothing of its own.** Every amount, item and discount belongs to the
 * transaction Paddle made; this page names no price and cannot. That is the same rule
 * `startPaddleCheckout` follows from the other direction — the browser never names a price —
 * and it is why this page can be public where `/checkout/[plan]` cannot.
 */

import { initializePaddle, type Environments, type Paddle } from '@paddle/paddle-js'
import { useEffect, useRef, useState } from 'react'

import { checkoutSettings, FRAME_TARGET } from '@/lib/plans/checkoutFrame'

/** Paddle's own id shape, checked before it is handed over rather than after. */
const TRANSACTION = /^txn_[a-z\d]{26}$/

export function PayFrame({ transactionId }: { transactionId: string | null }) {
  const paddle = useRef<Paddle | null>(null)
  const opened = useRef(false)
  const [ready, setReady] = useState(false)
  const [paid, setPaid] = useState(false)
  const [failed, setFailed] = useState(false)

  const valid = transactionId !== null && TRANSACTION.test(transactionId)

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!token || !valid || paddle.current?.Initialized) return

    initializePaddle({
      token,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox') as Environments,
      checkout: { settings: checkoutSettings() },
      eventCallback: (event) => {
        /* Same reading as `PaddleCheckout`: this means Paddle took the money, not that
           anything of ours has been written yet — the webhook does that, moments later. */
        if (event.name === 'checkout.completed') setPaid(true)
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
        setFailed(true)
      })
  }, [valid])

  /*
   * Opened from an effect and never from the render, for the reason `PaddleCheckout` records:
   * Paddle finds its target by class name, so the `div` has to be painted before `open()`
   * runs. `opened` is a ref rather than state because re-opening a form somebody is already
   * typing into would throw away what they have typed.
   */
  useEffect(() => {
    if (!ready || !valid || opened.current || transactionId === null) return
    opened.current = true
    paddle.current?.Checkout.open({ transactionId })
  }, [ready, valid, transactionId])

  if (!valid) {
    return (
      <p className="text-muted">
        This page opens a payment we have already prepared for you. Open it from the link in the
        email we sent, which carries the payment it belongs to — on its own there is nothing here
        to pay.
      </p>
    )
  }

  if (failed || !process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
    return <p className="text-muted">We could not open the payment form. Please try the link again in a moment.</p>
  }

  return (
    <>
      {paid && (
        <p className="mb-4 text-muted">Payment received — thank you. You can close this page.</p>
      )}
      {/* `bg-white` and not `--surface`: the frame is transparent and Paddle's palette is
          chosen against one known light ground, exactly as on `/checkout/[plan]`. */}
      <div className="card overflow-x-auto bg-white p-0 sm:p-[1.375rem]">
        <div className={FRAME_TARGET} />
      </div>
    </>
  )
}
