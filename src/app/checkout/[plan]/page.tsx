import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { CheckoutScreen } from '@/components/CheckoutScreen'
import type { CheckoutCoupon } from '@/components/CheckoutScreen'
import { CouponBar } from '@/components/CouponBar'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { currentUser, requireAccount } from '@/lib/auth/session'
import { appliedCopy } from '@/lib/coupons/discount'
import { activeCoupon } from '@/lib/coupons/read'
import { COUPON_COOKIE } from '@/lib/coupons/types'
import { isCheckoutPlan } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'
import { formatPlanDate } from '@/lib/plans/subscriptionCopy'
import { loadLifetimeOnSale } from '@/lib/settings/read'

export const metadata: Metadata = { title: 'Checkout' }

interface Props {
  params: Promise<{ plan: string }>
  /*
   * `cycle` — carried over from /pricing's own Monthly/Yearly toggle, which is set client-side
   * there — so choosing Monthly there and tapping Choose does not land back on Yearly.
   *
   * `coupon` — the same code /pricing put into every one of its checkout links. Redundant with
   * the cookie in the ordinary case and deliberately so: the cookie is written from an effect,
   * so a reader who presses «Upgrade» before that round trip lands, or who has JavaScript off,
   * would otherwise reach this screen at full price one click after seeing the discount.
   */
  searchParams: Promise<{ cycle?: string; coupon?: string; promo?: string }>
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  /* A session whose account no longer exists — see `requireAccount`. Silent for a visitor with
     no session at all, which is the middleware's case and not this one. */
  await requireAccount()

  const { plan } = await params
  if (!isCheckoutPlan(plan)) notFound()

  const { cycle, coupon: couponParam, promo: promoParam } = await searchParams
  const initialCycle: BillingPeriod = cycle === 'year' ? 'year' : 'month'

  /*
   * Resolved here rather than inside `CheckoutScreen`, for `Viewer`'s reason on /pricing: a
   * client component cannot answer before hydration, and the wrong answer it would give until
   * then is a full price on the one screen where the number is about to be charged.
   *
   * **This decides what the screen says and nothing about what it charges.** `mockPurchase`
   * re-reads the cookie and re-validates the campaign server-side — see its own comment — so a
   * reader who reaches this page with a stale or tampered `?coupon=` sees one price and is
   * charged the right one.
   */
  const jar = await cookies()
  const cookieCode = jar.get(COUPON_COOKIE)?.value ?? null
  const [campaign, lifetimeOnSale, user] = await Promise.all([
    activeCoupon({ coupon: couponParam, promo: promoParam, cookie: cookieCode }),
    loadLifetimeOnSale(),
    /*
     * Read for one thing only: whether there is an account for `CouponBar` to record a sighting
     * against. This screen needs no identity of its own — `mockPurchase` reads its own session
     * when it is pressed — and the question is asked here rather than inside the action so a
     * signed-out reader on a checkout costs no round trip, `/pricing`'s own reasoning.
     */
    currentUser(),
  ])

  /*
   * **Nothing is advertised here any more.** This screen used to read `advertisableCampaign()`
   * and show the overlay to a reader who was not already carrying a coupon. A campaign is now
   * shown only to whoever arrived with its link, which `CouponBar` already does from the
   * coupon resolved above — so there is nothing left for an overlay to say on a page whose
   * whole subject is a price this reader is about to pay.
   */

  /* Signed in, with a live campaign applied — the only case there is a row to write. */
  const note = user !== null && campaign !== null && campaign.status === 'active' ? campaign.code : undefined

  const coupon: CheckoutCoupon | null =
    campaign === null
      ? null
      : {
          code: campaign.code,
          percent: campaign.discountPercent,
          months: campaign.discountMonths,
          appliesToLifetime: campaign.appliesToLifetime,
        }

  return (
    <PrefsProvider songSlug={null}>
      <TopBar current="checkout" />

      <main className="mx-auto max-w-4xl px-4 pb-12 pt-3">
        {/*
          * The same bar as on /pricing, and the same component — `PaidCheckoutFields` prints
          * its price independently, so a coupon that stopped at /pricing would vanish exactly
          * here, at the point in the funnel where the basket is already full.
          *
          * `persist` is deliberately not passed: /pricing is where a URL coupon is written to
          * the cookie, and doing it here as well would mean two components racing to write the
          * same value on the one journey that passes through both.
          */}
        {/* The only coupon control here now: it used to be hidden while the overlay advertised
            an unclaimed offer, and nothing is advertised on this screen any more. */}
        <div className="mb-4">
          <CouponBar
            applied={campaign === null ? null : appliedCopy(campaign, lifetimeOnSale, formatPlanDate)}
            note={note}
          />
        </div>

        <CheckoutScreen plan={plan} initialCycle={initialCycle} coupon={coupon} />
        <Footer />

        {/* Last in the document, fixed to the foot of the viewport — see `/pricing`. The CTA
            points back at this same plan rather than at the price list: somebody who is already
            on a checkout has chosen, and sending them to compare again would undo that. */}
      </main>
    </PrefsProvider>
  )
}
