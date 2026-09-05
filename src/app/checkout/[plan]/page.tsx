import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'

import { CheckoutScreen } from '@/components/CheckoutScreen'
import type { CheckoutCoupon } from '@/components/CheckoutScreen'
import { CouponBar } from '@/components/CouponBar'
import { CouponOverlay } from '@/components/CouponOverlay'
import { Footer } from '@/components/Footer'
import { PrefsProvider } from '@/components/PrefsProvider'
import { TopBar } from '@/components/TopBar'
import { appliedCopy, deadlineCopy, offerCopy } from '@/lib/coupons/discount'
import { activeCoupon, advertisableCampaign } from '@/lib/coupons/read'
import { COUPON_COOKIE, OFFER_COLLAPSED_COOKIE } from '@/lib/coupons/types'
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
  const offerCollapsed = jar.get(OFFER_COLLAPSED_COOKIE)?.value === '1'
  const [campaign, lifetimeOnSale, advertisable] = await Promise.all([
    activeCoupon({ coupon: couponParam, promo: promoParam, cookie: cookieCode }),
    loadLifetimeOnSale(),
    advertisableCampaign(),
  ])

  /*
   * The offer to advertise, or nothing when one is already applied — the same single line
   * `/pricing` uses, so the two pages cannot disagree about whether the overlay and the bar may
   * coexist. On this page the overlay matters more than on any other: a reader who reached a
   * checkout without claiming a live offer is one click from paying full price for something
   * that is on sale.
   */
  const offer = campaign === null ? advertisable : null
  const offerWords = offer === null ? null : offerCopy(offer.discountPercent, offer.discountMonths)

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

      <main className="mx-auto max-w-3xl px-4 pb-12 pt-3">
        {/*
          * The same bar as on /pricing, and the same component — `PaidCheckoutFields` prints
          * its price independently, so a coupon that stopped at /pricing would vanish exactly
          * here, at the point in the funnel where the basket is already full.
          *
          * `persist` is deliberately not passed: /pricing is where a URL coupon is written to
          * the cookie, and doing it here as well would mean two components racing to write the
          * same value on the one journey that passes through both.
          */}
        {/* Hidden exactly when the overlay is showing — see `offer`, and `/pricing`'s own
            comment on why the page must never carry two coupon controls at once. */}
        {offer === null && (
          <div className="mb-4">
            <CouponBar applied={campaign === null ? null : appliedCopy(campaign, lifetimeOnSale, formatPlanDate)} />
          </div>
        )}

        <CheckoutScreen plan={plan} initialCycle={initialCycle} coupon={coupon} />
        <Footer />

        {/* Last in the document, fixed to the foot of the viewport — see `/pricing`. The CTA
            points back at this same plan rather than at the price list: somebody who is already
            on a checkout has chosen, and sending them to compare again would undo that. */}
        {offer !== null && offerWords !== null && (
          <CouponOverlay
            code={offer.code}
            percent={offerWords.percent}
            duration={offerWords.duration}
            headline={offerWords.headline}
            deadline={deadlineCopy(offer.expiresAt, new Date())}
            href={`/checkout/${plan}?cycle=${initialCycle}&coupon=${encodeURIComponent(offer.code)}`}
            initiallyCollapsed={offerCollapsed}
          />
        )}
      </main>
    </PrefsProvider>
  )
}
