'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { IconBooks, IconBroadcast, IconCheck, IconPrint, IconReceipt } from '@/components/icons'
import { loadPurchaseSummary, loadThanksPreview, type MockSubscriptionState } from '@/lib/plans/checkout'
import { formatPlanDate, subscriptionStatusLine } from '@/lib/plans/subscriptionCopy'
import { PLAN_LABEL, PLANS, PLAN_VALUES, readPlan, thanksCapacitySentence, thanksDevicesCaption, thanksSongsCaption } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

type Status =
  | { state: 'loading' }
  | { state: 'unavailable'; reason: string }
  | { state: 'ready'; current: MockSubscriptionState }

/**
 * Where a purchase lands: what is now active, and the one thing worth doing next.
 *
 * Asked from the client on mount, like `BillingScreen` and `CheckoutScreen` beside it — the page
 * around this is a static shell that cannot know who is looking. Through
 * `loadPurchaseSummary`, deliberately, and not `loadCheckoutStatus`: see that function's own
 * comment on why a thank-you must not depend on the mock checkout still being switched on.
 *
 * **It reads the account's live plan rather than trusting a query parameter**, which is what
 * keeps it honest. There is nothing in the URL to forge, so the page cannot be made to
 * congratulate somebody for a plan they do not hold; and an account that really is on `free`
 * gets the plain "nothing bought yet" state below instead of a thank-you for nothing. The cost
 * of that choice, stated rather than hidden: opening this page again a month later still reads
 * as a thank-you, because "is on Premium" is the only question it asks. Pinning it to the
 * *moment* of purchase would mean reading `paddle_events` for a recent row, which is a lot of
 * machinery to stop a page from being warm twice.
 *
 * `?preview=<plan>` is the one exception, and it does not weaken the paragraph above: the query
 * param never becomes account data by itself, it only picks *which* fabricated plan
 * `loadThanksPreview` (`lib/plans/checkout.ts`) hands back, and that function re-checks
 * `isOwner` on the server before handing back anything at all — the same gate `/emails` sits
 * behind. Read with a plain `URLSearchParams(window.location.search)` rather than Next's
 * `useSearchParams()`, which would force this page into a Suspense boundary to stay statically
 * generated, for a query param this page's own real visitors never carry.
 */
export function ThanksScreen() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [previewPlan, setPreviewPlan] = useState<Plan | null>(null)

  const runPreview = (plan: Plan) => {
    setPreviewPlan(plan)
    setStatus({ state: 'loading' })
    void loadThanksPreview(plan).then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason: result.reason === 'no-session' ? 'Sign in to see this.' : 'Only a global owner can preview this page.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('preview')
    if (requested !== null) {
      runPreview(readPlan(requested))
      return
    }

    void loadPurchaseSummary().then((result) => {
      if (!result.ok) {
        setStatus({
          state: 'unavailable',
          reason:
            result.reason === 'no-session'
              ? 'Sign in to see this.'
              : 'No database is configured, so there is no plan to report.',
        })
        return
      }
      setStatus({ state: 'ready', current: result.current })
    })
    // Read once, on mount, from whatever URL this page happened to load with — the same rule
    // this effect followed before `?preview=` existed.
  }, [])

  /** The plan switcher, shown only once a `?preview=` has put this screen into preview mode. */
  const previewBar =
    previewPlan === null ? null : (
      <div className="segment mb-4 w-fit" role="tablist" aria-label="Preview plan">
        {PLAN_VALUES.map((plan) => (
          <button
            key={plan}
            type="button"
            role="tab"
            aria-selected={plan === previewPlan}
            className={plan === previewPlan ? 'segment-button is-on px-3' : 'segment-button px-3'}
            onClick={() => runPreview(plan)}
          >
            {PLAN_LABEL[plan]}
          </button>
        ))}
      </div>
    )

  if (status.state === 'loading') {
    return (
      <>
        {previewBar}
        <p className="mt-4 text-sm text-muted">One moment…</p>
      </>
    )
  }

  if (status.state === 'unavailable') {
    return (
      <>
        {previewBar}
        <p className="notice notice-error mt-4" role="alert">
          {status.reason}
        </p>
      </>
    )
  }

  const { current } = status

  /*
   * Nothing was bought — somebody typed the URL, or is looking at an account that never
   * purchased. Said plainly rather than dressed up as a thank-you: the whole reason this reads
   * the live plan is so that this branch exists. The hero and the three-step list below still
   * run: a reader on Free gets the same shape of page as one who just paid, only in the
   * neutral tint `.thanks-hero:not(.is-paid)` and `.thanks-step.is-upsell` draw, and worded as
   * what the paid plans would add rather than what just happened.
   */
  if (current.plan === 'free') {
    return (
      <>
        {previewBar}

        <div className="thanks-hero card">
          <div className="thanks-hero-inner">
            <span className="thanks-hero-icon">
              <IconReceipt size={26} />
            </span>
            <h1 className="thanks-hero-title">
              Still on Free.
              <br />
              Here&apos;s what&apos;s next.
            </h1>
            <p className="thanks-hero-text text-muted">
              {PLANS.free.songbooks} songbook, {PLANS.free.songs} songs, no card and no end date.
              Whenever you want more room, to sing together, or a printed booklet, the paid plans
              are right there.
            </p>
          </div>
        </div>

        <div className="thanks-timeline">
          <div className="thanks-step is-upsell">
            <div className="thanks-step-rail">
              <span className="thanks-step-icon">
                <IconBooks size={17} />
              </span>
              <span className="thanks-step-line" />
            </div>
            <div className="thanks-step-body">
              <p className="thanks-step-title">More songbooks &amp; songs</p>
              <p className="thanks-step-caption">More room from Standard up, no cap at all from Plus.</p>
            </div>
          </div>

          <div className="thanks-step is-upsell">
            <div className="thanks-step-rail">
              <span className="thanks-step-icon">
                <IconBroadcast size={17} />
              </span>
              <span className="thanks-step-line" />
            </div>
            <div className="thanks-step-body">
              <p className="thanks-step-title">&quot;Sing Together&quot; sessions</p>
              <p className="thanks-step-caption">Everyone on their own screen, on your line.</p>
            </div>
          </div>

          <div className="thanks-step is-upsell">
            <div className="thanks-step-rail">
              <span className="thanks-step-icon">
                <IconPrint size={17} />
              </span>
            </div>
            <div className="thanks-step-body">
              <p className="thanks-step-title">A printed booklet</p>
              <p className="thanks-step-caption">Cover, index, one song a page, ready to print.</p>
            </div>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/pricing" className="btn btn-primary">
            See the plans
          </Link>
          <Link href="/" className="btn">
            Continue with Free
          </Link>
        </div>
      </>
    )
  }

  /*
   * A paid plan that is no longer running. Its own branch because the celebratory version below
   * is actively wrong here, not merely stale: `loadPurchaseSummary` can return `plan: 'premium',
   * status: 'expired'` — the raw `plan` column never reverts on expiry — and the paid hero would
   * then read "You're in. Welcome to Premium." over a renewal date that has already gone by,
   * with "Payment received" underneath it.
   *
   * Checked on `status`, before the paid branch, rather than woven into that branch's own
   * sentences: the heading is the part that misleads first, so a page that only fixed the date
   * line would still congratulate somebody whose plan had lapsed. `subscriptionStatusLine` is
   * the same sentence `/billing` and `/checkout/[plan]` use for these states, which is the point
   * of it being shared — three screens describing a failing card three ways is what it replaced.
   */
  if (current.status !== 'active') {
    return (
      <>
        {previewBar}

        <div className="thanks-hero card">
          <div className="thanks-hero-inner">
            <span className="thanks-hero-icon">
              <IconReceipt size={26} />
            </span>
            <h1 className="thanks-hero-title">
              {current.status === 'grace' ? 'A payment needs attention.' : 'This plan has ended.'}
            </h1>
            <p className="thanks-hero-text text-muted">{subscriptionStatusLine(current)}</p>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/billing" className="btn btn-primary">
            Go to billing
          </Link>
          <Link href="/pricing" className="btn">
            See the plans
          </Link>
        </div>
      </>
    )
  }

  const plan = current.plan
  const label = PLAN_LABEL[plan]

  return (
    <>
      {previewBar}

      <div className="thanks-hero is-paid">
        <div className="thanks-hero-decor" aria-hidden />
        <div className="thanks-hero-inner">
          <span className="thanks-hero-icon">
            <IconCheck size={26} />
          </span>
          <h1 className="thanks-hero-title">
            You&apos;re in.
            <br />
            Welcome to {label}.
          </h1>
          <p className="thanks-hero-text">
            {current.expiresAt === null ? 'No renewal — this is yours for good' : `Renews ${formatPlanDate(current.expiresAt)}`}
            {' — '}
            {thanksCapacitySentence(plan)}
          </p>
        </div>
      </div>

      <div className="thanks-timeline is-paid">
        <div className="thanks-step is-done">
          <div className="thanks-step-rail">
            <span className="thanks-step-icon">
              <IconReceipt size={17} />
            </span>
            <span className="thanks-step-line" />
          </div>
          <div className="thanks-step-body">
            <p className="thanks-step-title">Payment received</p>
            <p className="thanks-step-caption">A confirmation is on its way to your inbox.</p>
          </div>
        </div>

        <div className="thanks-step is-included">
          <div className="thanks-step-rail">
            <span className="thanks-step-icon">
              <IconBooks size={17} />
            </span>
            <span className="thanks-step-line" />
          </div>
          <div className="thanks-step-body">
            <p className="thanks-step-title">Build your songbook</p>
            <p className="thanks-step-caption">{thanksSongsCaption(plan)}</p>
          </div>
        </div>

        <div className="thanks-step is-included">
          <div className="thanks-step-rail">
            <span className="thanks-step-icon">
              <IconBroadcast size={17} />
            </span>
          </div>
          <div className="thanks-step-body">
            <p className="thanks-step-title">Bring the whole room</p>
            <p className="thanks-step-caption">{thanksDevicesCaption(plan)}</p>
          </div>
        </div>
      </div>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
        <Link href="/" className="btn btn-primary">
          <IconBooks size={16} />
          Go to my songbooks
        </Link>
        <Link href="/billing" className="btn">
          <IconReceipt size={15} />
          Payment history
        </Link>
        <Link href="/help" className="btn">
          How the editor works
        </Link>
      </div>
      <p className="mt-4 text-center text-sm text-muted">A confirmation is on its way to your inbox.</p>
    </>
  )
}
