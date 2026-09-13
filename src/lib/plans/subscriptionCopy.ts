/**
 * The one sentence that says what an account's subscription is right now — read by
 * `/billing` and `/checkout/[plan]` alike, so the two screens describing the exact same
 * fact cannot drift into two different sentences the way they used to: `/billing` never
 * named a `grace` subscription at all (falling through to "active until <a date already in
 * the past>"), and `/checkout/[plan]` had its own third phrasing that named neither `grace`
 * nor `lifetime` specially. A plain module, not `'use server'`: `lib/plans/checkout.ts` (the
 * type this reads) is one, and a `'use server'` module may only export async functions —
 * the same reason `plans/paddleClient.ts` exists beside `checkout.ts` rather than inside it.
 */

import { PLAN_LABEL } from './types'
import type { Plan, PlanStatus } from './types'
import { euro } from './prices'
import type { BillingPeriod } from './prices'
import type { SubscriptionState } from './checkout'
import type { PaymentHistoryLine } from './history'

/**
 * A renewal date as a reader would write it — «22 September 2026» — the same form the
 * purchase email and `/thanks` already use. Not `toISOString().slice(0, 10)`, which is what
 * `/billing` and `/checkout/[plan]` each used to print on their own: a machine-readable date
 * sitting next to plain English elsewhere on the same screen reads as unfinished.
 */
export function formatPlanDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * What to call each side of a change, given that only one of the two things about it may have
 * moved.
 *
 * **A change of cycle has to be named by its cycle, or the sentence says nothing.** Premium
 * yearly to Premium monthly is case B4, and the naive version of every sentence about it reads
 * «you keep Premium until 13 September 2027, and move to Premium that day» — which is not a
 * clumsy sentence so much as a false one, since nothing about the plan changes at all. The
 * reader is moving their *billing*, and that is what has to be on the screen.
 *
 * Three shapes, and each is the shortest true one: the plan alone when only the plan moves,
 * the billing alone when only the billing does, and both when both do. Pure, so the checkout
 * and `/billing` cannot end up describing one change two ways.
 */
export function changeNames(
  from: { plan: Plan; cycle: BillingPeriod | null },
  to: { plan: Plan; cycle: BillingPeriod | null },
): { from: string; to: string } {
  const billing = (cycle: BillingPeriod | null) => (cycle === 'year' ? 'yearly billing' : 'monthly billing')

  if (from.plan === to.plan && from.cycle !== to.cycle) {
    return { from: billing(from.cycle), to: billing(to.cycle) }
  }

  if (from.cycle === to.cycle) return { from: PLAN_LABEL[from.plan], to: PLAN_LABEL[to.plan] }

  return {
    from: `${PLAN_LABEL[from.plan]} on ${billing(from.cycle)}`,
    to: `${PLAN_LABEL[to.plan]} on ${billing(to.cycle)}`,
  }
}

/**
 * `grace` checked ahead of the `expiresAt === null` branch and named on its own, never a
 * date: a failing card's `expiresAt` is virtually always already in the past (`grace` is
 * defined to ignore dates for exactly that reason, `entitlements.ts`), so printing it would
 * read as an already-lapsed plan instead of one still in force while payment retries — the
 * same reasoning `lib/accounts/planText.ts`'s own `subscriptionHeadline` already applies for the
 * operator screen, mirrored here for the customer-facing one.
 *
 * **`live` is a parameter and is never re-derived here**, for the reason this whole module
 * exists. A subscription stops being in force for two different reasons and only one of them
 * writes anything down: `planStatus: 'expired'` is a webhook's deliberate act, while a
 * `planExpiresAt` in the past ends the plan all on its own, with the status column still
 * reading `active` for ever after. Nothing in this repository renews anything, so the second
 * case is not an edge — it is where *every* plan bought through the mock eventually lands, and
 * this sentence used to greet it with "Standard, active until 3 May 2026", a date already gone
 * by, on the very screen a customer opens to find out where they stand. The rule that decides
 * it is `liveSubscription`'s, read once per request beside the clock (`loadCheckoutStatus`,
 * `loadPurchaseSummary`), and this function is handed the answer rather than guessing at it
 * from the two columns — a second copy of that comparison is the drift this file was written
 * to end.
 *
 * `null` means nothing is running: expired, or lapsed by date. `grace` is never null, which is
 * what keeps a retrying card on its own sentence instead of being mourned as a dead plan.
 *
 * The lifetime branch sits **after** the two status branches, not before them: a lifetime that
 * a refund or a chargeback has marked `expired` is still a plan that ended, and saying "bought
 * once, nothing to renew or cancel" over it would describe the purchase rather than the state.
 */
export function subscriptionStatusLine(current: SubscriptionState, live: Plan | null): string {
  if (current.plan === 'free') return 'Free — nothing bought yet.'
  if (current.status === 'expired') return `${PLAN_LABEL[current.plan]}, expired.`
  if (current.status === 'grace') return `${PLAN_LABEL[current.plan]}, payment retrying.`
  if (current.plan === 'lifetime') return 'Lifetime — bought once, nothing to renew or cancel.'

  /* Lapsed by date alone. The date is named because it is the one fact that explains it — and
     "ended" rather than "expired", which is the word this app reserves for the stored status. */
  if (live === null) {
    return current.expiresAt === null
      ? `${PLAN_LABEL[current.plan]}, ended.`
      : `${PLAN_LABEL[current.plan]}, ended ${formatPlanDate(current.expiresAt)}.`
  }

  if (current.expiresAt === null) return `${PLAN_LABEL[current.plan]}, no end.`

  const until = formatPlanDate(current.expiresAt)
  if (current.pendingPlan === null) return `${PLAN_LABEL[current.plan]}, active until ${until}.`

  /*
   * **The pending plan can now be the plan itself**, which is case B4: the tier stays and only
   * the billing turns monthly, at the end of the year already paid for. Printing `PLAN_LABEL`
   * twice said «Premium until 13 September 2027, then Premium» — a sentence describing no
   * change at all, on the one screen a reader opens to find out what is about to happen.
   *
   * The *current* cycle is not named because no column holds it (see `lastPaymentLine` below,
   * which goes to the ledger for exactly this reason). It does not need to be: «then billed
   * monthly» says what changes, and the line above this one already says what was paid.
   */
  if (current.pendingPlan === current.plan) {
    return current.pendingCycle === null
      ? `${PLAN_LABEL[current.plan]}, active until ${until}.`
      : `${PLAN_LABEL[current.plan]} until ${until}, then billed ${current.pendingCycle === 'year' ? 'yearly' : 'monthly'}.`
  }

  /*
   * The cycle is named whenever there is one, because a scheduled change can move it as well as
   * the tier (B6, B8) and «then Standard» would leave half of that unsaid. Redundant where only
   * the tier moves — «then Standard, billed yearly» for somebody already billed yearly — and
   * redundant is the right side to be on here: this is the screen a reader opens to check what
   * they arranged, and no column holds the *current* cycle to compare against (`lastPaymentLine`
   * below goes to the ledger for exactly that reason).
   *
   * A cancellation has no cycle and does not get one: `pendingPlan` is `'free'` there, with
   * `pendingCycle` null beside it.
   */
  const then = PLAN_LABEL[current.pendingPlan]
  return current.pendingCycle === null
    ? `${PLAN_LABEL[current.plan]} until ${until}, then ${then}.`
    : `${PLAN_LABEL[current.plan]} until ${until}, then ${then}, billed ${current.pendingCycle === 'year' ? 'yearly' : 'monthly'}.`
}

/**
 * What was actually paid, and for how long a period — the two facts `/billing` never said.
 *
 * A billing screen exists to answer «what was I charged, and when», and this one answered
 * neither: `subscriptionStatusLine` above names the plan and the day it runs to, and that was
 * the whole of it. No amount, and no period — a reader could not tell «Standard, active until
 * 22 September 2026» on a yearly plan from the same sentence on a monthly one renewed eleven
 * times.
 *
 * **Read out of the ledger, not out of a column, and that is not a shortcut.** No column
 * anywhere stores the cycle a live subscription is on: `accounts.pendingCycle` is the only one
 * in the schema and, by its own comment, is null unless a change is already scheduled. The
 * ledger does carry it, on the row that recorded the purchase itself —
 * which is the row this reads, and the same row `PaymentHistoryTable` prints two cards further
 * down the same screen. The two therefore cannot disagree, which a new column would have made
 * possible on the day one write updated it and the other did not.
 *
 * `history` is expected newest-first, which is how `loadMyPaymentHistory` returns it
 * (`orderBy(desc(receivedAt))`) — so the first match is the most recent purchase and not merely
 * some purchase. Matched on `plan` as well as on the action, so an upgrade's own row wins over
 * the older, cheaper plan's underneath it: the figure named has to be the figure paid for the
 * plan that is running now.
 *
 * `null` — no line at all rather than a hedged one — whenever there is nothing certain to say:
 * a free account, a plan bought before this ledger existed, or a row with no amount on it. An
 * absent sentence is read as "not applicable"; a vague one gets read as a fact.
 *
 * Deliberately says nothing about what happens next. That is `subscriptionStatusLine`'s
 * «active until <date>», and it stays as bare as it is on purpose: nothing in this repository
 * renews anything (see `checkout.ts`'s own header), so a word like "renews" here would promise
 * a charge that never comes — the mistake the purchase email was making until v3.13.
 */
export function lastPaymentLine(
  current: SubscriptionState,
  history: PaymentHistoryLine[],
): string | null {
  if (current.plan === 'free') return null

  const paid = history.find((line) => line.action === 'purchase' && line.plan === current.plan)
  if (paid === undefined || paid.amount === null) return null

  const when = formatPlanDate(paid.occurredAt)

  /* No cycle is `lifetime`'s own shape, not a missing value — see `PaymentHistoryLine.cycle`. */
  return paid.cycle === null
    ? `${euro(paid.amount)} paid once, on ${when}.`
    : `${euro(paid.amount)} paid on ${when}, for ${paid.cycle === 'year' ? 'a year' : 'a month'}.`
}

/**
 * The question «Cancel my plan» asks before it does anything (`/billing`).
 *
 * Here, and tested, for one reason: **`grace` must not be given a date**, and this sentence was
 * written wanting one. It is the same rule `subscriptionStatusLine` above states and checks
 * ahead of every date branch — a failing card's `planExpiresAt` is virtually always already in
 * the past, because `grace` is defined to ignore dates precisely so a retry is not read as a
 * lapse. A confirmation reading «at the end of the period already paid for, on 3 May 2026» to
 * somebody whose card is retrying would be the v3.12 bug over again, in new copy.
 *
 * Grace is the *only* status that can arrive here with a date behind it, which is worth stating
 * so the guard does not look over-careful: `canCancel` (`BillingScreen`) offers this button only
 * while `liveSubscription` is non-null, and that function collapses to `null` on any row whose
 * date has gone by — every one except `grace`, which it keeps alive on purpose.
 *
 * The bare form is also what an `expiresAt` of `null` gets: there is no period to name, and
 * such a row has no period to schedule against.
 */
export function cancelQuestion(current: SubscriptionState): string {
  const day = scheduledChangeDay(current.status, current.expiresAt)
  const label = PLAN_LABEL[current.plan]

  if (day === null) return `Cancel ${label}?`

  return `Cancel ${label} at the end of the period already paid for, on ${day}?`
}

/**
 * The day a change scheduled for period end actually lands, or `null` when there is no day
 * worth naming — the grace rule, extracted from `cancelQuestion` above so that it has one
 * statement in the code instead of one per place that words a scheduled change.
 *
 * Extracted for the second such place: `planChangeEmail`. That email says out loud which day a
 * cancellation or a downgrade takes effect, and it is the one artifact in this feature a reload
 * cannot correct — so it is the last place that should have been left to re-derive the rule
 * `subscriptionStatusLine` and `cancelQuestion` both state. Written without it, it greeted a
 * `grace` account with «Premium stays in force until 3 May 2026», a day already gone, named as
 * a future event: the v3.12 bug in the one place it cannot be taken back.
 *
 * Two ways there is no day, and they mean different things to a caller — which is why this
 * answers `null` for both and lets the caller decide, rather than pretending to. `grace` has a
 * `planExpiresAt` virtually always already in the past, because that status is defined to
 * ignore dates precisely so a retrying card is not read as a lapse; a null `expiresAt` has no
 * date at all, which for a cancellation means it applies at once and for
 * `cancelQuestion` means there is no period to name. A caller that has to tell the two apart —
 * the cancel path does — asks `expiresAt` itself, which is the question it is actually about.
 *
 * `status`/`expiresAt` as two arguments rather than a `SubscriptionState`, so the resolved
 * `SubscriptionColumns` that `checkout.ts` holds can be passed without being reshaped into a
 * type it does not have.
 */
export function scheduledChangeDay(status: PlanStatus, expiresAt: Date | null): string | null {
  if (status === 'grace' || expiresAt === null) return null

  return formatPlanDate(expiresAt)
}

/**
 * The discount line under the plan on `/billing`: the code, the reduction, when it ends, and
 * what the price goes back to.
 *
 * **The only place a customer can re-read the promise `/pricing` made**, which is why it names
 * all four facts rather than just the code. A campaign that discounts three months means a
 * charge rising from €2.44 to €3.49 at the fourth period; the commercial deck accepts that
 * attrition, and what makes it acceptable rather than disputed is that it is written where the
 * customer can find it afterwards.
 *
 * Takes `SubscriptionState.discount`, which has already been resolved through
 * `liveDiscount` — so this function never has to know that `discountEndsAt` is a date nobody
 * writes on the day it passes. `null` in, `null` out, and `/billing` renders nothing.
 *
 * `fullAmount` comes from the ledger (`lastPaymentLine`'s own source) rather than from `PRICES`:
 * what the price reverts to is what the listino said when the purchase happened, and a
 * re-price must not rewrite it.
 */
export function discountLine(
  discount: { code: string; percent: string; endsAt: Date | null } | null,
  fullAmount: string | null,
): string | null {
  if (discount === null) return null

  const reduction = `${discount.code} −${discount.percent}%`
  if (discount.endsAt === null) {
    return `${reduction}, for as long as this plan runs.`
  }

  const until = `${reduction} until ${formatPlanDate(discount.endsAt)}`
  return fullAmount === null ? `${until}.` : `${until}, then ${euro(fullAmount)}.`
}

/**
 * What `/billing` says once a cancellation has been scheduled.
 *
 * Here rather than inline in `BillingScreen` because there is a rule in it: the date arrives as
 * Paddle's own RFC 3339 string, and `new Date(…)` on anything it cannot parse yields a `Date`
 * whose `toLocaleDateString` is the literal words «Invalid Date». Printed into this sentence
 * that reads «this plan cancels on Invalid Date» to somebody who has just cancelled a plan they
 * pay for — the one moment on the screen where a reader is most entitled to a straight answer.
 * The dateless sentence is true in every case, so it is what an unreadable date falls back to.
 *
 * **Paddle's date and not `planExpiresAt`**, though the two agree today: the authority on when a
 * subscription stops is the system that will stop it, and this screen's own copy of the date is
 * a row the webhook has not necessarily updated yet.
 */
export function cancelledOnLine(effectiveAt: string | null): string {
  const day = effectiveAt === null ? null : new Date(effectiveAt)

  return day === null || Number.isNaN(day.getTime())
    ? 'Scheduled — this plan cancels once the period already paid for ends.'
    : `Scheduled — this plan cancels on ${formatPlanDate(day)}.`
}
