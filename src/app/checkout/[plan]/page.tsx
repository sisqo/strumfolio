import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { CouponBar } from '@/components/CouponBar'
import { PaddleCheckout } from '@/components/PaddleCheckout'
import { CouponMemory } from '@/components/CouponMemory'
import { Footer } from '@/components/Footer'
import { currentUser, requireAccount } from '@/lib/auth/session'
import { appliedCopy } from '@/lib/coupons/discount'
import { activeCoupon } from '@/lib/coupons/read'
import { COUPON_COOKIE, restorableCode } from '@/lib/coupons/types'
import { livePaddleSubscription, type LivePaddleSubscription } from '@/lib/plans/paddleAccount'
import { checkoutMode } from '@/lib/plans/planChange'
import { isCheckoutPlan, LIFETIME, PRICES } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'
import { paddleCheckoutEnabled } from '@/lib/plans/resolve'
import { changeNames, formatPlanDate, planWithCycle } from '@/lib/plans/subscriptionCopy'
import { PLAN_LABEL } from '@/lib/plans/types'
import { loadLifetimeOnSale } from '@/lib/settings/read'

export const metadata: Metadata = { title: 'Checkout' }

/** The answer when nobody asked — see the `Promise.all` below. */
const nothingLive = async (): Promise<LivePaddleSubscription> => ({ ok: false, reason: 'no-subscription' })

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
  /*
   * **Nullable on purpose.** `?cycle=` absent and `?cycle=month` are the same thing to a
   * first-time buyer and opposite things to somebody already on a yearly plan: the first asked
   * for nothing, the second asked for monthly. Flattening the two is what made «Switch to
   * Premium» open on Monthly for a yearly subscriber — see `PaddleCheckout`'s own note.
   */
  const requestedCycle: BillingPeriod | null = cycle === 'year' ? 'year' : cycle === 'month' ? 'month' : null

  /*
   * Resolved here rather than inside the client component, for `Viewer`'s reason on /pricing: a
   * client component cannot answer before hydration, and the wrong answer it would give until
   * then is a full price on the one screen where the number is about to be charged.
   *
   * **This decides what the screen says and nothing about what it charges.** The write path
   * re-reads the cookie and re-validates the campaign server-side — see its own comment — so a
   * reader who reaches this page with a stale or tampered `?coupon=` sees one price and is
   * charged the right one.
   */
  const jar = await cookies()
  const cookieCode = jar.get(COUPON_COOKIE)?.value ?? null
  const [campaign, lifetimeOnSale, user, live] = await Promise.all([
    activeCoupon({ coupon: couponParam, promo: promoParam, cookie: cookieCode }),
    loadLifetimeOnSale(),
    /*
     * Read for one thing only: whether there is an account for `CouponBar` to record a sighting
     * against. This screen needs no identity of its own — every write path reads its own session
     * when it is pressed — and the question is asked here rather than inside the action so a
     * signed-out reader on a checkout costs no round trip, `/pricing`'s own reasoning.
     */
    currentUser(),
    /*
     * What Paddle is billing this account for right now, which decides what the button on this
     * screen *is*. Without this branch an existing subscriber pressing «Pay» opened a *second*
     * checkout, and a second completed checkout is a second subscription: two plans billing
     * side by side on one account, with the webhook overwriting `paddle_subscription_id` so
     * only the newer of the two is ever cancellable from here. The mock could not do this — it
     * wrote columns and had nothing to leave running.
     *
     * Costs one Paddle call, and only where it can change what is drawn: not at all with the
     * mock branch rendering, and not for an account with no subscription id, which is every
     * reader making a first purchase — they pay one indexed read on a page that already makes
     * three. The branch sits here rather than inside the loader because the *action* must be
     * able to move a plan whether or not a client token exists: that token is for the browser
     * payment form, and a plan change never draws one.
     */
    paddleCheckoutEnabled() ? livePaddleSubscription() : nothingLive(),
  ])

  /* Buy, switch, or say nothing doing — `checkoutMode` holds the rule and the argument for it,
     pure and tested, because the version of it that is wrong charges somebody twice. */
  const mode = checkoutMode(live)

  /* What to call the plan they are on, built here because the component knows `PLAN_LABEL` but
     not how a cycle reads in a sentence. */
  const liveProps = live.ok
    ? {
        plan: live.plan,
        cycle: live.cycle,
        label: planWithCycle(live.plan, live.cycle),
        /* What is already arranged, said on the screen where a further move is being
           considered — case C6. `live.plan` above is the plan *paid for*, which while this is
           non-null is deliberately not the plan Paddle's items carry. */
        scheduled:
          live.pendingDowngrade === null
            ? null
            : `You are already moving to ${changeNames(live, live.pendingDowngrade).to} on ${formatPlanDate(live.pendingDowngrade.at)}.`,
      }
    : null

  /*
   * The third state, which is neither «buy» nor «switch»: something is running that this page
   * cannot safely act on. Leaving it to fall through to the buy button is the bug this whole
   * branch exists to close — a reader whose card is retrying would open a second subscription
   * beside the first, and both would bill. So the screen says what it knows and offers nothing.
   *
   * Written out per reason rather than as one apology, because the remedies differ: a held
   * subscription is the reader's own to sort out, and a shape we cannot read is ours.
   */
  const stalled: string | null =
    mode !== 'stalled' || live.ok
      ? null
      : live.reason === 'not-live'
        ? 'Your subscription is on hold at the moment — usually a payment that needs a fresh card. ' +
          'Sort that out first and this page will let you change plan again. We will not start a ' +
          'second subscription beside one that is still running.'
        : 'We cannot read the state of your subscription just now, so we are not going to sell you ' +
          'anything on top of it. Try again in a moment, and write to us if it persists.'

  /*
   * **Nothing is advertised here any more.** This screen used to read `advertisableCampaign()`
   * and show the overlay to a reader who was not already carrying a coupon. A campaign is now
   * shown only to whoever arrived with its link, which `CouponBar` already does from the
   * coupon resolved above — so there is nothing left for an overlay to say on a page whose
   * whole subject is a price this reader is about to pay.
   */

  /* Signed in, with a live campaign applied — the only case there is a row to write. */
  const note = user !== null && campaign !== null && campaign.status === 'active' ? campaign.code : undefined

  return (
    /*
     * The shell `/pricing` uses, rather than the app's — see this route's own `layout.tsx` for
     * why the bar above changed with it. Same 70rem and the same `sm:` gutter, so the step from
     * the price list to the checkout does not move the page under the reader.
     *
     * **The narrow gutter is 16px and not /pricing's 20**, which is the one deliberate
     * difference: Paddle's frame has a hard minimum width, and on a 320px phone those four
     * pixels a side are the difference between a page that fits and one that scrolls sideways.
     * Nobody can see the difference; the overflow, everybody could.
     */
    <main className="mx-auto w-full max-w-[70rem] px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
      {/*
        * **The page is 70rem and the checkout is not.** A payment form stretched to the width
        * of a four-column price table is a form nobody can read a line of; the column is the
        * width `/pricing` gives its own lede, and it is what the frame's `min-width` is measured
        * against on a phone.
        */}
      <div className="mx-auto w-full max-w-[34rem]">
        {/*
          * The same bar as on /pricing, and the same component — `PaidCheckoutFields` prints
          * its price independently, so a coupon that stopped at /pricing would vanish exactly
          * here, at the point in the funnel where the basket is already full.
          *
          * **`persist` is passed here too, and withholding it was a real gap rather than a
          * tidiness.** The reasoning used to be that /pricing is where a URL coupon becomes a
          * cookie, and writing it here as well would be two components racing over one value on
          * the journey through both. But the journey that matters is the one that *skips*
          * /pricing: a reader arriving straight on `/checkout/plus?coupon=X` — a typed link, a
          * bookmark, a link in a message — never got the cookie at all, so the bar above said a
          * discount applied while `redeemableCouponFor` (which reads the cookie and nothing else,
          * on purpose) saw nothing and let the sale through at the listino. That is the
          * shown-price/charged-price gap this directory exists to close, opened by the two halves
          * reading different sources.
          *
          * The race the old reasoning feared is benign — the same code, written idempotently —
          * and the button cannot be pressed before the write lands anyway: a first purchase waits
          * for Paddle.js and a change waits for its preview, each a round trip of its own.
          */}
        {/* The only coupon control here now: it used to be hidden while the overlay advertised
            an unclaimed offer, and nothing is advertised on this screen any more. */}
        <div className="mb-4">
          <CouponBar
            applied={campaign === null ? null : appliedCopy(campaign, lifetimeOnSale, formatPlanDate)}
            persist={campaign !== null && campaign.code !== cookieCode ? campaign.code : undefined}
            note={note}
          />
          {/*
            * `persist` is withheld above and this is not the same objection. That one is about
            * two components racing to write one cookie on the journey through /pricing; this
            * writes `localStorage`, idempotently, with a value /pricing would have written
            * identically — and a reader can arrive straight here from a bookmark, which is the
            * one point in the funnel where a forgotten offer costs the discount at the moment
            * of paying.
            */}
          <Suspense fallback={null}>
            <CouponMemory restorable={restorableCode(campaign)} />
          </Suspense>
        </div>

        {/*
          * **One way to sell.** There were two until the mock came out, and the reason there is
          * no fallback now is not tidiness: a checkout that cannot take money is not a lesser
          * checkout, it is a screen that asks somebody for a decision and then cannot honour it.
          * An environment without Paddle configured says so in a sentence instead.
          */}
        {!paddleCheckoutEnabled() ? (
          <p className="mt-6 text-lg">
            Plans are not on sale in this environment. Nothing here can take a payment, so there
            is nothing to fill in.
          </p>
        ) : (
          plan === 'lifetime' ? (
            /*
             * **Lifetime sells in every mode, `stalled` included**, and that is deliberate
             * rather than an oversight in the branch below. `stalled` exists to stop a *second
             * subscription* being opened beside one that may still be billing; Lifetime is not
             * a subscription at all but a one-time transaction, so the objection does not apply
             * to it. A reader whose card is failing on a monthly plan is, if anything, the one
             * most helped by buying their way out of it.
             *
             * It used to be a dead end for anybody with a subscription, because a Lifetime
             * billing beside a running subscription is the one outcome nobody wants. What
             * changed is not that judgement but where it is enforced: the webhook ends the
             * subscription once the Lifetime payment has actually arrived
             * (`endSubscriptionBoughtOut`), which is the only order in which a failed payment
             * cannot leave somebody with neither.
             */
            <>
              {live.ok && (
                <p className="mt-6 text-lg">
                  Lifetime replaces what you pay for now.{' '}
                  {live.periodEndsAt === null
                    ? `Your ${PLAN_LABEL[live.plan]} plan stops at the end of the period you have already paid for, and is never charged again.`
                    : `Your ${PLAN_LABEL[live.plan]} plan runs to ${formatPlanDate(live.periodEndsAt)} as paid for, then stops — it is never charged again.`}
                </p>
              )}
              <PaddleCheckout plan="lifetime" amount={LIFETIME.amount} />
            </>
          ) : stalled !== null ? (
            <p className="mt-6 text-lg">{stalled}</p>
          ) : (
            <PaddleCheckout
              plan={plan}
              initialCycle={requestedCycle}
              amounts={{ year: PRICES[plan].year.amount, month: PRICES[plan].month.amount }}
              live={liveProps}
            />
          )
        )}
      </div>

      <Footer />
    </main>
  )
}
