/**
 * What a plan change will cost, read out of Paddle's own preview — the pure half.
 *
 * **This exists because the number was nowhere on the screen.** `/checkout/[plan]` offered an
 * existing subscriber a «Switch to Plus» button and said, underneath it, only what *kind* of
 * thing would happen. Paddle will take a real amount off a real card the moment that button is
 * pressed, and the amount is knowable beforehand: `subscriptions.preview` computes exactly what
 * `subscriptions.update` would do, without doing it. Not showing it was the same
 * shown-price/charged-price gap the rest of this directory is written to close, left open at the
 * one press where money moves.
 *
 * **Two numbers, and they are not the same question.** `update_summary.result` is what the
 * change *works out to* — «this costs you €3.50» — and is the honest description of the deal.
 * `immediate_transaction`'s `grand_total` is what leaves the **card**, which is smaller whenever
 * the account already holds a Paddle credit balance that absorbs it. A reader is owed both: the
 * first is the price, the second is the charge, and saying only one of them is how somebody
 * comes to believe they were billed twice.
 *
 * Measured against the sandbox on 2026-09-13, Standard monthly → Plus monthly mid-period:
 * `credit −3.49`, `charge +6.99`, `result: charge 3.50`, and the immediate transaction carries
 * both lines. So Paddle **does** net the old plan's unused time against the new plan's charge
 * on a same-cycle change, which is exactly the arithmetic in the analysis document.
 */

import type { ChangeDirection, ChangeWhen } from './planChange'

/** Cents as Paddle sends them — possibly negative — as euro as `PRICES` prints it. */
export function paddleAmountToEuro(cents: string): string | null {
  if (!/^-?\d+$/.test(cents)) return null

  const negative = cents.startsWith('-')
  const digits = negative ? cents.slice(1) : cents
  return `${negative ? '-' : ''}${digits.slice(0, -2) || '0'}.${digits.slice(-2).padStart(2, '0')}`
}

export interface ChangeCost {
  /**
   * What the change works out to overall. `nothing` is its own answer rather than a zero
   * `charge`: «you pay nothing for this» and «you pay €0.00 for this» read differently to
   * somebody deciding.
   */
  action: 'charge' | 'credit' | 'nothing'
  /** Euro, no symbol, never signed — `action` carries the direction. */
  amount: string
  /** What leaves the card right now, once any credit already on the account is applied. */
  payNow: string
  /**
   * Whether Paddle credited anything for what is left of the period being replaced.
   *
   * **It decides one sentence, and that sentence was wrong without it.** «You pay €x now — the
   * difference for the rest of the period you have already paid for» is a claim about proration,
   * and proration is not something this app can infer, because whether there *is* any depends on
   * a history no screen here can see.
   *
   * Paddle prorates against the **invoice behind the current billing period**, and a change of
   * billing *frequency* restarts that period even under `do_not_bill` — `pinBillingDate` in
   * `planChange.ts` is the measurement. The second call puts the end date back; nothing puts the
   * invoice back. So a subscription whose cycle has ever been moved carries a period that was
   * never billed, and every later change is priced at the **full** new price with nothing
   * credited for what was paid.
   *
   * **A change of cycle is not the discriminator either**, which was the second wrong guess.
   * Measured 2026-09-14, every one of these on a subscription **bought minutes earlier**:
   * Standard monthly → Premium monthly billed €6.50 of €9.99, Standard yearly → Premium yearly
   * €65.00 of €99.99, and Standard monthly → Premium **yearly** €96.50 of €99.99 — a change of
   * frequency, credited all the same.
   *
   * **And the rule behind the three uncredited ones is not fully known**, which is stated rather
   * than smoothed over. Two are explained by the paragraph above — a period restarted by an
   * earlier change of cycle. The third is not: Premium monthly → Premium yearly, ten minutes
   * after a same-cycle upgrade that left `current_billing_period` untouched, came back with a
   * single line, `proration: null` and no credit at all. What that one has in common with
   * nothing else measured is that the item being replaced had itself arrived mid-period as a
   * proration. Plausible, unproven, and not something to encode.
   *
   * So: the totals look identical either way, the rule is not one this app can state, and the
   * answer is read from Paddle — which is the whole reason this field exists.
   */
  credited: boolean
}

interface Totals {
  grand_total?: unknown
}

interface PreviewShape {
  update_summary?: {
    /** What Paddle gives back for what is unused — `'0'` when it gives nothing back at all. */
    credit?: { amount?: unknown } | null
    result?: { action?: unknown; amount?: unknown } | null
  } | null
  immediate_transaction?: { details?: { totals?: Totals | null } | null } | null
}

/**
 * Paddle's preview as a cost, or `null` when it cannot be read.
 *
 * **Null is not zero**, and the caller must not print it as one: a preview this cannot parse
 * means the amount is unknown, and «you pay nothing» would be a claim rather than a reading.
 * The screen's answer to null is to say it does not know, which is honest and rare.
 */
export function readChangeCost(preview: unknown): ChangeCost | null {
  if (preview === null || typeof preview !== 'object') return null

  const { update_summary: summary, immediate_transaction: immediate } = preview as PreviewShape

  const rawPayNow = immediate?.details?.totals?.grand_total
  /* No immediate transaction at all is a change that bills nothing now — a deferred mode, or a
     move with no money in it. Zero rather than unknown: Paddle said there is no invoice. */
  const payNow = typeof rawPayNow === 'string' ? paddleAmountToEuro(rawPayNow) : '0.00'
  if (payNow === null) return null

  /* `'0'`, `'000'` and an absent field all mean the same thing: nothing came back. */
  const rawCredit = summary?.credit?.amount
  const credited = typeof rawCredit === 'string' && /[1-9]/.test(rawCredit)

  const result = summary?.result
  if (!result) return { action: 'nothing', amount: '0.00', payNow, credited }

  const amount = typeof result.amount === 'string' ? paddleAmountToEuro(result.amount) : null
  if (amount === null) return null

  /* Paddle reports the size in `amount` and the direction in `action`; a sign on top of that
     would be a second statement of the same fact, and the two could disagree. */
  const size = amount.startsWith('-') ? amount.slice(1) : amount
  if (size === '0.00') return { action: 'nothing', amount: '0.00', payNow, credited }

  if (result.action === 'charge') return { action: 'charge', amount: size, payNow, credited }
  if (result.action === 'credit') return { action: 'credit', amount: size, payNow, credited }

  return null
}

/**
 * The SDK's preview, narrowed to the fields that decide the sentence — a structural type rather
 * than the SDK's own classes, so this file imports nothing from Paddle and a test can build one
 * by hand.
 */
export interface SdkChangePreview {
  updateSummary: { credit: { amount: string }; result: { action: string; amount: string } } | null
  immediateTransaction: { details?: { totals?: { grandTotal?: string } | null } | null } | null
}

/**
 * The same reading, from the shape the Node SDK actually hands back.
 *
 * **The rename is the dangerous part, which is why it is here and tested rather than inline at
 * the call site.** `readChangeCost` reads Paddle's wire format — snake_case, the shape the
 * sandbox and every test in this file speak — and `subscriptions.preview` returns an entity
 * whose fields are camelCase. Written out at the call site, this cast quietly dropped `credit`
 * the day `credited` was added, so the screen could never say «the difference» again no matter
 * what Paddle answered: a field missing from an object literal is not a type error, and nothing
 * else in the app reads that field. One assertion below is the whole defence.
 */
export function readSdkChangeCost(previewed: SdkChangePreview): ChangeCost | null {
  return readChangeCost({
    update_summary:
      previewed.updateSummary === null
        ? null
        : {
            credit: { amount: previewed.updateSummary.credit.amount },
            result: { action: previewed.updateSummary.result.action, amount: previewed.updateSummary.result.amount },
          },
    immediate_transaction:
      previewed.immediateTransaction === null
        ? null
        : { details: { totals: { grand_total: previewed.immediateTransaction.details?.totals?.grandTotal } } },
  })
}

/**
 * The sentence for the press that *undoes* an arranged change — the other half of B2, and the
 * one that reads wrong if it is left to the generic cost line.
 *
 * Calling a downgrade off costs nothing, exactly as arranging it did, so `readChangeCost`
 * answers `nothing` here too and «there is nothing to pay for this change» would be all a
 * reader was told before pressing a button that cancels a decision they have already made. What
 * they need to know is what it *does*, not what it costs.
 */
export function callOffLine(keep: string): string {
  return `Nothing to pay. This calls off the change you arranged, and you stay on ${keep}.`
}

/**
 * The sentence for a change that is *arranged* rather than made — case B2, and the only one
 * where the cost line alone would be true and useless.
 *
 * Paddle bills nothing for it, so `readChangeCost` answers `nothing` and `changeCostLine` would
 * say «there is nothing to pay for this change» and stop. That leaves out both halves of what
 * the reader has just decided: that they keep what they have until a named day, and that the
 * cheaper plan starts then. It is the sentence that answers «why am I still on Premium» before
 * it is asked.
 *
 * Takes the labels already formatted, the way `subscriptionStatusLine` takes its date: this
 * file knows about money and not about what a plan or a day is called.
 */
export function scheduledChangeLine(keep: string, to: string, on: string): string {
  return `Nothing to pay now. You keep ${keep} until ${on}, and move to ${to} that day.`
}

/**
 * The sentence under the button.
 *
 * **It always names what leaves the card**, because that is the number a reader will look for
 * on their statement. When the deal and the charge differ — an account carrying credit — both
 * are said, in that order, since «€3.50, and nothing to pay» is only confusing if the €3.50 is
 * left out and the next invoice mentions it.
 */
export function changeCostLine(cost: ChangeCost): string {
  if (cost.action === 'credit') {
    return (
      `You pay nothing now. €${cost.amount} of what you have already paid comes back as credit ` +
      'against your next invoices.'
    )
  }

  if (cost.action === 'nothing') return 'There is nothing to pay for this change.'

  /*
   * **«The difference» is a claim about proration, so it waits for Paddle to say there was
   * one** — `credited`, which is Paddle's own answer and not a guess from the two cycles. The
   * first version of this fix said «and a fresh period starts today» on the other branch, which
   * was a second guess wearing the first one's clothes: the case that produced it kept its
   * renewal date to the second (`next_billed_at` pinned a year out) and started no period at
   * all, and a change of cycle on an untouched subscription turned out to credit normally
   * anyway. What is actually true of every uncredited change is the money, so that is all this
   * says — and the day the period really does restart, the «Next charge» row beside this states
   * it with a date rather than by implication.
   */
  if (cost.payNow === cost.amount) {
    return cost.credited
      ? `You pay €${cost.amount} now — the difference for the rest of the period you have already paid for.`
      : `You pay €${cost.amount} now — the full price of the new plan, with nothing credited for what is ` +
        'left of the old one.'
  }

  return cost.credited
    ? `This works out at €${cost.amount} for the rest of the period you have already paid for, ` +
      `covered by the credit on your account. €${cost.payNow} leaves your card now.`
    : `€${cost.amount} is the full price of the new plan, with nothing credited for what is left of ` +
      `the old one. The credit on your account covers part of it, so €${cost.payNow} leaves your card now.`
}

/**
 * The same fact as `changeCostLine`, with the figure taken out.
 *
 * **The two are a pair and must never disagree**, which is the `durationCopy`/`termCopy` hazard
 * this repository already keeps a list of — so the test below asserts them branch by branch
 * rather than checking eight wordings. What separates them is where they are read.
 * `changeCostLine` is a sentence standing on its own, in the dialog, and has to name the number
 * because nothing beside it does. This sits in the note under a timeline stop that already hangs
 * that number on the right-hand edge, a centimetre away and set four sizes larger — `€96.51 …
 * you pay €96.51 now` is the amount said twice in one glance, which is what `Checkout.dc.html`
 * writes this way instead.
 *
 * **`credited` decides the wording here for exactly the reason it does there**: «the difference»
 * is a claim about proration, and Paddle is the only thing that knows whether there was one.
 * Saying it where nothing was credited is a discount promised and not given — on the stop that
 * carries the figure being charged.
 */
export function changeReason(cost: ChangeCost): string | null {
  if (cost.action === 'credit') {
    return `€${cost.amount} of what you have already paid comes back as credit against your next invoices.`
  }

  /* Nothing to explain: the stop's own amount already says «Nothing», and a sentence under it
     restating that is a line that adds no fact. */
  if (cost.action === 'nothing') return null

  const deal = cost.credited
    ? 'You pay the difference for the rest of the period you have already paid for.'
    : 'You pay the full price of the new plan, with nothing credited for what is left of the old one.'

  /* An account carrying credit pays less than the change costs, and that gap is the one thing
     the figure beside this cannot show — the stop hangs `payNow`, which is what leaves the card
     *after* the credit. So the deal's own size is named here and the credit is what closes the
     difference; saying «€x is covered» would name the wrong one of the two numbers. */
  return cost.payNow === cost.amount
    ? deal
    : `${deal} The change works out at €${cost.amount}, and the credit on your account covers the rest.`
}

/**
 * What just happened, once the change has gone through — in two parts, because
 * `Checkout.dc.html` sets them as two: the plan is the lead, and the money is the line under it.
 *
 * **Four outcomes, and only two of them move money.** The `period-end` one is the case the whole
 * split exists for: nothing was charged, the plan they have is theirs until a named day, and the
 * other one starts then. Saying «moving you to Standard» over that would be false on the day it
 * is read.
 *
 * It branches on `when` before `direction`, and that ordering is load-bearing since B7: a change
 * that waits can be a rise in tier, so reading the direction first would send it to the «what you
 * have not used comes off the charge» line, describing a charge nobody made.
 *
 * **`credited` is Paddle's own answer and not a guess from the two cycles** — the same field
 * `changeCostLine` and `changeReason` hang off, for the same reason. Promising that the unused
 * part «comes off the charge» is a discount that will not appear on the invoice whenever Paddle
 * credited nothing, and this sentence is read *after* the money has moved, where it can be
 * checked against a statement.
 *
 * Every label arrives formatted: this file knows about money, never about what a plan or a day
 * is called.
 */
export interface ArrangedLines {
  /** The headline of the settled card — what the account is now. */
  lead: string
  /** The line under it — what it cost, and when it shows. */
  body: string
}

export function arrangedLines(input: {
  direction: ChangeDirection
  when: ChangeWhen
  /** The day a waiting change lands, already formatted — `null` when Paddle sent none. */
  on: string | null
  credited: boolean
  /** «Premium» — the plan being moved to. */
  target: string
  /** «Premium, billed yearly» — the plan kept, on a change that is being called off. */
  keep: string
  /** What moves, as `changeNames` words it: only the half that is changing. */
  names: { from: string; to: string }
}): ArrangedLines {
  const { direction, when, on, credited, target, keep, names } = input

  if (direction === 'revert') {
    return {
      lead: `Kept — you stay on ${keep}.`,
      body: 'The change you had arranged has been called off, and nothing about your plan moves.',
    }
  }

  if (when === 'period-end' && on !== null) {
    return {
      lead: `You keep ${names.from} until ${on}.`,
      body: `Nothing has been charged. ${names.to} starts that day.`,
    }
  }

  const lead = `Moving you to ${target}.`

  if (!credited) {
    return {
      lead,
      body:
        'You have paid the full price of the new plan, with nothing credited for what is left of ' +
        'the old one. It appears in a moment.',
    }
  }

  return {
    lead,
    body:
      direction === 'upgrade'
        ? 'What you have not used of your old plan comes off the charge, and the new plan appears in a moment.'
        : 'The difference is credited against your next invoice, and the new plan appears in a moment.',
  }
}
