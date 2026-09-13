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
}

interface Totals {
  grand_total?: unknown
}

interface PreviewShape {
  update_summary?: {
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

  const result = summary?.result
  if (!result) return { action: 'nothing', amount: '0.00', payNow }

  const amount = typeof result.amount === 'string' ? paddleAmountToEuro(result.amount) : null
  if (amount === null) return null

  /* Paddle reports the size in `amount` and the direction in `action`; a sign on top of that
     would be a second statement of the same fact, and the two could disagree. */
  const size = amount.startsWith('-') ? amount.slice(1) : amount
  if (size === '0.00') return { action: 'nothing', amount: '0.00', payNow }

  if (result.action === 'charge') return { action: 'charge', amount: size, payNow }
  if (result.action === 'credit') return { action: 'credit', amount: size, payNow }

  return null
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

  if (cost.payNow === cost.amount) {
    return `You pay €${cost.amount} now — the difference for the rest of the period you have already paid for.`
  }

  return (
    `This works out at €${cost.amount} for the rest of the period you have already paid for, ` +
    `covered by the credit on your account. €${cost.payNow} leaves your card now.`
  )
}
