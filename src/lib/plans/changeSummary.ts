/**
 * What a plan change actually does, as a handful of labelled facts — the pure half.
 *
 * **One summary, rendered twice.** The reader sees it under the button before pressing and
 * again in the dialog that asks them to confirm, and those two must never be able to disagree:
 * a dialog that restates the screen in its own words is a second copy of the copy, and the day
 * one of them is edited it starts lying about the other. So both render this, and neither
 * writes a sentence of its own.
 *
 * **The headline is not written here either.** `callOffLine`, `scheduledChangeLine` and
 * `changeCostLine` (`changePreview.ts`) already own the three sentences this screen can say,
 * each with its own argument for why it is worded as it is; this picks between them and adds
 * what they cannot carry — the structure, and the one fact none of them states.
 *
 * **That fact is the next charge**, and it was missing from the screen entirely. A reader
 * deciding about a downgrade is deciding about what they will pay *from now on*, and the screen
 * said only what happens today — which for every waiting change is «nothing», the least
 * informative true sentence available. See `nextChargeOf` for where the figure comes from,
 * which is two different places for a good reason.
 */

import type { ChangeCost } from './changePreview'
import { paddleAmountToEuro } from './changePreview'
import type { ChangeDirection, ChangeWhen } from './planChange'
import { PRICES, type BillingPeriod, type PaidPlan } from './prices'
import { formatPlanDate, planWithCycle } from './subscriptionCopy'
import type { Plan } from './types'

/**
 * What the reader will be billed next, once this change has taken effect.
 *
 * `source` is not rendered and is not decoration: it records which of the two branches in
 * `nextChargeOf` produced the figure, so a test can pin the provenance rather than only the
 * number. The distinction is the whole subtlety of this file — see below.
 */
export interface NextCharge {
  /** Euro, no symbol, as `PRICES` writes them. */
  amount: string
  /** ISO, the day the charge lands. */
  on: string
  cycle: BillingPeriod
  source: 'paddle' | 'listino'
}

export interface SummaryRow {
  label: string
  value: string
}

export interface ChangeSummary {
  /** The sentence the existing copy functions own. */
  headline: string
  rows: SummaryRow[]
}

/**
 * Where the next charge comes from, which is **Paddle when Paddle knows and the listino when it
 * cannot yet**.
 *
 * Paddle's preview answers for the subscription as the first call would leave it. That is the
 * whole truth for every change that does not move the billing frequency: the period is either
 * untouched (`do_not_bill` at one frequency) or deliberately restarted (an immediate upgrade),
 * and either way `next_transaction` is what will really happen.
 *
 * **It is not the truth when `pinBillingDate` is set**, and printing it there would be the worst
 * kind of wrong — confidently sourced and off by up to a year. A change of frequency restarts
 * the period even under `do_not_bill`, so Paddle's preview reports that restarted date; this app
 * then puts the date back with a second call Paddle has not been asked about. So for those the
 * date is the one being pinned, and the amount is the listino — resting on the measurement that
 * settles B4 and B8 both: **`next_billed_at` says when the next cycle starts, and Paddle bills
 * one whole cycle of whatever items the subscription then carries.**
 *
 * Two sources for one field is a thing to be uncomfortable about, so it is stated rather than
 * hidden: what the reader sees is never a listino figure dressed up as a quotation, because
 * where the listino is used there is no Paddle answer to the question being asked yet.
 */
export function nextChargeOf(input: {
  to: { plan: PaidPlan; cycle: BillingPeriod }
  pinBillingDate: boolean
  effectiveAt: string | null
  /** `next_transaction` as Paddle previewed it: total in cents, period start ISO. */
  fromPaddle: { total: string; startsAt: string } | null
}): NextCharge | null {
  const { to, pinBillingDate, effectiveAt, fromPaddle } = input

  if (pinBillingDate) {
    /* No pinned date means nothing to promise. The action refuses such a change anyway
       (`unreadable`), so this is the belt to that brace rather than a live case. */
    if (effectiveAt === null) return null
    return { amount: PRICES[to.plan][to.cycle].amount, on: effectiveAt, cycle: to.cycle, source: 'listino' }
  }

  if (fromPaddle === null) return null

  const amount = paddleAmountToEuro(fromPaddle.total)
  /* Unreadable is not zero, exactly as `readChangeCost` argues: no row at all beats a row
     saying the next invoice is free. */
  if (amount === null || amount.startsWith('-')) return null

  const on = new Date(fromPaddle.startsAt)
  if (Number.isNaN(on.getTime())) return null

  return { amount, on: fromPaddle.startsAt, cycle: to.cycle, source: 'paddle' }
}

const CYCLE_WORD: Record<BillingPeriod, string> = { year: 'year', month: 'month' }

/** `null` for a date this cannot read, so a caller prints no row rather than «Invalid Date». */
function on(iso: string | null): string | null {
  if (iso === null) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : formatPlanDate(date)
}

/**
 * The change as the reader needs to see it before deciding.
 *
 * `from` is the plan **paid for**, never Paddle's items — the distinction the whole of B2 rests
 * on, and the one that makes «you are on Premium» true on a screen where Paddle already thinks
 * otherwise.
 */
export function changeSummary(input: {
  from: { plan: Plan; cycle: BillingPeriod | null; label: string }
  to: { plan: PaidPlan; cycle: BillingPeriod }
  direction: ChangeDirection
  when: ChangeWhen
  effectiveAt: string | null
  cost: ChangeCost
  nextCharge: NextCharge | null
  /** What is already arranged, if anything — case C6, said again at the moment of deciding. */
  arranged: string | null
  headline: string
}): ChangeSummary {
  const { from, to, direction, when, effectiveAt, cost, nextCharge, arranged, headline } = input

  const rows: SummaryRow[] = []
  const lands = on(effectiveAt)

  /*
   * **A revert has no «you move to» row**, and inventing one is how this reads as a change. The
   * target *is* the plan they already pay for, so a «Now / After» pair would print the same
   * plan twice and describe the opposite of what the press does.
   */
  if (direction === 'revert') {
    rows.push({ label: 'You stay on', value: from.label })
    /* The thing being undone, named rather than merely marked «called off» — which arrived
       above the sentence that said what it referred to, and read as a fact about nothing. */
    rows.push({ label: 'Being called off', value: arranged ?? 'The change you had arranged' })
  } else {
    rows.push({ label: 'Today you are on', value: from.label })
    /* Complete, not `changeNames` — see `planWithCycle`. A row is read beside its neighbour and
       has to stand up alone, where a sentence may say only what moves. */
    rows.push({ label: 'You move to', value: planWithCycle(to.plan, to.cycle) })
    rows.push({
      label: 'Takes effect',
      /* A date this cannot read must not become «Immediately», which is the opposite of what a
         waiting change does and the one mistake here that would take a plan away early. */
      value: when === 'now' ? 'Straight away' : (lands ?? 'At the end of the period you have paid for'),
    })
  }

  rows.push({
    label: 'You pay today',
    value: cost.payNow === '0.00' ? 'Nothing' : `€${cost.payNow}`,
  })

  if (nextCharge !== null) {
    const from_ = on(nextCharge.on)
    rows.push({
      label: 'Next charge',
      value: `€${nextCharge.amount} every ${CYCLE_WORD[nextCharge.cycle]}${from_ === null ? '' : `, from ${from_}`}`,
    })
  }

  /* Last, because it is context for the decision rather than part of it — and kept, rather than
     dropped once a summary existed, since a reader with something already arranged is the one
     most likely to be surprised by what this press does to it. */
  if (arranged !== null && direction !== 'revert') rows.push({ label: 'Already arranged', value: arranged })

  return { headline, rows }
}
