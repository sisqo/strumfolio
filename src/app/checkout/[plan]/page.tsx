import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { CouponBar } from '@/components/CouponBar'
import { IconArrowRight } from '@/components/icons'
import { PaddleCheckout } from '@/components/PaddleCheckout'
import { CouponMemory } from '@/components/CouponMemory'
import { Footer } from '@/components/Footer'
import { currentUser, requireAccount } from '@/lib/auth/session'
import { appliedCopy, discountedAmount } from '@/lib/coupons/discount'
import { discountIdFor } from '@/lib/coupons/paddleDiscount'
import { activeCoupon } from '@/lib/coupons/read'
import { couponCookieCode } from '@/lib/coupons/cookieValue'
import { COUPON_COOKIE, couponRefusedNotice, restorableCode } from '@/lib/coupons/types'
import { livePaddleSubscription, type LivePaddleSubscription } from '@/lib/plans/paddleAccount'
import { checkoutMode, purchaseRefusal } from '@/lib/plans/planChange'
import { couponRefusalFor } from '@/lib/plans/redeemable'
import { isCheckoutPlan, LIFETIME, periodEnd, PRICES } from '@/lib/plans/prices'
import type { BillingPeriod } from '@/lib/plans/prices'
import { holdsLifetime, paddleCheckoutEnabled } from '@/lib/plans/resolve'
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
  const cookieValue = jar.get(COUPON_COOKIE)?.value ?? null
  const cookieCode = couponCookieCode(cookieValue)
  const [campaign, lifetimeOnSale, user, live] = await Promise.all([
    activeCoupon({ coupon: couponParam, promo: promoParam, cookie: cookieValue }),
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

  /* Whether anything may be sold here at all — a Lifetime off sale, or a reader who already
     holds one, whatever plan this page is for. The same rule `startPaddleCheckout` applies at
     the press, asked here so the payment form is never drawn for a sale that will be refused. */
  const lifetimeRefused = purchaseRefusal(
    plan,
    lifetimeOnSale,
    user !== null && (await holdsLifetime(user.accountOwnerEmail)),
  )

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
  /*
   * Split into a badge, a lead and a body since `Checkout.dc.html`, which draws this as a card
   * rather than as a paragraph. The split is the mock's and the words are the ones that were
   * already here: what the state *is* leads, and what to do about it follows.
   */
  const stalled: { badge: string; lead: string; body: string } | null =
    mode !== 'stalled' || live.ok
      ? null
      : live.reason === 'not-live'
        ? {
            badge: 'On hold',
            lead: 'Your subscription is on hold at the moment — usually a payment that needs a fresh card.',
            body:
              'Sort that out first and this page will let you change plan again. We will not start a ' +
              'second subscription beside one that is still running.',
          }
        : {
            /* Not «On hold», which claims to know what is wrong. This branch is the one where we
               do not. */
            badge: 'Unavailable',
            lead:
              'We cannot read the state of your subscription just now, so we are not going to sell ' +
              'you anything on top of it.',
            body: 'Try again in a moment, and write to us if it persists.',
          }

  /*
   * **Nothing is advertised here any more.** This screen used to read `advertisableCampaign()`
   * and show the overlay to a reader who was not already carrying a coupon. A campaign is now
   * shown only to whoever arrived with its link, which `CouponBar` already does from the
   * coupon resolved above — so there is nothing left for an overlay to say on a page whose
   * whole subject is a price this reader is about to pay.
   */

  /* Signed in, with a live campaign applied — the only case there is a row to write. */
  const note = user !== null && campaign !== null && campaign.status === 'active' ? campaign.code : undefined

  /*
   * **The struck price is shown only where the discount would actually be charged**, and that
   * takes two questions, not one. This page used to ask a third of it.
   *
   * *Does the campaign reach this plan and cycle* — `discountIdFor`, below. A campaign with no
   * Paddle Discount behind it draws a ticket and is refused by `startPaddleCheckout`, so a price
   * card promising €2.44 there would promise a sale this page will not make. That much was
   * already right.
   *
   * *May this account still redeem it* — `couponRefusalFor`, which is `redeemability`: the
   * ceilings, the window, and whether this account has redeemed before. **That was missing, and
   * its absence was a money bug.** The reader who had already spent COUPON30 on a subscription
   * was shown the Lifetime at €139.99 while the transaction the server made carried
   * `discount_id: null` and `total: 19999` — sixty euro more than the screen promised, measured
   * 2026-09-15. The page's older comment above («this decides what the screen says and nothing
   * about what it charges») was written for a *tampered* `?coupon=`, where showing a discount
   * and not honouring it is the safe direction. «Already redeemed» arrives by the same door and
   * inverts it.
   *
   * Asked once for the whole render rather than per cycle: redeemability is about the account
   * and the plan, and cannot differ between the two cycles of one screen.
   */
  const refusal =
    campaign === null || user === null ? null : await couponRefusalFor(campaign, plan, user.accountOwnerEmail)

  /* What the campaign *reaches*, ignoring whether this reader may still have it — the question
     `appliedCopy` already answers in words on the bar, and the one that tells a spent coupon
     apart from a campaign that simply does not cover the Lifetime. */
  const covers = (forCycle: BillingPeriod | null): boolean =>
    campaign !== null && discountIdFor(campaign, plan, forCycle) !== null

  const coversThisPlan = plan === 'lifetime' ? covers(null) : covers('month') || covers('year')

  const chargeable = (forCycle: BillingPeriod | null): boolean => covers(forCycle) && refusal === null

  const reduced = (full: string, forCycle: BillingPeriod | null): string | null =>
    campaign !== null && chargeable(forCycle) ? discountedAmount(full, campaign.discountPercent) : null

  /* Why the price above is not the one they came for. `null` where there is nothing to say —
     see `couponRefusedNotice`, which holds both silent cases and the reason for each. */
  const refused = couponRefusedNotice(refusal, coversThisPlan)

  /*
   * The day a purchase made now would first renew, one per cycle — computed here rather than in
   * the browser. `periodEnd` reads the clock, and a clock read during render is a hydration
   * mismatch waiting for the one reader whose midnight falls between the server's render and
   * their own. Both cycles, because the toggle is client-side and must not need a round trip to
   * restate a date.
   */
  const now = new Date()
  const renewsOn: Record<BillingPeriod, string> = {
    year: formatPlanDate(periodEnd('year', now)),
    month: formatPlanDate(periodEnd('month', now)),
  }

  /* The bar, built here and *placed* by `PaddleCheckout` — `Checkout.dc.html` puts it under the
     price card, where it reads as an input to the figure above it rather than as a third
     unrelated white box stacked over the payment frame.

     Which is exactly why it is told what plan it stands beside: under one card the ticket is
     read as a claim about that price, and the duration sentences are about a subscription. See
     `appliedCopy`'s own comment. */
  const couponBar = (
    <CouponBar
      /* No ticket where the coupon will not be honoured: «COUPON30 is on this price» over a
         price it is not on is the contradiction this whole change exists to remove. The bar
         falls back to its «Have a code?» field, which is the useful thing to offer somebody
         whose own code is spent. */
      applied={
        campaign === null || refused !== null
          ? null
          : appliedCopy(campaign, lifetimeOnSale, formatPlanDate, plan === 'lifetime' ? 'lifetime' : null)
      }
      refused={refused ?? undefined}
      persist={campaign !== null && campaign.code !== cookieCode ? campaign.code : undefined}
      note={note}
    />
  )

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
          * **The bar has moved below the price card, and `PaddleCheckout` is what places it.**
          * It used to open the screen. `Checkout.dc.html` puts it under the figure it changes,
          * where it reads as an input to that number rather than as the first of three white
          * boxes stacked over a payment frame — and it is drawn only where a coupon can do
          * anything, which is a first purchase: `changePaddlePlan` refuses a discount, so a code
          * field over a plan change is a control whose press cannot be honoured.
          *
          * **`persist` is passed here, and withholding it was a real gap rather than a
          * tidiness.** The reasoning used to be that /pricing is where a URL coupon becomes a
          * cookie, and writing it here as well would be two components racing over one value on
          * the journey through both. But the journey that matters is the one that *skips*
          * /pricing: a reader arriving straight on `/checkout/plus?coupon=X` — a typed link, a
          * bookmark, a link in a message — never got the cookie at all, so the bar said a
          * discount applied while `redeemableCouponFor` (which reads the cookie and nothing else,
          * on purpose) saw nothing and let the sale through at the listino. That is the
          * shown-price/charged-price gap this directory exists to close, opened by the two halves
          * reading different sources.
          *
          * The race the old reasoning feared is benign — the same code, written idempotently —
          * and the button cannot be pressed before the write lands anyway: a first purchase waits
          * for Paddle.js and a change waits for its preview, each a round trip of its own.
          */}
        {/*
          * `CouponMemory` stays on the page rather than travelling with the bar: it draws
          * nothing, writes `localStorage`, and must run on every one of this screen's states —
          * including the two that render no checkout at all. A reader who lands on a held
          * subscription still arrived with an offer worth remembering.
          */}
        <Suspense fallback={null}>
          <CouponMemory restorable={restorableCode(campaign)} />
        </Suspense>

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
          lifetimeRefused !== null ? (
            <div className="mt-6">
              <div className="card p-[1.375rem]" role="status">
                <span className={`state-badge ${lifetimeRefused === 'already-lifetime' ? 'state-badge-ok' : 'state-badge-alert'}`}>
                  {lifetimeRefused === 'already-lifetime' ? 'Yours already' : 'Not on sale'}
                </span>
                <p className="section-title mt-3">
                  {lifetimeRefused === 'already-lifetime'
                    ? 'You already have Lifetime, so there is nothing left to buy.'
                    : 'Lifetime is not on sale at the moment.'}
                </p>
                <p className="mt-2 text-sm leading-[1.5] text-muted">Nothing on this page will charge you.</p>
              </div>
              <Link href={lifetimeRefused === 'already-lifetime' ? '/billing' : '/pricing'} className="btn btn-primary mt-4 w-full">
                {lifetimeRefused === 'already-lifetime' ? 'Go to Plan & billing' : 'See the other plans'}
                <IconArrowRight size={17} />
              </Link>
            </div>
          ) : plan === 'lifetime' ? (
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
              <PaddleCheckout
                plan="lifetime"
                amount={LIFETIME.amount}
                discounted={reduced(LIFETIME.amount, null)}
                coupon={couponBar}
              />
            </>
          ) : stalled !== null ? (
            /*
             * A card with a badge rather than a paragraph, per `Checkout.dc.html` — and a way
             * on underneath it. The old version said what was wrong and then left the reader on
             * a page with nothing on it; Billing is where a held subscription is actually
             * sorted out, so it is the one link worth offering.
             */
            <div className="mt-6">
              <div className="card p-[1.375rem]" role="status">
                <span className="state-badge state-badge-alert">{stalled.badge}</span>
                <p className="section-title mt-3">{stalled.lead}</p>
                <p className="mt-2 text-sm leading-[1.5] text-muted">{stalled.body}</p>
              </div>
              <Link href="/billing" className="btn btn-primary mt-4 w-full">
                Go to Plan &amp; billing
                <IconArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <PaddleCheckout
              plan={plan}
              initialCycle={requestedCycle}
              amounts={{ year: PRICES[plan].year.amount, month: PRICES[plan].month.amount }}
              discounted={{ year: reduced(PRICES[plan].year.amount, 'year'), month: reduced(PRICES[plan].month.amount, 'month') }}
              renewsOn={renewsOn}
              live={liveProps}
              coupon={couponBar}
            />
          )
        )}
      </div>

      <Footer />
    </main>
  )
}
