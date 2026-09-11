'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { rememberUrlOffer } from '@/lib/coupons/actions'

/**
 * Teaches the public home to notice a campaign link.
 *
 * **The home is the one page that cannot read its own query string.** `Landing` is rendered by
 * `app/(home)/layout.tsx`, and a layout in the App Router is never handed `searchParams` — so
 * `/?promo=1`, which is where campaign links point, arrived at a page structurally unable to see
 * it. Until this shipped that did not show, because the overlay was drawn for *everybody*
 * whether they carried a coupon or not; with the front-door advertising gone, a link that cannot
 * be read is a link that does nothing.
 *
 * So the parameter is read here, on the client, and handed to `rememberUrlOffer`, which resolves
 * it through the same `activeCoupon` that `/pricing` uses and writes the cookie. The next server
 * render sees that cookie and draws the overlay — which is why this asks for a refresh rather
 * than rendering anything itself: the overlay's collapsed state is read from a cookie during the
 * server render precisely so it appears in the state the reader left it, and a client-drawn copy
 * would lose that.
 *
 * **Two guards, against two different repeats.** `asked` stops React's development double-mount
 * from making the same round trip twice, exactly as `CouponBar`'s own effect does. `carriedCode`
 * stops the refresh loop, which is the one that would actually hurt: after `router.refresh()`
 * this component renders again with the parameter still in the URL, and a ref alone does not
 * survive that. Comparing what was stored against what the server already rendered from means
 * the second pass finds them equal and asks for nothing — the same shape as `/pricing`'s
 * `persist`, which is `undefined` once the cookie holds the code.
 *
 * Renders nothing, and does nothing at all on the overwhelming majority of visits, which carry
 * no parameter.
 */
export function LandingOffer({ carriedCode }: { carriedCode: string | null }) {
  const params = useSearchParams()
  const router = useRouter()
  const asked = useRef(false)

  useEffect(() => {
    const coupon = params.get('coupon') ?? undefined
    const promo = params.get('promo') ?? undefined
    if ((coupon === undefined && promo === undefined) || asked.current) return
    asked.current = true

    void rememberUrlOffer({ coupon, promo }).then((result) => {
      /* Only when the cookie changed: a reader reloading `/?promo=1` already holds the code, and
         refreshing would redraw the page to say exactly what it says. */
      if (result.ok && result.code !== carriedCode) router.refresh()
    })
  }, [params, carriedCode, router])

  return null
}
