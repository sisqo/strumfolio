'use client'

/**
 * The real checkout: a cycle to pick, and a button that opens Paddle's overlay on a
 * transaction the server made.
 *
 * **It never names a price.** The browser picks a *cycle*; `startPaddleCheckout` decides which
 * price that cycle is sold at, stamps the account on the transaction and hands back only its
 * id — so everything this component can ask Paddle to open is something the server already
 * agreed to sell, and a tampered value can at worst name the other plan we publish anyway.
 * That is the rule `startPaddleCheckout` states about coupons, kept rather than traded away for the
 * shorter client-side form where the page passes `items: [{ priceId }]`.
 *
 * **The props are a union rather than one shape with optional fields**, because Lifetime has
 * no cycle and pretending otherwise is how it ends up sold with one. `prices.ts` keeps
 * `LIFETIME` out of `PRICES` for the same reason; this mirrors that split instead of flattening
 * it back.
 *
 * `initializePaddle` is called once and guarded on `Initialized`: the SDK warns and refuses a
 * second call, and React in development mounts every effect twice.
 *
 * Nothing here provisions anything. The overlay closing is not a payment, and a reader who
 * closes the tab mid-redirect has still paid — `api/paddle/webhook` is what grants the plan,
 * which is why this says «we are finishing up» rather than «you now have Premium».
 */

import { initializePaddle, type Environments, type Paddle } from '@paddle/paddle-js'
import { useEffect, useRef, useState } from 'react'

import { startPaddleCheckout, type PaddleCheckoutFailure } from '@/lib/plans/paddleCheckout'
import { changeCostLine, scheduledChangeLine, type ChangeCost } from '@/lib/plans/changePreview'
import type { ChangeWhen } from '@/lib/plans/planChange'
import {
  changePaddlePlan,
  previewPaddlePlanChange,
  type PaddlePlanChangeFailure,
} from '@/lib/plans/paddlePlanChange'
import { euro, yearlyTotalOfMonthly, type BillingPeriod, type PaidPlan } from '@/lib/plans/prices'
import { formatPlanDate } from '@/lib/plans/subscriptionCopy'
import { PLAN_LABEL, type Plan } from '@/lib/plans/types'

/**
 * What each refusal is called to a reader. `coupon-unsupported` is the only one that describes
 * a decision rather than a fault, and it says so plainly instead of blaming the reader's
 * coupon: the discount is real and this path cannot honour it yet, so the honest thing is to
 * ask them to wait rather than to sell them the plan at full price.
 */
const REFUSALS: Record<PaddleCheckoutFailure, string> = {
  'not-configured': 'Payments are not switched on here yet.',
  'no-database': 'We could not reach your account. Please try again in a moment.',
  'no-session': 'Please sign in again to continue.',
  'invalid-plan': 'That plan does not exist.',
  'no-price': 'This plan is not on sale in this environment.',
  'coupon-unsupported':
    'Your discount cannot be applied at checkout yet, and we will not charge you full price ' +
    'while it stands. Please come back shortly.',
  failed: 'Something went wrong starting your checkout. Please try again.',
}

/**
 * The same for a plan *change*, which fails in places a first purchase cannot. `same` and
 * `lifetime-target` are the two worth reading closely: neither is a fault, and both would
 * otherwise reach the reader as «something went wrong» for a button the screen offered them.
 */
const CHANGE_REFUSALS: Record<PaddlePlanChangeFailure, string> = {
  'not-configured': REFUSALS['not-configured'],
  'no-database': REFUSALS['no-database'],
  'no-session': REFUSALS['no-session'],
  'invalid-plan': REFUSALS['invalid-plan'],
  'no-price': REFUSALS['no-price'],
  'coupon-unsupported': REFUSALS['coupon-unsupported'],
  'no-subscription': 'There is no subscription on this account to move.',
  gone: 'Your subscription has already ended. Reload the page and this plan is yours to buy.',
  'not-live': 'Your subscription is not active at the moment, so it cannot be moved from here.',
  'unexpected-items':
    'Your subscription carries more than one item, which this page will not rewrite. ' +
    'Please write to us and we will move it for you.',
  same: 'That is the plan you are already on, so there is nothing to change.',
  /*
   * Not a fault, and not a dead end either: the line above this one names what is scheduled and
   * when, so this only has to say what to do about it. The two-step exists because the price
   * cannot be quoted honestly while the items are already on the cheaper plan — see
   * `planChange.ts` — and a reader is owed the real figure more than they are owed one press.
   */
  'pending-downgrade':
    'Your plan is already set to change at the end of the period you have paid for. Call that ' +
    'off in Billing first and this move can be priced against the plan you actually hold.',
  'lifetime-target':
    'Lifetime is bought once and cannot replace a running subscription. Cancel your plan ' +
    'first, and buy Lifetime when it has ended.',
  'lifetime-live': 'You already have Lifetime, so there is nothing left to change.',
  unreadable: 'We could not read what your subscription is on. Please try again in a moment.',
  failed: 'Something went wrong changing your plan. Please try again.',
}

type Props =
  | {
      plan: PaidPlan
      /**
       * The cycle the *link* asked for, or `null` when it asked for none. Nullable rather than
       * defaulted, because the two cases have opposite right answers for a subscriber: every
       * CTA on /pricing carries `?cycle=`, and one of them exists precisely to switch cycle, so
       * an explicit value is an instruction and must win. A bare link — typed, bookmarked, sent
       * in a message — asked for nothing, and collapsing that to `month` is what turned «Switch
       * to Premium» into a silent year→month downgrade.
       */
      initialCycle: BillingPeriod | null
      /**
       * Both cycles, so the toggle needs no second round trip — and **unformatted**, exactly as
       * `PRICES` stores them. `euro()` is applied here rather than by the page, because this
       * also has to do arithmetic on the monthly figure for the comparison below, and a string
       * that already carries a currency symbol cannot be added up.
       */
      amounts: Record<BillingPeriod, string>
      /**
       * What Paddle is billing this account for right now, or `null` when it is billing nothing
       * — which changes what the button *is*. A second checkout on a live subscription would
       * create a second subscription and bill both, so an existing subscriber moves plan through
       * `changePaddlePlan` instead. The page resolves this from Paddle rather than from
       * `paddle_subscription_id`, which survives a cancellation and would strand a returning
       * customer on a button that refuses.
       *
       * `label` is what to call the plan they are on, already formatted: this component knows
       * `PLAN_LABEL` but not what a cycle is called in a sentence. `scheduled` is the same for a
       * change already arranged — case C6, the transparency one: a reader whose Paddle items
       * have already moved down must be told so wherever a plan is discussed, or the button
       * refusing to price a further move reads as a fault instead of as a consequence.
       */
      live: { plan: Plan; cycle: BillingPeriod | null; label: string; scheduled: string | null } | null
    }
  | { plan: 'lifetime'; amount: string }


export function PaddleCheckout(props: Props) {
  const paddle = useRef<Paddle | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /**
   * What this change will cost and when it lands, straight from Paddle — `null` while it is
   * being asked for or when it could not be read. **Never defaulted to a number**: the one
   * thing worse than no price under the button is a wrong one.
   *
   * One piece of state and not three, because the amount, the day and whether there is a day
   * are one answer to one question: split up, a stale date could sit under a fresh figure for
   * the width of a round trip.
   */
  const [preview, setPreview] = useState<{
    cost: ChangeCost
    when: ChangeWhen
    effectiveAt: string | null
  } | null>(null)
  /**
   * Why there is no price, when there is none. The preview refuses in exactly the places the
   * write refuses, so this turns every one of those refusals into something said **before** the
   * press rather than after it — «that is the plan you are already on» most of all, which is no
   * fault at all and read as one until this existed.
   */
  const [noPrice, setNoPrice] = useState<PaddlePlanChangeFailure | null>(null)
  const [pricing, setPricing] = useState(false)

  /* Lifetime never reaches the change path, so it never carries a live subscription here —
     narrowed once, above the effects that depend on it. */
  const live = props.plan === 'lifetime' ? null : props.live
  /*
   * **What the link asked for, then what Paddle is billing, then monthly** — and the middle
   * step is the one that was missing. A bare link carries no cycle, so this used to open on
   * Monthly for everybody; for a premium/year subscriber that put «Switch to Premium» on
   * Monthly, and pressing it is a year→month move, which restarts the billing period and
   * trades the rest of their year for a credit. Legitimate when chosen, not when defaulted
   * into. An *explicit* `?cycle=` still wins, because /pricing carries one on every CTA and
   * one of those links exists to change the cycle. A ledger lookup is what the mock
   * had for this; the answer here is better, being what Paddle bills rather than what was last
   * bought.
   */
  const [cycle, setCycle] = useState<BillingPeriod>(
    props.plan === 'lifetime'
      ? 'year'
      : (props.initialCycle ?? props.live?.cycle ?? 'month'),
  )

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!token || paddle.current?.Initialized) return

    initializePaddle({
      token,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox') as Environments,
      eventCallback: (event) => {
        /* `checkout.completed` means Paddle took the money, not that the plan is granted —
           the webhook does that, and it may land a second or two later. */
        if (event.name === 'checkout.completed') {
          setMessage('Payment received — we are finishing up. Your plan will appear in a moment.')
        }
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
        setMessage(REFUSALS.failed)
      })
  }, [])

  /*
   * Ask Paddle what the selected change costs, every time the selection changes.
   *
   * **One round trip per toggle, and it is worth it**: the alternative is computing the
   * proration here from `PRICES` and a period end, which is a second implementation of
   * arithmetic Paddle is going to redo its own way at the moment of the press — the classic
   * two-copies-of-one-rule this repository argues against everywhere else. `previewUpdate`
   * takes the identical body as the write, so the number shown is the number charged.
   *
   * `stale` guards the race: toggling Yearly then Monthly quickly can land the two answers out
   * of order, and the older one would sit under the button describing the other cycle.
   */
  useEffect(() => {
    if (live === null) {
      setPreview(null)
      setNoPrice(null)
      return
    }

    let stale = false
    setPricing(true)
    setPreview(null)
    setNoPrice(null)

    void previewPaddlePlanChange(props.plan, cycle).then((result) => {
      if (stale) return
      setPreview(result.ok ? { cost: result.cost, when: result.when, effectiveAt: result.effectiveAt } : null)
      setNoPrice(result.ok ? null : result.reason)
      setPricing(false)
    })

    return () => {
      stale = true
    }
  }, [live, props.plan, cycle])

  async function buy() {
    setBusy(true)
    setMessage(null)

    /* Null for Lifetime, which is bought once — the action refuses the mismatch either way. */
    const result = await startPaddleCheckout(props.plan, props.plan === 'lifetime' ? null : cycle)

    if (!result.ok) {
      setMessage(REFUSALS[result.reason])
      setBusy(false)
      return
    }

    paddle.current?.Checkout.open({ transactionId: result.transactionId })
    setBusy(false)
  }

  /**
   * The other half of the button, for an account that already pays. No overlay opens: Paddle
   * has the card on file, so a change of plan is a server call and a sentence — see
   * `planChange.ts` for which changes take effect at once and which wait for the period the
   * reader has already paid for to run out.
   *
   * The plan itself appears once `subscription.updated` reaches the webhook, the same second or
   * two `checkout.completed` already warns about above, so this says what was arranged rather
   * than claiming the account already shows it.
   */
  async function change() {
    if (props.plan === 'lifetime') return

    setBusy(true)
    setMessage(null)

    const result = await changePaddlePlan(props.plan, cycle)

    setMessage(result.ok ? arranged(result) : CHANGE_REFUSALS[result.reason])
    setBusy(false)
  }

  /**
   * What just happened, in the reader's terms — four outcomes, and only two of them move money.
   *
   * The `period-end` one is the sentence this whole case exists for: nothing was charged, the
   * plan they have is theirs until a named day, and the cheaper one starts then. Saying
   * «moving you to Standard» over that would be false on the day it is read.
   */
  function arranged(result: Extract<Awaited<ReturnType<typeof changePaddlePlan>>, { ok: true }>): string {
    const target = props.plan === 'lifetime' ? '' : PLAN_LABEL[props.plan]

    if (result.direction === 'revert') {
      return `Kept — you stay on ${target}, and the change that was arranged has been called off.`
    }

    if (result.when === 'period-end' && result.effectiveAt !== null && live !== null) {
      return (
        `Arranged. Nothing has been charged: you keep ${PLAN_LABEL[live.plan]} until ` +
        `${formatPlanDate(new Date(result.effectiveAt))}, and move to ${target} that day.`
      )
    }

    return result.direction === 'upgrade'
      ? `Moving you to ${target}. What you have not used of your old plan comes off the charge, ` +
        'and the new plan appears in a moment.'
      : `Moving you to ${target}. The difference is credited against your next invoice, and the ` +
        'new plan appears in a moment.'
  }


  const amount = props.plan === 'lifetime' ? props.amount : props.amounts[cycle]

  return (
    <div className="mt-6">
      {/* `segment` / `segment-button is-on`, the control /pricing's own toggle uses for this
          exact choice — the classes already exist and carry the theme, so this is not the
          place to invent a second look for one switch. Yearly first, the side /pricing opens
          on. */}
      {props.plan !== 'lifetime' && (
        <div className="segment w-fit" role="group" aria-label="Billing period">
          {(['year', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCycle(option)}
              aria-pressed={cycle === option}
              className={option === cycle ? 'segment-button is-on px-4' : 'segment-button px-4'}
            >
              {option === 'year' ? 'Yearly' : 'Monthly'}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-lg">
        {PLAN_LABEL[props.plan]} — {euro(amount)}
        {props.plan === 'lifetime' ? ' once' : cycle === 'year' ? ' a year' : ' a month'}
      </p>

      {/* The comparison /pricing makes rather than a claim about savings: the reader puts the
          two numbers side by side themselves, which they do correctly and faster than they
          read a sentence about it. */}
      {props.plan !== 'lifetime' && cycle === 'month' && (
        <p className="mt-1 text-sm opacity-80">
          {yearlyTotalOfMonthly(props.amounts.month)} a year, against {euro(props.amounts.year)}{' '}
          paid yearly.
        </p>
      )}

      {/* `ready` gates the overlay and nothing else: a plan change never opens one, so waiting
          for Paddle.js to load before allowing it would disable a working button for the sake
          of a script it does not use. */}
      <button
        type="button"
        className="btn btn-primary mt-4 w-full"
        onClick={() => void (live ? change() : buy())}
        /*
         * **A change is not offered until its price is known**, and that is a safety rule rather
         * than a nicety: pressing this takes a real amount off a real card, there is no
         * confirmation step behind it, and «we could not work out what this costs» is not a state
         * to let somebody press through. A first purchase is different — the overlay shows the
         * price itself before anything is taken — which is why only the change path waits.
         */
        disabled={busy || (live ? pricing || preview === null : !ready)}
      >
        {busy
          ? 'One moment…'
          : live
            ? `Switch to ${PLAN_LABEL[props.plan]}`
            : `Pay for ${PLAN_LABEL[props.plan]}`}
      </button>

      {/*
        * Said before the press, not after it — and said as a **number**, because that is what a
        * reader will look for on their statement. The sentence this replaced described the kind
        * of thing that would happen («a bigger plan is charged now, less whatever you have not
        * used») and named no amount, which left the one press on this screen that moves money as
        * the only one nobody could check beforehand.
        *
        * `cost` is null while Paddle is being asked, and also when the answer could not be read.
        * Those are deliberately the same case here: neither is a licence to print a figure.
        */}
      {live !== null && (
        <p className="mt-2 text-sm opacity-80">
          You are on {live.label} today.{' '}
          {live.scheduled !== null && `${live.scheduled} `}
          {pricing
            ? 'Working out what this change costs…'
            : preview !== null
              ? /* A change that waits for the period to end costs nothing today, which is true
                   and half the story: the reader is deciding about a date as much as about a
                   figure, so the date is said in the same breath. */
                preview.when === 'period-end' && preview.effectiveAt !== null
                ? scheduledChangeLine(
                    PLAN_LABEL[live.plan],
                    PLAN_LABEL[props.plan],
                    formatPlanDate(new Date(preview.effectiveAt)),
                  )
                : changeCostLine(preview.cost)
              : noPrice !== null
                ? CHANGE_REFUSALS[noPrice]
                : 'We could not work out what this change costs just now, so we are not going to ' +
                  'move it. Try again in a moment.'}
        </p>
      )}

      {message !== null && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
