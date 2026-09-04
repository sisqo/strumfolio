'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { discountedAmount, durationCopy, firstYearCopy } from '@/lib/coupons/discount'
import { loadCheckoutStatus, loadMostRecentCycleFor, mockPurchase, type MockSubscriptionState } from '@/lib/plans/checkout'
import { euro, LIFETIME, periodEnd, PRICES, yearlyTotalOfMonthly } from '@/lib/plans/prices'
import type { BillingPeriod, CheckoutPlan, PaidPlan } from '@/lib/plans/prices'
import { formatPlanDate, subscriptionStatusLine } from '@/lib/plans/subscriptionCopy'
import { ACCEPTED_TEST_CARD, isAcceptedTestCard } from '@/lib/plans/testCard'
import { PLAN_LABEL, PLAN_RANK } from '@/lib/plans/types'
import type { Plan } from '@/lib/plans/types'

/**
 * Fake, and never sent anywhere past this component: a real card was never going to reach
 * this database, and `mockPurchase` takes no card fields at all. What the number typed here
 * decides is read entirely in `buy`, below, before `mockPurchase` is ever called — see
 * `isAcceptedTestCard`'s own comment. Prefilled with the number that succeeds, so trying the
 * flow needs no typing; typing over it is how a tester tries the decline path instead.
 */
/** The one `unavailable` reason a reader can actually do something about — see the JSX below. */
const SIGN_IN_REASON = 'Sign in to continue.'

/**
 * The `'disabled'` reason's own copy (`mockCheckoutEnabled()` off,
 * `PLAN-checkout-coming-soon.md`) — worded and styled apart from the other two
 * `unavailable` reasons in the JSX below: this one is not an error the reader caused,
 * it is the same "not on sale yet" fact `/pricing`'s own cards now show as a disabled
 * button, for whoever reaches this screen through an old or shared link instead.
 */
const COMING_SOON_REASON = "These plans aren't on sale yet — check back soon."

/** The only other cycle there is — used to flip, never to pick, so a third cycle one day
    cannot silently compile. */
const OTHER_CYCLE: Record<BillingPeriod, BillingPeriod> = { month: 'year', year: 'month' }

const FAKE_CARD = { name: '', number: ACCEPTED_TEST_CARD, expiry: '12 / 30', cvc: '123' }

type Status =
  | { state: 'loading' }
  /**
   * `kind` drives styling and the sign-in button below — carried alongside `reason` rather
   * than recovered from it, so a future copy edit to `COMING_SOON_REASON` or `SIGN_IN_REASON`
   * can't silently detach the message from the branch that decided it.
   */
  | { state: 'unavailable'; reason: string; kind: 'coming-soon' | 'sign-in' | 'error' }
  /** `live` is `liveSubscription`'s own answer, read server-side — see `loadCheckoutStatus`. */
  | { state: 'ready'; current: MockSubscriptionState; live: Plan | null }

/**
 * Whether pressing the button would **schedule** this change rather than apply it — the exact
 * branch `mockPurchase` takes on the server, asked here so the screen can say so beforehand.
 *
 * Mirrored deliberately rather than inferred loosely: a plan ranked below the live one is a
 * downgrade and waits for the period end, *unless* there is no `planExpiresAt` for it to wait
 * for, in which case the server applies it at once (see `nothingPaidThrough` there). Getting
 * this wrong in either direction is worse than not saying anything — it would promise a charge
 * that never happens, or promise a wait that never happens.
 */
function willSchedule(plan: CheckoutPlan, current: MockSubscriptionState, live: Plan | null): boolean {
  return live !== null && current.expiresAt !== null && PLAN_RANK[plan] < PLAN_RANK[live]
}

/**
 * The renewal date this purchase would write, when it lands **earlier** than the one already
 * paid for — otherwise null, and nothing is said.
 *
 * The trap this exists for is the one control that looks harmless: "Change billing cycle" on
 * `/pricing`. An account ten months into a yearly plan that re-buys it monthly is applied
 * immediately, like every equal-or-higher-ranked purchase, and `planExpiresAt` becomes one
 * month from today — ten months of paid time gone, with nothing on the screen having hinted at
 * it. Same arithmetic for an upgrade bought monthly over a long yearly period. The date is
 * computed with `periodEnd`, the same function the server writes with, so the sentence names
 * the day the row will actually hold.
 */
function earlierRenewal(
  plan: CheckoutPlan,
  cycle: BillingPeriod,
  current: MockSubscriptionState,
  live: Plan | null,
): Date | null {
  if (plan === 'lifetime' || live === null || current.expiresAt === null) return null
  if (willSchedule(plan, current, live)) return null

  const next = periodEnd(cycle, new Date())
  return next.getTime() < current.expiresAt.getTime() ? next : null
}

/**
 * The mock checkout's actual screen — see `lib/plans/checkout.ts`'s own header for what this
 * is standing in for and why it is open to anybody signed in. Everything that depends on who
 * is asking is asked from here, on mount, the same `/password` and `/accounts` already do:
 * the page around this is a static shell with no idea who is looking.
 *
 * Buying only — no cancel button lives here any more. Managing a plan already bought
 * (cancelling, undoing a scheduled change, the payment history) moved to `/billing`
 * (`BillingScreen`), the once place for both; this screen's own job is narrower than that
 * and stays narrow, with a link across for anyone who arrived here already holding a plan.
 */
/**
 * The campaign in force, resolved on the server by the page and handed down as a prop.
 *
 * A prop and not a read from here, for `Viewer`'s own reason on /pricing: a client component
 * cannot answer before hydration, and the wrong answer it would give until then is a full
 * price on the one screen where the number is about to be charged. It is also why this shape
 * is three plain fields rather than the `Campaign` row type — this file is `'use client'`, and
 * `lib/coupons/read.ts` imports `@/lib/db`.
 *
 * **Nothing here is trusted by the write.** `mockPurchase` re-reads the cookie server-side and
 * re-validates the campaign itself; these three fields decide what the screen *says*, never
 * what it charges. A tampered prop therefore shows a wrong price and buys at the right one.
 */
export interface CheckoutCoupon {
  code: string
  percent: string
  months: number | null
  appliesToLifetime: boolean
}

export function CheckoutScreen({
  plan,
  initialCycle = 'month',
  coupon = null,
}: {
  plan: CheckoutPlan
  /** Carried over from /pricing's own toggle by the page, so arriving from Monthly there
      does not land on Yearly here. The default matches both /pricing's own opening tab and
      the page's own fallback for a direct visit — three places that have to agree.
      Overridden below, once `refresh` resolves, for the one arrival this guess is wrong for:
      an existing customer re-buying the plan they already hold to change its cycle, where the
      *right* cycle is never this prop's guess but the ledger's own opposite of it. */
  initialCycle?: BillingPeriod
  /** The campaign this arrival carries, or `null`. See `CheckoutCoupon`. */
  coupon?: CheckoutCoupon | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>({ state: 'loading' })
  const [cycle, setCycle] = useState<BillingPeriod>(initialCycle)
  const [card, setCard] = useState(FAKE_CARD)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  /*
   * `useCallback`, not a plain function, since the override below started reading `plan` —
   * the one component-scope value this closure now depends on. Without it, every render made
   * a new `refresh` the mount effect had no way to declare a dependency on without either
   * re-running on every render (a plain function reference changes every time) or silencing
   * the lint rule that exists precisely to catch a stale-closure bug like that.
   */
  const refresh = useCallback(() => {
    /*
     * Both requests fire together, and both are awaited before either `status` or `cycle`
     * changes — never `loadCheckoutStatus` first and `loadMostRecentCycleFor` after, which
     * would show a "Pay" card already open on the URL's guessed cycle for a beat before
     * silently flipping to the ledger's answer underneath whoever is reading it.
     */
    void Promise.all([loadCheckoutStatus(), loadMostRecentCycleFor(plan)]).then(([result, mostRecentCycle]) => {
      if (!result.ok) {
        setStatus(
          result.reason === 'disabled'
            ? { state: 'unavailable', reason: COMING_SOON_REASON, kind: 'coming-soon' }
            : result.reason === 'no-session'
              ? { state: 'unavailable', reason: SIGN_IN_REASON, kind: 'sign-in' }
              : {
                  state: 'unavailable',
                  reason: 'No database is configured, so there is nothing to write to.',
                  kind: 'error',
                },
        )
        return
      }
      setStatus({ state: 'ready', current: result.current, live: result.live })
      /*
       * "Change billing cycle" on /pricing always means switch to the other one — but the
       * `?cycle=` this screen arrived with only carries whatever /pricing's own Monthly/Yearly
       * toggle happened to be showing, a price-comparison control with no idea what this
       * account is actually paying for. `mostRecentCycle` is read fresh from the ledger instead
       * (`loadMostRecentCycleFor`'s own comment), and only overrides the guess for a re-buy of
       * the plan already held — checked here, against `result.current.plan` from the *same*
       * mount rather than trusted from the URL, because an upgrade or downgrade to a different
       * plan has no current cycle of its own to flip and must keep whatever the toggle chose.
       * Left alone when the ledger has nothing to say (`mostRecentCycle === null`, a plan this
       * account never actually bought here): the toggle's guess is still the better of two
       * unknowns.
       */
      if (result.current.plan === plan && mostRecentCycle !== null) {
        setCycle(OTHER_CYCLE[mostRecentCycle])
      }
    })
  }, [plan])

  useEffect(() => {
    refresh()
  }, [refresh])

  /*
   * The three facts every sentence below is worded from, derived once. `ready` is the narrowed
   * status — the JSX cannot narrow a union inside a `&&`, and repeating `status.state ===
   * 'ready' && …` at each of the four places that need it is how two of them come to disagree.
   */
  /* Only when the campaign actually covers the Lifetime — `appliesToLifetime` is off by
     default, so no strike is the ordinary case. */
  const lifetimePrice =
    coupon !== null && coupon.appliesToLifetime ? discountedAmount(LIFETIME.amount, coupon.percent) : null

  const ready = status.state === 'ready' ? status : null
  const scheduling = ready !== null && willSchedule(plan, ready.current, ready.live)
  const movedRenewal = ready === null ? null : earlierRenewal(plan, cycle, ready.current, ready.live)
  /*
   * The day the scheduled change lands, when it is a day worth naming. A `grace` subscription
   * is live with a date virtually always already past (`liveSubscription` ignores dates there,
   * on purpose), so this is the one live plan whose own expiry must not be read out as a future
   * event — "moves to Standard on 3 May 2026" would be pointing at a day that has gone.
   */
  const scheduledFor =
    ready !== null && scheduling && ready.current.expiresAt !== null && ready.current.expiresAt.getTime() > Date.now()
      ? ready.current.expiresAt
      : null

  const buy = async () => {
    setBusy(true)
    setError(null)
    setDone(null)
    /* No card is asked for on a scheduled change, so none is checked: nothing is charged today
       — the write only records what this account becomes at the end of the period it has
       already paid for. */
    if (!scheduling && !isAcceptedTestCard(card.number)) {
      setError('Card declined. Try 4111 1111 1111 1111.')
      setBusy(false)
      return
    }
    try {
      const result = await mockPurchase(plan, cycle)
      if (!result.ok) {
        setError(
          result.reason === 'not-applicable'
            ? 'This account is already on Lifetime — there is nothing left to buy.'
            : "That didn't go through. Try again.",
        )
        return
      }
      /*
       * A purchase that took effect leaves this screen entirely, for `/thanks` — the plan is
       * bought, and what a musician needs next is a songbook to put songs in, not a receipt line
       * on the form they just submitted. `router.push`, so Back still returns here rather than
       * replaying the purchase.
       *
       * A *scheduled* change deliberately stays put and keeps the inline sentence: nothing has
       * happened to this account's plan yet, so a page thanking somebody for a purchase would be
       * both premature and, on a downgrade, the wrong sentiment.
       */
      if (result.effect === 'immediate') {
        router.push('/thanks')
        return
      }

      setDone(`Scheduled — this account moves to ${PLAN_LABEL[plan]} once the plan it already paid for ends.`)
      refresh()
    } catch {
      setError("That didn't go through. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="mb-[1.125rem]">
        <h1 className="screen-title">Checkout — {PLAN_LABEL[plan]}</h1>
        {/* Two sentences for two different acts: a payment that starts a plan, and a change
            that costs nothing today and takes effect at the end of a period already paid for.
            Saying "one payment sets up your plan" over the second was the whole trouble. */}
        <p className="mt-2 text-sm leading-[1.45] text-muted">
          {scheduling
            ? 'Nothing is charged today. This only records what this account moves to when the plan it already has runs out.'
            : 'One payment sets up your plan. You can change it or cancel any time from Billing.'}
        </p>
      </header>

      {status.state === 'loading' && <p className="mt-4 text-sm text-muted">One moment…</p>}

      {status.state === 'unavailable' && (
        <>
          {/* `notice-accent`/`role="status"` for "coming soon" — it is the same neutral fact
              /pricing's own cards now show, not an error the reader caused. The other two
              reasons (no session, no database) keep `notice-error`/`role="alert"`, unchanged. */}
          <p
            className={`notice mt-4 ${status.kind === 'coming-soon' ? 'notice-accent' : 'notice-error'}`}
            role={status.kind === 'coming-soon' ? 'status' : 'alert'}
          >
            {status.reason}
          </p>
          {/* «Sign in to continue.» used to be the whole of this screen, with nothing to press
              but «Back to plans» at the very bottom — not where anybody looks after being told
              to sign in. Worth knowing how a reader gets here, since it is *not* by opening the
              URL signed out: the middleware matches every route and redirects that visit to
              /login before this component renders. What reaches this branch is a session that
              ended while the screen was open — the tab left overnight, the ninety-day JWT
              expiring, an account removed — so the reader is looking at a checkout they were
              legitimately on. Only for this one reason: the other two ("checkout is off", "no
              database") are not things a reader can act on, and a button would imply they
              were. */}
          {status.kind === 'sign-in' && (
            <p className="mt-3">
              <Link href="/login" className="btn btn-primary btn-sm">
                Sign in
              </Link>
            </p>
          )}
        </>
      )}

      {status.state === 'ready' && (
        <>
          {/* `role="status"`, like the error below it (v3.13). This line is the *only* thing a
              scheduled change produces — the screen does not navigate away and nothing else on
              it moves — so leaving it unannounced meant a reader who cannot see it was told
              when a purchase failed and never when one was recorded. */}
          {done !== null && (
            <p className="notice mt-4" role="status">
              {done}
            </p>
          )}
          {error !== null && (
            <p className="notice notice-error mt-4" role="alert">
              {error}
            </p>
          )}

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">This account right now</h2>
            <p className="mt-1.5 text-sm text-muted">{subscriptionStatusLine(status.current, status.live)}</p>
            {status.current.plan !== 'free' && (
              <p className="mt-1.5 text-sm">
                <Link href="/billing" className="text-accent hover:underline">
                  Manage this plan, or see the payment history
                </Link>
              </p>
            )}
          </div>

          {/*
            * The two things this screen used to leave a reader to discover by pressing the
            * button. A downgrade is not a purchase: it charges nothing now, changes nothing
            * now, and takes effect on a date this can name — so it is said before the button,
            * not in the confirmation after it. And an immediate purchase whose new period ends
            * *sooner* than the one already paid for gives up the difference; that is a real
            * decision, and «Change billing cycle» on /pricing is one tap away from it.
            */}
          {scheduling && (
            <p className="notice notice-accent mt-4" role="status">
              {scheduledFor !== null
                ? `${PLAN_LABEL[status.current.plan]} stays in force until ${formatPlanDate(scheduledFor)}. This account moves to ${PLAN_LABEL[plan]} on that day, and nothing is charged today.`
                : `${PLAN_LABEL[status.current.plan]} stays in force until the period it has already been billed for ends. This account moves to ${PLAN_LABEL[plan]} then, and nothing is charged today.`}
            </p>
          )}

          {movedRenewal !== null && status.current.expiresAt !== null && (
            <p className="notice notice-accent mt-4" role="status">
              This account is already paid for until {formatPlanDate(status.current.expiresAt)}. Buying now replaces
              that period: the next renewal moves to {formatPlanDate(movedRenewal)}, and the time in between is not
              carried over.
            </p>
          )}

          <div className="card p-4 sm:p-5 mt-4">
            <h2 className="section-title">{scheduling ? 'What changes' : 'Pay'}</h2>

            {plan === 'lifetime' ? (
              <p className="mt-3 text-2xl font-medium">
                {/* Discounted only when the campaign actually covers the Lifetime —
                    `appliesToLifetime` is off by default, so the ordinary case is the plain
                    listino with no strike at all. */}
                {lifetimePrice !== null && (
                  <>
                    <span className="sr-only">Was </span>
                    <s className="mr-1.5 text-lg font-normal text-muted">{euro(LIFETIME.amount)}</s>
                    <span className="sr-only">, now </span>
                  </>
                )}
                {euro(lifetimePrice ?? LIFETIME.amount)}, once
              </p>
            ) : (
              <PaidCheckoutFields
                plan={plan}
                cycle={cycle}
                onCycle={setCycle}
                scheduling={scheduling}
                coupon={coupon}
              />
            )}

            {/* Absent entirely on a scheduled change: asking for a card, and declining a wrong
                one, for a change that takes no payment at all is theatre that misleads. */}
            {!scheduling && <FakeCardFields card={card} onCard={setCard} />}

            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              disabled={busy}
              onClick={() => void buy()}
            >
              {scheduling ? `Move to ${PLAN_LABEL[plan]} at the end of the period` : 'Complete purchase'}
            </button>

            {/*
              * The two sentences a consumer-law checkout has to carry at the button, not in a
              * footer link: that pressing it accepts the billing terms, and that access begins
              * now — the express request that lets the fourteen-day withdrawal period run
              * alongside use rather than before it (Terms §8, which is where the promise that
              * the refund is still the full amount lives). Absent on a scheduled change, which
              * charges nothing and starts nothing today.
              */}
            {!scheduling && (
              <p className="mt-3 text-xs leading-[1.5] text-muted">
                By completing the purchase you agree to the{' '}
                <Link href="/terms-of-service" className="text-accent hover:underline">
                  Terms of Service
                </Link>
                , including the billing and refund terms, and you ask for your plan to start right
                away. You still have 14 days to change your mind and get the full amount back.
              </p>
            )}
          </div>
        </>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/pricing" className="text-accent hover:underline">
          Back to plans
        </Link>
      </p>
    </>
  )
}

/**
 * The four card inputs — split out of the screen only so the one condition that hides them all
 * (`scheduling`) is one line at the call site rather than a wrapper around forty.
 *
 * Real controlled inputs rather than static text, so the flow feels like a checkout — but only
 * `number` is ever read, by `buy`, and only to decide accept or decline. Name, expiry and CVC
 * stay decorative, exactly as they always have.
 */
function FakeCardFields({
  card,
  onCard,
}: {
  card: typeof FAKE_CARD
  onCard: (value: typeof FAKE_CARD) => void
}) {
  return (
    <div className="mt-4 grid gap-2.5">
      <label className="flex flex-col gap-1">
        <span className="text-[0.84375rem] text-muted">Name on card</span>
        <input
          value={card.name}
          onChange={(event) => onCard({ ...card, name: event.target.value })}
          placeholder="As printed on the card"
          className="form-field"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[0.84375rem] text-muted">Card number</span>
        <input
          value={card.number}
          onChange={(event) => onCard({ ...card, number: event.target.value })}
          inputMode="numeric"
          className="form-field"
        />
      </label>
      <div className="flex gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[0.84375rem] text-muted">Expiry</span>
          <input
            value={card.expiry}
            onChange={(event) => onCard({ ...card, expiry: event.target.value })}
            className="form-field"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[0.84375rem] text-muted">CVC</span>
          <input
            value={card.cvc}
            onChange={(event) => onCard({ ...card, cvc: event.target.value })}
            inputMode="numeric"
            className="form-field"
          />
        </label>
      </div>
    </div>
  )
}

/** The billing-period toggle and the price under it — split out so `plan` narrows to `PaidPlan` here, off the `plan === 'lifetime'` branch at the one call site. */
function PaidCheckoutFields({
  plan,
  cycle,
  onCycle,
  scheduling,
  coupon,
}: {
  plan: PaidPlan
  cycle: BillingPeriod
  onCycle: (value: BillingPeriod) => void
  /** Whether this change is scheduled rather than bought now — the price is then what this
      account will be billed *from that date*, not an amount anybody is paying today. */
  scheduling: boolean
  /** The campaign in force, resolved on the server and handed down — see `CheckoutCoupon`. */
  coupon: CheckoutCoupon | null
}) {
  const price = PRICES[plan][cycle]
  const discounted = coupon === null ? null : discountedAmount(price.amount, coupon.percent)

  return (
    <>
      <div className="segment mt-3 w-fit" role="group" aria-label="Billing period">
        {(['year', 'month'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === cycle ? 'segment-button is-on px-4' : 'segment-button px-4'}
            aria-pressed={value === cycle}
            onClick={() => onCycle(value)}
          >
            {value === 'year' ? 'Yearly' : 'Monthly'}
          </button>
        ))}
      </div>

      <p className="mt-3 text-2xl font-medium">
        {/* The struck listino before the price charged, never after — the same order
            `.plan-price-was` on /pricing states, and the `sr-only` words are what tell a
            screen reader which of the two numbers is being taken. */}
        {discounted !== null && (
          <>
            <span className="sr-only">Was </span>
            <s className="mr-1.5 text-lg font-normal text-muted">{euro(price.amount)}</s>
            <span className="sr-only">, now </span>
          </>
        )}
        {euro(discounted ?? price.amount)} per {cycle}
      </p>
      {scheduling && <p className="mt-1 text-sm text-muted">Billed from the day this takes effect, not today.</p>}

      {/* What the discount costs and for how long — the disclosure this screen cannot do
          without, since it is the last thing read before the money moves. */}
      {discounted !== null && (
        <p className="mt-1 text-sm text-muted">
          {durationCopy(price.amount, discounted, coupon?.months ?? null, cycle)}
        </p>
      )}

      {cycle === 'month' && (
        <p className="mt-1 text-sm text-muted">
          {/*
            * With a coupon this has to be the *blended* first year, not twelve times the
            * discounted price: three months at €2.44 plus nine at €3.49 is €38.73, and €29.28
            * would be false one line under the sentence that says «then €3.49». Same rule
            * /pricing's own monthly card follows, through the same function — the two screens
            * must never disagree on the same number.
            */}
          {discounted === null
            ? `${yearlyTotalOfMonthly(price.amount)} over a year.`
            : (firstYearCopy(price.amount, discounted, coupon?.months ?? null) ??
              `${yearlyTotalOfMonthly(discounted)} over a year.`)}
        </p>
      )}
    </>
  )
}
