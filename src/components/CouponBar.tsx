'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { IconCheck } from '@/components/icons'
import { applyCoupon, clearCoupon, rememberUrlCoupon } from '@/lib/coupons/actions'
import { COUPON_FAILURE_MESSAGE, isCodeShape } from '@/lib/coupons/types'
import { useOnline } from '@/lib/useOnline'

/**
 * The fixed element: the coupon in force, or the field to type one into.
 *
 * One component on both `/pricing` and `/checkout`, and one and not two because
 * `PaidCheckoutFields` prints its price independently — a coupon that stopped at `/pricing`
 * would vanish at the click on «Choose», which is the point in the funnel where the basket is
 * already full.
 *
 * **The text field is always here when no coupon is applied**, whatever campaigns happen to
 * exist. An earlier draft rendered it only when some live campaign accepted a typed code, which
 * was wrong twice over: it tells anyone watching whether such a campaign exists, and it
 * flickers as campaigns rotate — and it is precisely absent for the reader holding a partner
 * code off a flyer while the only live campaign is link-only. The `entry` gate lives in
 * `read.ts`, where it refuses the code; a code that does not resolve says so.
 *
 * Only `@/lib/coupons/types` is value-imported here — never `read.ts` — because that module is
 * kept free of any `@/lib/db` import for the reason `PricingPlans.tsx`'s header spells out.
 * `actions.ts` is a `'use server'` module, so importing it costs an RPC reference and not the
 * module, exactly as `GiftForm` imports `setGrant`.
 *
 * The banner's own sentence is composed on the server by `bannerCopy` and arrives as `applied`.
 * There is no column of free copy behind it: a banner assembled from what the discount actually
 * does cannot promise something it does not, and a hand-written headline can.
 */
export function CouponBar({
  applied,
  persist,
}: {
  /** The finished sentence from `bannerCopy`, or `null` when no coupon is in force. */
  applied: string | null
  /**
   * A code the URL brought that the cookie does not hold yet — written once, from an effect,
   * because Next.js allows a cookie write only from a server action, a route handler or
   * middleware. Nothing on screen waits for it: the prices are already discounted in the first
   * byte of HTML, and this is only what makes the discount survive the reader coming back
   * tomorrow to a bare `/pricing`.
   */
  persist?: string
}) {
  const router = useRouter()
  const online = useOnline()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
   * `useRef` and not a `[]` dependency list alone: in development React mounts every effect
   * twice, and a second `rememberUrlCoupon` for the same code is a second database round trip
   * that writes the identical cookie. Harmless, and still worth not doing.
   */
  const remembered = useRef(false)

  useEffect(() => {
    if (persist === undefined || remembered.current) return
    remembered.current = true
    /* Fire and forget, and deliberately without `router.refresh()`: the page already shows the
       discount, so a refresh would redraw it to say exactly the same thing. */
    void rememberUrlCoupon(persist)
  }, [persist])

  const submit = async () => {
    const typed = code.trim()
    if (typed === '') return

    setBusy(true)
    setError(null)

    /* Checked here as well as in the action, only so an obviously wrong shape costs no round
       trip. The action re-checks, because this one cannot be trusted to have run. */
    if (!isCodeShape(typed)) {
      setError(COUPON_FAILURE_MESSAGE['unknown-code'])
      setBusy(false)
      return
    }

    try {
      const result = await applyCoupon(typed)
      if (result.ok) {
        setCode('')
        /* The prices are server-rendered, so the page has to be re-fetched for them to change
           — this is the one place in this component where a refresh is the whole point. */
        router.refresh()
      } else {
        setError(COUPON_FAILURE_MESSAGE[result.reason])
      }
    } catch {
      setError(COUPON_FAILURE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await clearCoupon()
      router.refresh()
    } catch {
      setError(COUPON_FAILURE_MESSAGE.failed)
    } finally {
      setBusy(false)
    }
  }

  if (applied !== null) {
    return (
      <div className="coupon-bar is-on" role="status">
        <span className="coupon-bar-mark">
          <IconCheck size={16} />
        </span>
        <span className="coupon-bar-text">{applied}</span>
        <button type="button" className="btn btn-sm coupon-bar-action" disabled={!online || busy} onClick={() => void remove()}>
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="coupon-bar">
      {/*
        * A real `<form>` with `onSubmit`, not a bare input and a button: Enter has to submit a
        * one-field form, and on a phone the on-screen keyboard shows «Go» rather than a newline
        * only inside one. `preventDefault` because the action is called directly.
        */}
      <form
        className="coupon-bar-form"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="coupon-bar-text" htmlFor="coupon-code">
          Have a code?
        </label>
        <input
          id="coupon-code"
          name="coupon"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          /* Upper case as it is typed, because that is how a code is printed on whatever the
             reader is copying it from — and how it is stored, so what they see is what matches. */
          className="form-field coupon-bar-field uppercase"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          placeholder="FOUNDER30"
          aria-describedby={error === null ? undefined : 'coupon-error'}
          aria-invalid={error === null ? undefined : true}
        />
        <button type="submit" className="btn btn-sm coupon-bar-action" disabled={!online || busy || code.trim() === ''}>
          Use
        </button>
      </form>

      {error !== null && (
        <p id="coupon-error" className="coupon-bar-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
