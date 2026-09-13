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
import { useEffect, useRef, useState } from 'react'

import { PlanChangeConfirm } from '@/components/PlanChangeConfirm'
import { resolvedTheme, useResolvedTheme } from '@/lib/useResolvedTheme'
import { startPaddleCheckout, type PaddleCheckoutFailure } from '@/lib/plans/paddleCheckout'
import { changeSummary, type NextCharge } from '@/lib/plans/changeSummary'
import { callOffLine, changeCostLine, scheduledChangeLine, type ChangeCost } from '@/lib/plans/changePreview'
import type { ChangeDirection, ChangeWhen } from '@/lib/plans/planChange'
import {
  changePaddlePlan,
  previewPaddlePlanChange,
  type PaddlePlanChangeFailure,
} from '@/lib/plans/paddlePlanChange'
import { euro, yearlyTotalOfMonthly, type BillingPeriod, type PaidPlan } from '@/lib/plans/prices'
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
 * **The theme is why this is a function.** Paddle defaults to `light` whatever the page is
 * doing, which as a modal was merely unfortunate and inside our own column would be a white card
 * sitting in a dark one. `resolvedTheme` answers it from the two places the answer lives — the
 * attribute, and the system scheme when `auto` has set none — and it is asked here, at the
 * moment of opening, so that a theme changed while the page was sitting open is the one the
 * form is drawn in.
 *
 * `one-page` because the default, `multi-page`, collects the details and then the card on two
 * screens, and an embedded frame changing height between them moves the page under the reader's
 * thumb. `locale` is deliberately **not** passed: Paddle follows the browser, so a reader whose
 * phone is in Italian gets the payment form in Italian, which is better than pinning it to the
 * language this app happens to be written in.
 *
 * `frameStyle` carries no height: Paddle grows the frame as the form does, and a height of ours
 * is exactly what would clip the «merchant of record» footer it is required to show.
 */
function checkoutSettings(): CheckoutSettings {
  return {
    theme: resolvedTheme(),
    displayMode: 'inline',
    variant: 'one-page',
    frameTarget: FRAME_TARGET,
    frameInitialHeight: 450,
    /* 286px is Paddle's floor with checkout padding off, 312px with it on. The page's own gutter
       leaves 343px at 375px of viewport, so the narrowest phone anybody reads this on clears
       both — but the number lives here rather than in a stylesheet because it is Paddle's
       requirement and not our layout's. */
    frameStyle: 'width: 100%; min-width: 286px; background-color: transparent; border: none;',
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
    }
  | { plan: 'lifetime'; amount: string }


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
   * Takes the cycle rather than reading it from state, because the toggle calls this in the
   * same tick as `setCycle` — where the state still holds the old value.
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
   * **A frame already drawn keeps the theme it was drawn with**, and that is a real defect
   * rather than a nicety: `updateCheckout` takes items, a discount and customer data — there is
   * no setting on it — so a reader who switches theme mid-payment is left with a light form
   * inside a dark card, or the reverse. The only lever Paddle offers is opening again.
   *
   * The cost is stated because it is not free: re-opening restarts the form, so a half-typed
   * card number is lost. Taken anyway — changing theme is a deliberate act, rare at this exact
   * moment, and what it produces otherwise is precisely the mismatch that was reported.
   *
   * The guard is keyed on the transaction **and** the theme, which is what lets the same id be
   * re-opened for the second reason while still refusing the double mount React does in
   * development. `checkoutSettings` re-reads the DOM rather than trusting the state that woke
   * this: the hook is the signal, the attribute is the truth.
   */
  const theme = useResolvedTheme()
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (openTransaction === null || !ready) return
    const drawn = `${openTransaction}:${theme}`
    if (opened.current === drawn) return
    opened.current = drawn
    paddle.current?.Checkout.open({ transactionId: openTransaction, settings: checkoutSettings() })
  }, [openTransaction, ready, theme])

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
    setMessage(result.ok ? arranged(result) : CHANGE_REFUSALS[result.reason])
    setConfirming(false)
    setBusy(false)
  }

  /**
   * What just happened, in the reader's terms — four outcomes, and only two of them move money.
   *
   * The `period-end` one is the sentence this whole case exists for: nothing was charged, the
   * plan they have is theirs until a named day, and the other one starts then. Saying «moving
   * you to Standard» over that would be false on the day it is read.
   *
   * It branches on `when`, never on `direction`, and that ordering is load-bearing since B7: a
   * change that waits can be a rise in tier, so reading the direction first would send it to
   * the «what you have not used comes off the charge» line, describing a charge nobody made.
   */
  function arranged(result: Extract<Awaited<ReturnType<typeof changePaddlePlan>>, { ok: true }>): string {
    const target = props.plan === 'lifetime' ? '' : PLAN_LABEL[props.plan]

    if (result.direction === 'revert') {
      return `Kept — you stay on ${live?.label ?? target}, and the change that was arranged has been called off.`
    }

    if (result.when === 'period-end' && result.effectiveAt !== null && live !== null) {
      const names = changeNames(live, { plan: props.plan, cycle })
      return (
        `Arranged. Nothing has been charged: you keep ${names.from} until ` +
        `${formatPlanDate(new Date(result.effectiveAt))}, and move to ${names.to} that day.`
      )
    }

    return result.direction === 'upgrade'
      ? `Moving you to ${target}. What you have not used of your old plan comes off the charge, ` +
        'and the new plan appears in a moment.'
      : `Moving you to ${target}. The difference is credited against your next invoice, and the ` +
        'new plan appears in a moment.'
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
  const asksForCycle = props.plan !== 'lifetime' && props.initialCycle === null

  return (
    <div className="mt-6">
      {/* `segment` / `segment-button is-on`, the control /pricing's own toggle uses for this
          exact choice — the classes already exist and carry the theme, so this is not the
          place to invent a second look for one switch. Yearly first, the side /pricing opens
          on. */}
      {asksForCycle && (
        <div className="segment w-fit" role="group" aria-label="Billing period">
          {(['year', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              /*
               * **Changing the cycle rebuilds the form rather than freezing it.** The
               * transaction behind an open form was made server-side for one price, so the
               * toggle cannot simply move under it — but disabling it would strand the reader
               * on a decision this page opens with, now that the form is drawn on arrival.
               *
               * Rebuilt through the server and not through `Checkout.updateItems`, which would
               * mean the browser naming a price: the whole reason `startPaddleCheckout` hands
               * back an id instead of taking one.
               */
              onClick={() => {
                if (option === cycle) return
                setCycle(option)
                if (openTransaction === null) return
                paddle.current?.Checkout.close()
                opened.current = null
                setOpenTransaction(null)
                void buy(option)
              }}
              aria-pressed={cycle === option}
              disabled={busy || paid}
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

      {/*
        * The comparison /pricing makes rather than a claim about savings: the reader puts the
        * two numbers side by side themselves, which they do correctly and faster than they read
        * a sentence about it.
        *
        * **Only where the switch is**, and for the same reason. With the cycle already settled
        * this is an argument for a change the screen no longer offers a way to make — and
        * re-opening a decision at the moment of payment, with no control to act on it, is
        * second-guessing a reader who saw both figures on /pricing and picked one.
        */}
      {asksForCycle && cycle === 'month' && (
        <p className="mt-1 text-sm opacity-80">
          {yearlyTotalOfMonthly(props.amounts.month)} a year, against {euro(props.amounts.year)}{' '}
          paid yearly.
        </p>
      )}

      {/*
        * **Everything the press does, before the press** — the change this screen exists to
        * explain, as labelled facts rather than as one sentence at the end.
        *
        * It used to sit *below* the button and say only what the change cost today, which for
        * every waiting change is «nothing»: true, and the least useful thing that can be said
        * to somebody deciding what they will pay from now on. The rows carry what that left
        * out — the day it lands, and the next charge with its date — and they sit above the
        * button because a reader who has already pressed is not reading them.
        *
        * `summary` is `null` in exactly the states the button is disabled in, so what replaces
        * it here is never a missing explanation for an offer that is still live.
        */}
      {live !== null && (
        <div className="mt-4">
          {summary !== null ? (
            <>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-line-soft pt-3 text-sm sm:grid-cols-[10.5rem_1fr] sm:gap-y-2">
                {summary.rows.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm opacity-80">{summary.headline}</p>
            </>
          ) : (
            <p className="text-sm opacity-80">
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
      )}

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
            * **The frame sits on a card of ours, not on the page.** `--bg` in the light theme is
            * a warm off-white (#f6f5f2) and Paddle's light form is drawn for white: on the page
            * background its fields and hairlines wash out, which is exactly what it looked like
            * — dark mode was fine because dark-on-dark forgives it. `--surface` is #ffffff here
            * and a lifted panel in the dark theme, so one card serves both, and `frameStyle`
            * stays transparent so the colour comes from this element.
            */}
          <div className="rounded-card border border-line-soft bg-surface p-2 shadow-card sm:p-3">
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
