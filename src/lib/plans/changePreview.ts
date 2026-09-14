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
   * credited for what was paid. Measured 2026-09-14 on one sandbox subscription within fifteen
   * minutes: Plus monthly → Premium monthly on an untouched period billed `−699` credit against
   * `+999`, i.e. €3.00; the same subscription after two cycle changes billed the whole `9999`.
   *
   * The totals look identical either way, which is exactly why this is read from Paddle rather
   * than guessed here — and why the guess that preceded it (does the cycle move?) got the
   * commonest case backwards.
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
   * all. What is actually true of every uncredited change is the money, so that is all this
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
