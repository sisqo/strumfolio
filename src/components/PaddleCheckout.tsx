'use client'

/**
 * The real checkout: a cycle to pick, and a button that draws Paddle's own payment form
 * **inside this page** on a transaction the server made.
 *
 * **Inline rather than the overlay, chosen rather than inherited.** `Checkout.open()` with no
 * settings gets Paddle's default, which is a modal — that is what shipped first, and nothing
 * anywhere argued for it. What the frame buys is that paying stops being something that happens
 * *over* the app and becomes a step of it: the plan, the price and the payment form are one
 * column the reader scrolls, on the surface and in the theme they were already reading. It also
 * takes away the page underneath, which is where the double-press this component grew a `paid`
 * state for came from.
 *
 * What it costs is stated where it is paid: the frame has to be in the DOM before
 * `Checkout.open` runs — hence `openTransaction` and its effect rather than opening straight
 * from the click — it has a minimum width, and its footer carries Paddle's «merchant of record»
 * line, which must stay visible for compliance and is why no height of ours is ever imposed on
 * it.
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
 * Nothing here provisions anything. Closing the frame is not a payment, and a reader who
 * closes the tab mid-payment has still paid — `api/paddle/webhook` is what grants the plan,
 * which is why this says «we are finishing up» rather than «you now have Premium».
 */

import { initializePaddle, type CheckoutSettings, type Environments, type Paddle } from '@paddle/paddle-js'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'

import Link from 'next/link'

import { IconCheck } from '@/components/icons'
import { PlanChangeConfirm } from '@/components/PlanChangeConfirm'
import { startPaddleCheckout, type PaddleCheckoutFailure } from '@/lib/plans/paddleCheckout'
import { changeStops, changeSummary, type NextCharge } from '@/lib/plans/changeSummary'
import {
  arrangedLines,
  callOffLine,
  changeCostLine,
  changeReason,
  scheduledChangeLine,
  type ArrangedLines,
  type ChangeCost,
} from '@/lib/plans/changePreview'
import type { ChangeDirection, ChangeWhen } from '@/lib/plans/planChange'
import {
  changePaddlePlan,
  previewPaddlePlanChange,
  type PaddlePlanChangeFailure,
} from '@/lib/plans/paddlePlanChange'
import { euro, type BillingPeriod, type PaidPlan } from '@/lib/plans/prices'
import { changeNames, formatPlanDate } from '@/lib/plans/subscriptionCopy'
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
  /*
   * Not a fault and not a dead end, so it says what to do rather than apologising: the reader
   * has a plan already and the thing they want is a change, which is a different screen and one
   * press away. Named without a direction, the same discipline `already-scheduled` follows.
   */
  'already-subscribed':
    'You already have a subscription running, so this would start a second one beside it. ' +
    'Change the plan you have from Billing instead.',
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
   * **Not `same`, and the difference is the reader's own position.** They are still on the plan
   * they paid for; this is where they are going. Said as «you are already on this» — which is
   * what folding it into `same` does — it reads as a plan already taken away, on the checkout of
   * the very plan they are leaving for. The line above names the day.
   */
  'already-scheduled': 'You are already set to move to this plan, on the day shown above.',
  /*
   * Not a fault, and not a dead end either: the line above this one names what is scheduled and
   * when, so this only has to say what to do about it. The two-step exists because the price
   * cannot be quoted honestly while the items have already moved — see `planChange.ts` — and a
   * reader is owed the real figure more than they are owed one press.
   *
   * **The sentence names no direction, and must not start to.** Since B7 an arranged change can
   * be a rise in tier as easily as a drop, so «call off your downgrade» would be false for the
   * reader who arranged an upgrade — the `already-scheduled` mistake again, one screen along.
   */
  'pending-downgrade':
    'Your plan is already set to change at the end of the period you have paid for. Call that ' +
    'off in Billing first and this move can be priced against the plan you actually hold.',
  /* Not reachable from this screen any more — Lifetime is bought, never switched to, so the
     lifetime checkout draws the buy button instead of the change one. Kept because the action
     is callable on its own, and reworded because the old sentence told the reader to cancel
     first, which is now both unnecessary and worse than what the page does for them. */
  'lifetime-target':
    'Lifetime is bought rather than switched to. Open the Lifetime page and buy it there — ' +
    'your current plan is ended for you once it goes through.',
  'lifetime-live': 'You already have Lifetime, so there is nothing left to change.',
  unreadable: 'We could not read what your subscription is on. Please try again in a moment.',
  failed: 'Something went wrong changing your plan. Please try again.',
}

/**
 * The class Paddle renders its frame into. One string shared by the setting and the `div`,
 * because they are two halves of one contract: rename one and the checkout opens into nothing,
 * with no error anywhere.
 */
const FRAME_TARGET = 'paddle-checkout-frame'

/**
 * How the payment form should look, read at the moment it is opened rather than once at mount.
 *
 * **The form is pinned to `light`, and it is the app's own theme that gives way.** Paddle's
 * branded inline checkout — every colour of it, set in the dashboard — has **one** palette for
 * both of its themes, and the moment any branding exists it stops giving the labels their dark
 * one (measured 2026-09-15; `CLAUDE.md` carries the whole of it). So a form that follows the
 * reader's theme is a form whose labels are unreadable for half of them. Pinned, every value in
 * that dashboard is chosen against one known background and is right by construction.
 *
 * **What this costs is visible and was chosen knowingly**: in the dark theme the payment form is
 * a light panel inside a dark page. The card below it is painted white for exactly that reason —
 * `frameStyle` keeps the frame transparent, so the ground is ours to set, and it can no longer
 * be `--surface`, which is `#181b21` in the dark theme and would put Paddle's black label text
 * on a near-black panel. That is worse than the mismatch, not better.
 *
 * It also retires a defect rather than trading one for another: the frame used to be re-opened
 * whenever the theme changed, because `updateCheckout` cannot restyle one — and re-opening threw
 * away a half-typed card number. A form that never changes theme never needs that.
 *
 * `one-page` because the default, `multi-page`, collects the details and then the card on two
 * screens, and an embedded frame changing height between them moves the page under the reader's
 * thumb.
 *
 * **`locale` is pinned to `en`, reversing what this comment used to argue.** It said Paddle should
 * follow the browser, so that «a reader whose phone is in Italian gets the payment form in
 * Italian, which is better than pinning it to the language this app happens to be written in».
 * That reasoning treats the form as a thing a reader arrives at on its own. It is not: it is a
 * frame inside our own page, under our own «Premium €9.99 a month» and above our own «Pay for
 * Premium», in an app with no language selector and no translation anywhere. So the form did not
 * meet a reader in their language — it put Italian labels and «2,44 €» inside an English screen
 * that had just written «€2.44» three lines above, which is two ways of writing one number on one
 * card. Paddle's own guidance points the same way: pass the locale «so that it matches», meant for
 * a site *with* a language selector, and this one's selector is the absence of one.
 *
 * **It reaches further than the frame, which is the part worth knowing before anybody reverses it
 * again.** `startPaddleCheckout` creates the transaction with items, a discount and `customData`
 * and **no customer** — Paddle makes that record itself, from the email typed into this frame, and
 * `customers.locale` is what it then sends receipts and invoice PDFs in. Measured 2026-09-17: all
 * seven sandbox customers carry `locale: "it"`, taken from the browser, so the invoices were
 * Italian too. Since this app never sends a customer, this setting is the only thing upstream of
 * that field. **The frame is documented; the email is inference** — read a customer back after the
 * next purchase and confirm `locale: "en"` before treating it as settled.
 *
 * `frameStyle` carries no height: Paddle grows the frame as the form does, and a height of ours
 * is exactly what would clip the «merchant of record» footer it is required to show.
 */
function checkoutSettings(): CheckoutSettings {
  return {
    theme: 'light',
    locale: 'en',
    displayMode: 'inline',
    variant: 'one-page',
    frameTarget: FRAME_TARGET,
    frameInitialHeight: 450,
    /* 286px is Paddle's floor with checkout padding off, 312px with it on. The page's own gutter
       leaves 343px at 375px of viewport, so the narrowest phone anybody reads this on clears
       both — but the number lives here rather than in a stylesheet because it is Paddle's
       requirement and not our layout's. */
    frameStyle: 'width: 100%; min-width: 286px; background-color: transparent; border: none;',
    /*
     * **Paddle's own discount field is off, and that is a correctness fix rather than tidiness.**
     * The coupon on this page is `CouponBar`, above the frame, and it is the only door wired to
     * `coupon_views`, `coupon_redemptions` and every campaign ceiling. A code typed into Paddle's
     * «Add discount» instead would produce a discounted charge with **no redemption row**, so
     * `times_used` would stay zero and `usage_limit` would quietly stop being a limit —
     * `coupons/CLAUDE.md` says the insert has to come back «in the same commit that lets a coupon
     * be sold», and this is the second path that could hand one out without passing through it.
     * So the setting goes in now and stays after Paddle Discounts exist, not only while they do
     * not.
     *
     * It also removes a field that would mostly fail: the only discounts this account has are
     * created with `enabled_for_checkout: false`, so Paddle generates no code for them and there
     * is nothing anybody could type there that would work.
     */
    showAddDiscounts: false,
    /*
     * **And the discount already applied cannot be taken off.** `allowDiscountRemoval` defaults
     * to `true`, which would let a reader remove the `dsc_…` the server attached to the
     * transaction — leaving the bar directly above the frame still saying the code is on these
     * prices while the frame charged the listino. The same shown-price/charged-price gap
     * `startPaddleCheckout` refuses a sale over, arriving by the one route the server cannot
     * see: the discount is decided here, on the server, from a cookie the page never gets to
     * argue with, and it stays decided.
     */
    allowDiscountRemoval: false,
  }
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
      /**
       * The discounted figure per cycle, or `null` where this cycle would not actually be sold
       * at one — which is a stricter test than «a coupon is applied».
       *
       * **The struck price is the one place this redesign could lie.** A redeemable campaign
       * with no Paddle Discount behind it draws a ticket on the bar below and is *refused* by
       * `startPaddleCheckout`, so a card promising €2.44 there would promise a sale this screen
       * will not make — the shown-price/charged-price gap, arriving by the front door. The page
       * asks `discountIdFor` per cycle and hands the answer in already decided.
       */
      discounted: Record<BillingPeriod, string | null>
      /**
       * The day a purchase made now first renews, per cycle, already formatted.
       *
       * Computed on the server because `periodEnd` reads the clock, and a clock read during
       * render is a hydration mismatch waiting for the reader whose midnight falls between the
       * two. Both cycles, so the toggle restates it without a round trip.
       */
      renewsOn: Record<BillingPeriod, string>
      /** The coupon bar, built by the page and *placed* here — see this file's own note. */
      coupon?: ReactNode
    }
  | { plan: 'lifetime'; amount: string; discounted: string | null; coupon?: ReactNode }

export function PaddleCheckout(props: Props) {
  const paddle = useRef<Paddle | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  /**
   * Whether Paddle has taken the money on this screen already.
   *
   * **It was the whole defence against buying twice while this was an overlay**, where `busy`
   * went false the moment the modal opened and a reader who had just paid was left looking at a
   * live «Pay for Premium» underneath it. Inline removes that by construction — the button and
   * the payment form are never both on the page — so what is left for this to do is take away
   * «Not now», which under a completed payment would read as a way to undo it.
   *
   * Kept as a state of its own rather than folded into `openTransaction`, because the two
   * answer different questions: one is «is there a form open», the other «has money moved», and
   * the second is the one no press of ours may contradict. The window the server-side guard
   * cannot close — `wouldBeSecondSubscription` reads a column the webhook has not written yet —
   * is closed on this screen either way.
   */
  const [paid, setPaid] = useState(false)
  /**
   * The transaction whose payment form is on the page, or `null` when none is.
   *
   * **It exists because an inline checkout cannot be opened from the click.** Paddle renders
   * into an element found by class name, so that element has to be in the DOM *before*
   * `Checkout.open` runs — and the click is what decides to draw it. So the press stores the id,
   * React paints the frame, and the effect below opens into it. Opening straight from the
   * handler works with the overlay and silently does nothing here.
   */
  const [openTransaction, setOpenTransaction] = useState<string | null>(null)
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
    direction: ChangeDirection
    when: ChangeWhen
    effectiveAt: string | null
    nextCharge: NextCharge | null
  } | null>(null)
  /**
   * Whether the confirmation dialog is open. A plain boolean and not the summary itself: the
   * summary is derived from `preview` below, so holding a copy here would let the dialog go on
   * showing a figure the page had already replaced.
   */
  const [confirming, setConfirming] = useState(false)
  /**
   * Whether a change has already gone through on this screen.
   *
   * **Without it the screen contradicts itself the moment it succeeds.** The preview re-reads
   * after the write, Paddle now answers what the reader just asked for, and the summary turns
   * into «that is the plan you are already on» — or, after a downgrade, «you are already set to
   * move to this plan» — sitting *above* the sentence that says the change was made, with a
   * button underneath that can no longer do anything. Watched on the preview, 2026-09-14: it
   * reads as a refusal of the thing that just worked.
   *
   * So a settled screen shows the outcome and the way on, and nothing else. The sentence is the
   * action's own answer, which is the rule this file already follows about never letting the
   * quotation speak for what happened.
   */
  const [settled, setSettled] = useState(false)
  /**
   * What the settled card says, in the two parts `Checkout.dc.html` sets it in. Held rather than
   * derived, for `settled`'s own reason: the preview re-reads after the write and by the time
   * this is on screen it answers about a change that has already happened.
   */
  const [arranged, setArranged] = useState<ArrangedLines | null>(null)
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
   *
   * **A constant and no longer state**, since the Yearly/Monthly switch left this screen: the
   * cycle is decided before the page is asked for and nothing here can change it afterwards.
   * That makes the fallback chain above the whole of the decision rather than its opening
   * position, which is why it is worth more than it looks — the footnote under the price says
   * which one was picked («Billed monthly · renews …»), and that sentence is now the only
   * correction a reader gets. Somebody who wanted the other cycle goes back to /pricing, where
   * the choice belongs.
   */
  const cycle: BillingPeriod =
    props.plan === 'lifetime' ? 'year' : (props.initialCycle ?? props.live?.cycle ?? 'month')

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!token || paddle.current?.Initialized) return

    initializePaddle({
      token,
      environment: (process.env.NEXT_PUBLIC_PADDLE_ENV ?? 'sandbox') as Environments,
      /* Passed here *and* at `open()`: the frame settings are documented as belonging to
         initialisation, and the theme is re-read at the press so a reader who changed it while
         the page was open does not get the other one. */
      checkout: { settings: checkoutSettings() },
      eventCallback: (event) => {
        /* `checkout.completed` means Paddle took the money, not that the plan is granted —
           the webhook does that, and it may land a second or two later. */
        if (event.name === 'checkout.completed') {
          setPaid(true)
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
    /* The cycle toggle moved, so whatever the dialog was asking about is no longer what the
       page is offering. Closing it beats letting it stand over a fresh quotation. */
    setConfirming(false)

    void previewPaddlePlanChange(props.plan, cycle).then((result) => {
      if (stale) return
      setPreview(
        result.ok
          ? {
              cost: result.cost,
              direction: result.direction,
              when: result.when,
              effectiveAt: result.effectiveAt,
              nextCharge: result.nextCharge,
            }
          : null,
      )
      setNoPrice(result.ok ? null : result.reason)
      setPricing(false)
    })

    return () => {
      stale = true
    }
  }, [live, props.plan, cycle])

  /**
   * Make a transaction and put its payment form on the page.
   *
   * Takes the cycle rather than closing over it. It was written that way for the Yearly/Monthly
   * switch, which called this in the same tick as its own `setCycle` — where the state still
   * held the old value. The switch is gone and the parameter stays: it costs nothing, and a
   * function that is handed what it charges for is the safer shape for the one call in this
   * file that makes a transaction.
   */
  async function buy(forCycle: BillingPeriod = cycle) {
    setBusy(true)
    setMessage(null)

    /* Null for Lifetime, which is bought once — the action refuses the mismatch either way. */
    const result = await startPaddleCheckout(props.plan, props.plan === 'lifetime' ? null : forCycle)

    if (!result.ok) {
      setMessage(REFUSALS[result.reason])
      setBusy(false)
      return
    }

    /* Not opened here — see `openTransaction`. The frame has to exist first. */
    setOpenTransaction(result.transactionId)
    setBusy(false)
  }

  /**
   * Draw the payment form, once the element it renders into is on the page.
   *
   * Guarded on `ready` as well as on the id, because a reader can press before Paddle.js has
   * finished loading — the button waits for `ready`, but the two states are independent and an
   * `open()` against an uninitialised SDK is a silent no-op rather than an error.
   */
  /**
   * **Opened once per transaction, and no longer re-opened when the theme changes.**
   *
   * It used to be: `updateCheckout` takes items, a discount and customer data and no settings, so
   * the only way to restyle a drawn frame was to open it again — and a reader who switched theme
   * mid-payment otherwise sat in a light form inside a dark card. Re-opening threw away whatever
   * they had typed, which was the price of fixing it.
   *
   * With the form pinned to `light` (see `checkoutSettings`) there is no mismatch left to chase,
   * so that whole trade is gone: the guard is the transaction id alone, and a half-typed card
   * number survives a change of theme.
   */
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (openTransaction === null || !ready) return
    /* **Never after the money has moved.** Paddle's own «thank you» state lives in the frame,
       and re-opening a paid transaction would replace it with a form for a payment that has
       already happened — the one redraw that could make somebody think they had to pay twice. */
    if (paid) return
    if (opened.current === openTransaction) return
    opened.current = openTransaction
    paddle.current?.Checkout.open({ transactionId: openTransaction, settings: checkoutSettings() })
  }, [openTransaction, ready, paid])

  /**
   * **The cycle was chosen on /pricing, so this screen does not ask again.**
   *
   * Every CTA there carries `?cycle=`, and Lifetime has no cycle to carry — so in both cases the
   * reader arriving here has already decided everything this page could ask, and a «Pay» button
   * in front of the payment form is a step that collects no information. The form is the page.
   *
   * **A bare link is the case that must still ask.** `initialCycle` is `null` when nothing was
   * requested — a typed URL, a bookmark, a link in a message — and guessing a cycle there is the
   * defect `/checkout/[plan]` already documents at length: it silently offered year→month moves
   * to people who never asked for one. No cycle asked for, no form opened.
   *
   * Once per mount, and never again after «Not now» — otherwise backing out would reopen the
   * thing being backed out of. A refusal (`already-subscribed`, a coupon in play) leaves
   * `openTransaction` null, so the button and the message appear exactly as they would have.
   */
  const chosenAlready = live === null && (props.plan === 'lifetime' || props.initialCycle !== null)
  const autoOpened = useRef(false)
  useEffect(() => {
    if (!ready || !chosenAlready || autoOpened.current) return
    autoOpened.current = true
    void buy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, chosenAlready])

  /**
   * Back out of a payment form that is open.
   *
   * **The overlay had a cross and the frame has nothing**, so without this a reader who opened
   * the checkout to look at it is stuck with it until they reload — on the one screen where
   * being stuck reads as «this is going to charge me». The transaction stays where it is,
   * unpaid and harmless: Paddle bills nothing for a transaction nobody completes, and the next
   * press simply makes another.
   */
  function backOut() {
    paddle.current?.Checkout.close()
    opened.current = null
    setOpenTransaction(null)
    setMessage(null)
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

    /*
     * **The sentence comes from the write, never from what the dialog said.** `changePaddlePlan`
     * decides again server-side at the moment of the press, so a change that lands differently
     * from the quotation — a preview gone stale while the reader was reading, a renewal that
     * fell due in between — reports what actually happened rather than what was promised.
     */
    if (result.ok) {
      setArranged(arrangedFor(result))
      setMessage(null)
    } else {
      setMessage(CHANGE_REFUSALS[result.reason])
    }
    setSettled(result.ok)
    setConfirming(false)
    setBusy(false)
  }

  /**
   * What just happened, in the reader's terms — handed straight to `arrangedLines`, which owns
   * the four outcomes and the argument for each.
   *
   * **The labels are built here and the sentences are not**, which is this file's standing
   * division: it knows `PLAN_LABEL` and `changeNames` and nothing about what a credit means.
   * `credited` is read from the preview this screen has just quoted, so the promise under the
   * button and the message after the press cannot describe the same press differently.
   */
  function arrangedFor(
    result: Extract<Awaited<ReturnType<typeof changePaddlePlan>>, { ok: true }>,
  ): ArrangedLines {
    const target = props.plan === 'lifetime' ? '' : PLAN_LABEL[props.plan]

    return arrangedLines({
      direction: result.direction,
      when: result.when,
      on: result.effectiveAt === null ? null : formatPlanDate(new Date(result.effectiveAt)),
      credited: preview?.cost.credited ?? false,
      target,
      keep: live?.label ?? target,
      names: live === null ? { from: '', to: target } : changeNames(live, { plan: props.plan, cycle }),
    })
  }

  /**
   * The change as a handful of labelled facts, built once and rendered in two places — under
   * the button and inside the dialog — so the two can never describe the press differently.
   *
   * `null` whenever there is nothing to summarise: no live subscription, no price yet, or a
   * refusal. The button is disabled in exactly those cases, so the dialog can never open onto
   * an empty summary.
   */
  const summary =
    live === null || preview === null || props.plan === 'lifetime'
      ? null
      : changeSummary({
          from: live,
          to: { plan: props.plan, cycle },
          direction: preview.direction,
          when: preview.when,
          effectiveAt: preview.effectiveAt,
          cost: preview.cost,
          nextCharge: preview.nextCharge,
          arranged: live.scheduled,
          /* The three sentences this screen may say, chosen exactly as they were before the
             summary existed — each owns its own argument for its wording, and none of them is
             rewritten here. */
          headline:
            preview.direction === 'revert'
              ? callOffLine(live.label)
              : preview.when === 'period-end' && preview.effectiveAt !== null
                ? scheduledChangeLine(
                    changeNames(live, { plan: props.plan, cycle }).from,
                    changeNames(live, { plan: props.plan, cycle }).to,
                    formatPlanDate(new Date(preview.effectiveAt)),
                  )
                : changeCostLine(preview.cost),
        })

  const amount = props.plan === 'lifetime' ? props.amount : props.amounts[cycle]

  /**
   * Whether this screen still has a billing cycle to ask about — which it usually does not.
   *
   * **The choice belongs to /pricing, and it is made there.** Every CTA on that page carries
   * `?cycle=`, and «Change billing cycle» is a link whose whole purpose is to name the other
   * one; so by the time somebody is here the decision exists, and repeating it as a control is
   * asking a settled question in front of a payment form. The price line below states what is
   * being charged, which is what a reader at this point needs — a statement, not a switch.
   *
   * **What the link asked for is the test, not what the page ended up using.** A bare URL —
   * typed, bookmarked, sent in a message — carries no cycle, and *that* is the one case where
   * nothing has been chosen and the question is real. It is also the case `/checkout/[plan]`
   * already treats apart, and for a sharper reason than tidiness: a subscriber reaching a bare
   * link falls back to the cycle they are already billed on, and with no control on the screen
   * they would have no way to ask for the other.
   */

  /*
   * **A screen that has done its job shows the outcome and nothing else.** Everything below is
   * about deciding; once the change is made there is nothing left to decide here, and leaving
   * the summary up turns it into a refusal of what just happened — see `settled`.
   */
  if (settled && arranged !== null) {
    return (
      <div className="mt-6">
        {/* A card with a badge, per `Checkout.dc.html`, where this was a paragraph and a small
            link. The plan leads and the money follows — the two parts `arrangedLines` builds. */}
        <div className="card p-[1.375rem]" role="status">
          <span className="state-badge state-badge-ok">
            <IconCheck size={12} />
            Arranged
          </span>
          <p className="section-title mt-3">{arranged.lead}</p>
          <p className="mt-2 text-sm leading-[1.5] text-muted">{arranged.body}</p>
        </div>
        <Link href="/billing" className="btn btn-primary mt-4 w-full">
          See your plan
        </Link>
      </div>
    )
  }

  /*
   * The same preview as `summary`, read along the calendar instead of as a list — the shape
   * `Checkout.dc.html` puts on the page, with the list kept for the dialog. Null in exactly the
   * states `summary` is null in, so the card falls back to the same sentence.
   */
  const stops =
    live === null || preview === null || props.plan === 'lifetime'
      ? null
      : changeStops({
          from: { plan: PLAN_LABEL[live.plan], label: live.label },
          to: PLAN_LABEL[props.plan],
          direction: preview.direction,
          when: preview.when,
          effectiveAt: preview.effectiveAt,
          cost: preview.cost,
          nextCharge: preview.nextCharge,
          /* The sentence without the figure: the stop hangs that number beside it already. */
          reason: changeReason(preview.cost),
        })

  /* What is charged, and what the listino said — the second only where a discount would really
     be applied, which the page decided with `discountIdFor`. */
  const reduced = props.plan === 'lifetime' ? props.discounted : props.discounted[cycle]
  const cycleWord = props.plan === 'lifetime' ? 'once' : cycle === 'year' ? 'a year' : 'a month'

  const footNote =
    props.plan === 'lifetime'
      ? 'A single payment. Tax included, in euro.'
      : `Billed ${cycle === 'year' ? 'yearly' : 'monthly'} · renews ${props.renewsOn[cycle]} · ` +
        'cancel any time. Tax included, in euro.'

  return (
    <div className="mt-6">
      {/*
        * **The price card**, which is what this screen used to say in one line of body text.
        * `Checkout.dc.html` gives the figure the size of the screen's own title, because it is
        * the fact being decided — and sets the plan beside it rather than above, so the two are
        * read as one statement.
        */}
      <div className="card">
        <div className="p-[1.375rem]">
          <p className="card-eyebrow">{live === null ? 'Your plan' : 'Your change'}</p>

          {live === null ? (
            <>
              {/* Wraps for `.change-stop-head`'s reason: a struck listino, a price and a cycle
                  word beside a 30px plan name is wider than a phone's gutter leaves. */}
              <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="screen-title">{PLAN_LABEL[props.plan]}</span>
                <span className="flex items-baseline gap-1.5 tabular-nums">
                  {/* The listino, struck — drawn only where the discount is one this screen
                      would really charge. See the `discounted` prop. */}
                  {reduced !== null && <span className="price-was">{euro(amount)}</span>}
                  <span className="screen-title">{euro(reduced ?? amount)}</span>
                  <span className="text-[0.9375rem] font-normal leading-[1.1] text-muted">{cycleWord}</span>
                </span>
              </div>

              <p className="mt-3.5 border-t border-line-soft pt-3.5 text-[0.8125rem] leading-[1.45] text-muted">
                {footNote}
              </p>
            </>
          ) : stops !== null ? (
            <>
              {/*
                * **Everything the press does, before the press** — read along the calendar. The
                * rail is two dots because the order of the stops is the meaning: the filled one
                * is now, the hollow one is later, and a plain list of two dated rows would not
                * say which way round they run. `aria-hidden` because it is exactly that — a
                * drawing of an order the two dates already state.
                */}
              <div className="change-stops mt-3.5">
                <span className="change-rail" aria-hidden>
                  {stops.map((stop, index) => (
                    <Fragment key={`${stop.when}-${stop.title}`}>
                      {index > 0 && <span className="change-rail-line" />}
                      <span className={index === 0 ? 'change-rail-dot' : 'change-rail-dot is-later'} />
                    </Fragment>
                  ))}
                </span>
                <div>
                  {stops.map((stop, index) => (
                    <div
                      key={`${stop.when}-${stop.title}`}
                      className={index === 0 ? 'change-stop' : 'change-stop is-later'}
                    >
                      <p className="card-eyebrow">{stop.when}</p>
                      <div className="change-stop-head">
                        <span className="change-stop-title">{stop.title}</span>
                        {stop.amount !== null && <span className="change-stop-amount">{stop.amount}</span>}
                      </div>
                      {stop.note !== undefined && <p className="change-stop-note">{stop.note}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/*
                * The card's own small print, below the rule, and it is now unconditional — the
                * tax line is always in it and case C6's sentence joins it when there is one.
                *
                * **Case C6, kept**: a reader whose Paddle items have already moved must be told
                * so wherever a plan is discussed, or this card's two stops read as the only
                * thing arranged on the account. It is a row in the dialog's list; here it is the
                * one line the calendar has no stop for.
                *
                * **The tax line, added 2026-09-17 with /pricing's own.** `footNote` above says
                * it for a first purchase and this branch never renders that string, so the one
                * screen in the app where two amounts are quoted *and* about to be charged was
                * the one saying nothing about what is inside them. Not `footNote` itself,
                * deliberately: that sentence also names a cycle and a renewal date, and on a
                * change those are precisely what the stops above decide — printing a second,
                * simpler answer under them is the card disagreeing with itself. So only the half
                * that is true either way.
                */}
              <div className="mt-3.5 border-t border-line-soft pt-3.5 text-[0.8125rem] leading-[1.45] text-muted">
                {live.scheduled !== null && <p>{live.scheduled}</p>}
                <p className={live.scheduled !== null ? 'mt-1.5' : undefined}>Tax included, in euro.</p>
              </div>
            </>
          ) : (
            /* No price, so no calendar: the same sentence the summary block used to fall back
               to, in the card that would have held the stops. */
            <p className="mt-2.5 text-sm leading-[1.5] text-muted">
              You are on {live.label} today.{' '}
              {live.scheduled !== null && `${live.scheduled} `}
              {pricing
                ? 'Working out what this change costs…'
                : noPrice !== null
                  ? CHANGE_REFUSALS[noPrice]
                  : 'We could not work out what this change costs just now, so we are not going to ' +
                    'move it. Try again in a moment.'}
            </p>
          )}
        </div>
      </div>

      {/*
        * **The coupon sits under the number it changes, and only on a first purchase.** It
        * opened this screen until `Checkout.dc.html` moved it here; and it is withheld from a
        * plan change because `changePaddlePlan` refuses a discount outright, so a code field
        * over one is a control whose press cannot be honoured.
        */}
      {live === null && props.coupon !== undefined && <div className="mt-3">{props.coupon}</div>}

      {/*
        * **The button and the payment form are never both on the page.** Once the form is
        * drawn it carries the action — a «Pay for Premium» above a live payment form is a
        * second way to start a second transaction, and the reader cannot tell which of the two
        * is the real one.
        *
        * `ready` gates the frame and nothing else: a plan change never opens one, so waiting
        * for Paddle.js to load before allowing it would disable a working button for the sake
        * of a script it does not use.
        */}
      {openTransaction === null && (
        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={() => (live ? setConfirming(true) : void buy())}
          /*
           * **A change is not offered until its price is known**, and that is a safety rule rather
           * than a nicety: «we could not work out what this costs» is not a state to let somebody
           * press through, and it is also the state in which there would be no summary for the
           * dialog to show. A first purchase is different — Paddle's own form shows the price
           * before anything is taken, and is itself the second look — which is why only the change
           * path waits, and why only the change path opens a dialog of ours.
           */
          disabled={busy || (live ? pricing || preview === null : !ready)}
        >
          {busy
            ? 'One moment…'
            : live
              ? /* «Switch to Premium» is the wrong name for the one press that changes nothing
                   about what the reader has: they already pay for it, and what the button does is
                   call off the move away from it. */
                preview?.direction === 'revert'
                  ? `Stay on ${PLAN_LABEL[props.plan]}`
                  : `Switch to ${PLAN_LABEL[props.plan]}`
                : `Pay for ${PLAN_LABEL[props.plan]}`}
      </button>
      )}

      {/*
        * Paddle renders into this by class name, so it must be exactly `FRAME_TARGET` and must
        * already be painted when `open()` runs. Given no height of our own: the frame sizes
        * itself, and its footer — Paddle's «merchant of record» line — has to stay visible.
        */}
      {openTransaction !== null && (
        <div className="mt-4">
          {/*
            * **The frame sits on a card of ours, not on the page, and that card is white in both
            * themes.** `frameStyle` keeps the frame itself transparent, so this element is the
            * ground Paddle's form is drawn on — and since the form is pinned to `light`
            * (`checkoutSettings`), the ground has to be the white that palette was chosen
            * against. `--surface` used to serve both and can no longer: it is `#181b21` in the
            * dark theme, which would put Paddle's black label text on a near-black panel.
            *
            * So `bg-white` rather than a token, deliberately, and it is the only place in this
            * app that does it. This is not our surface, it is **Paddle's** — the one colour the
            * dashboard's single palette assumes — and writing it as `--surface` would be
            * claiming a relationship to our theme that no longer exists. `--bg` was wrong for the
            * same kind of reason before: a warm off-white (#f6f5f2) washes out the form's own
            * fields and hairlines, which is what it looked like when it sat on the page.
            */}
          {/*
            * **No side padding until there is room for it, and a scroller either way.** Paddle
            * gives the frame a hard `min-width` — 286px, or 312px if checkout padding is on in
            * the dashboard, which is not a setting this repository can see — and a 320px phone
            * leaves 288px inside the page's own gutter. Padding here would push the frame past
            * that on the narrowest screens, and `overflow-x-auto` is what guarantees that if it
            * ever happens anyway, the card scrolls rather than the page: this repo's rule is
            * that the body never scrolls sideways, and a table or a frame gets its own box.
            */}
          <div className="overflow-x-auto rounded-card border border-line-soft bg-white py-2 shadow-card sm:p-3">
            <div className={FRAME_TARGET} />
          </div>
          {/* Absent once the money has moved: there is nothing left to back out of, and a way
              out offered under a completed payment reads as a way to undo it. */}
          {!paid && (
            <button type="button" className="btn btn-quiet btn-sm mt-2" onClick={backOut}>
              Not now
            </button>
          )}
        </div>
      )}

      {/* Only ever reachable with a summary in hand: the button that opens it is disabled in
          every state where `summary` is null. */}
      {confirming && summary !== null && (
        <PlanChangeConfirm
          summary={summary}
          confirmLabel={
            preview?.direction === 'revert'
              ? `Stay on ${PLAN_LABEL[props.plan]}`
              : `Switch to ${PLAN_LABEL[props.plan]}`
          }
          busy={busy}
          onConfirm={() => void change()}
          onClose={() => setConfirming(false)}
        />
      )}

      {message !== null && (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
