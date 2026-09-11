'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import { rememberUrlCoupon } from '@/lib/coupons/actions'
import { claimRestoreAttempt, rememberedOffer, rememberOffer } from '@/lib/coupons/memory'

/**
 * Keeps an offer this browser arrived with past the day the cookie stops carrying it.
 *
 * **What it is for.** `songbook-coupon` lives for `min(thirty days, what is left of the
 * campaign)`, and the thirty is Google Ads' attribution window rather than a decision about the
 * offer — see `COUPON_MEMORY_KEY`. So somebody who clicked an advertisement in March was served
 * the full listino in May with the campaign still running, and nothing on the page, in the
 * cookie or in the ledger to say they had ever been offered anything. This is the half that
 * outlives the cookie and can write it again.
 *
 * **Two halves, and which one runs is decided by the server.** `restorable` is the campaign the
 * page resolved for this request, or `null`:
 *
 * - **Something is in force** → remember it, and stop. Written on every such load rather than
 *   only on the arrival that set the cookie, so a reader whose cookie predates this feature —
 *   or whose storage was cleared — picks the memory back up on their next visit instead of
 *   never. The write is a `setItem` of a value that is usually already there, which is why it
 *   costs nothing to do it repeatedly and needs no ref to stop it.
 * - **Nothing is in force** → hand the remembered code to `rememberUrlCoupon`, which re-reads
 *   the row and re-checks the campaign's state, window, both ceilings and its `entry` before it
 *   writes a cookie, and then ask for the render that will draw the offer.
 *
 * **The restore is deliberately re-entering by the same door the reader came in by.**
 * `rememberUrlCoupon` is the URL path, `entryAllowsUrl` check included, and that is why
 * `restorableCode` refuses to remember a typed-code-only campaign in the first place: a memory
 * that cannot be restored is a round trip spent to be told so. The restore can therefore never
 * grant more than the original link did, which is the property worth having — this value is
 * writable by anything on the page.
 *
 * **Three guards, against three different repeats.**
 *
 * 1. A URL carrying `?coupon=` or `?promo=` is left alone. `LandingOffer` on `/` and
 *    `CouponBar`'s own effect on `/pricing` are already resolving it, and a second component
 *    writing the same cookie from a different code is two answers to one question.
 * 2. `claimRestoreAttempt` bounds the whole browsing session to one attempt, reading and
 *    claiming the marker in a single synchronous call — so React's development double-mount
 *    gets one round trip and not two, and no separate ref is needed for it. It is also what
 *    makes it safe never to delete a memory that fails: `rememberUrlCoupon` answers a bare
 *    boolean and cannot tell a campaign archived yesterday from one opening tomorrow, so
 *    forgetting on a refusal would throw away the second, and keeping it without the marker
 *    would spend a round trip on the first at every page load for ever.
 * 3. The refresh happens only on success, and a successful restore makes the next render pass
 *    `restorable` non-null — which takes the first branch and returns. There is no path back to
 *    the round trip, which is the loop `LandingOffer`'s `carriedCode` comparison exists to
 *    prevent in its own shape.
 *
 * Renders nothing, and on the overwhelming majority of loads does one `localStorage` read that
 * answers `null`.
 */
export function CouponMemory({
  restorable,
}: {
  /**
   * The code to remember, from `restorableCode(campaign)` on the server — the campaign this
   * request resolved, when it is one a link could bring back. `null` when nothing is in force,
   * which is what asks for a restore.
   */
  restorable: string | null
}) {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (restorable !== null) {
      rememberOffer(restorable)
      return
    }

    if (params.get('coupon') !== null || params.get('promo') !== null) return

    const stored = rememberedOffer()
    if (stored === null || !claimRestoreAttempt()) return

    void rememberUrlCoupon(stored).then((result) => {
      /* The prices, the bar and the overlay are all server-rendered from the cookie this has
         just written, so the page has to be asked again for any of it to appear. */
      if (result.ok) router.refresh()
    })
  }, [restorable, params, router])

  return null
}
