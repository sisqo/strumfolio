import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { arrangedLines, changeCostLine, changeReason, paddleAmountToEuro, readChangeCost, readSdkChangeCost, scheduledChangeLine } from './changePreview'
import type { ChangeCost } from './changePreview'

/* The real shape, copied from a sandbox preview of Standard monthly -> Plus monthly taken on
   2026-09-13. Kept verbatim rather than minimised: the fields this reads are the fields Paddle
   actually sends, and a hand-written object is where a mapping quietly stops matching. */
const CASE_A = {
  update_summary: {
    credit: { amount: '-349', currency_code: 'EUR' },
    charge: { amount: '699', currency_code: 'EUR' },
    result: { action: 'charge', amount: '350', currency_code: 'EUR' },
  },
  immediate_transaction: {
    details: {
      totals: { subtotal: '287', tax: '63', total: '350', credit: '0', grand_total: '350' },
      line_items: [
        { price_id: 'pri_plus_month', totals: { total: '699' } },
        { price_id: 'pri_standard_month', totals: { total: '-349' } },
      ],
    },
  },
}

describe('paddleAmountToEuro', () => {
  it('reads cents as euro, sign included', () => {
    assert.equal(paddleAmountToEuro('350'), '3.50')
    assert.equal(paddleAmountToEuro('9999'), '99.99')
    assert.equal(paddleAmountToEuro('-9985'), '-99.85')
    assert.equal(paddleAmountToEuro('5'), '0.05')
    assert.equal(paddleAmountToEuro('0'), '0.00')
  })

  /* A total this cannot read must reach the screen as "no amount", never as a number nobody
     was billed — `centsToEuro` makes the same argument about the payment history. */
  it('answers null for anything that is not an integer number of cents', () => {
    for (const raw of ['', '3.50', 'lots', '1e3', '--1', ' 350']) {
      assert.equal(paddleAmountToEuro(raw), null, JSON.stringify(raw))
    }
  })
})

describe('readChangeCost', () => {
  /* CASO A of the analysis document: the upgrade costs the prorated difference and nothing
     else. €6.99 for the rest of the period, less €3.49 of Standard not consumed, is €3.50. */
  it('reads a same-cycle upgrade as the prorated difference', () => {
    assert.deepEqual(readChangeCost(CASE_A), { action: 'charge', amount: '3.50', payNow: '3.50', credited: true })
  })

  /*
   * The other half of the same question, and the reason `payNow` is a separate field: an
   * account already carrying Paddle credit owes the same €3.50 and pays none of it today.
   * Printing only one of the two numbers is how somebody comes to believe they were billed
   * twice — or that the change was free.
   */
  /*
   * **A credit of zero is not a credit**, and Paddle sends one: measured 2026-09-14, a same-cycle
   * upgrade on a subscription that had already been moved between cycles twice came back
   * `credit: { amount: '0' }` with the full price charged — the earlier cycle change having
   * restarted a billing period that no invoice sits behind (`credited`'s own comment has the
   * mechanism, and the measurements that show a change of cycle crediting normally when nothing
   * has restarted the period). The sentence on the screen hangs off this, so a zero read as
   * «there was a credit» is a discount promised and not given.
   */
  it('reads a credit of zero as no credit at all', () => {
    const noCredit = {
      update_summary: {
        credit: { amount: '0', currency_code: 'EUR' },
        result: { action: 'charge', amount: '9999', currency_code: 'EUR' },
      },
      immediate_transaction: { details: { totals: { grand_total: '9999' } } },
    }

    assert.deepEqual(readChangeCost(noCredit), { action: 'charge', amount: '99.99', payNow: '99.99', credited: false })
  })

  it('keeps the price and the charge apart when credit covers the change', () => {
    const withCredit = {
      ...CASE_A,
      immediate_transaction: { details: { totals: { total: '350', credit: '350', grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(withCredit), { action: 'charge', amount: '3.50', payNow: '0.00', credited: true })
  })

  it('reads a downgrade as money coming back, never as a charge', () => {
    const down = {
      update_summary: { result: { action: 'credit', amount: '650', currency_code: 'EUR' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(down), { action: 'credit', amount: '6.50', payNow: '0.00', credited: false })
  })

  /* Paddle reports the size in `amount` and the direction in `action`. A negative `amount`
     alongside `action: 'credit'` is the same fact said twice, and this must not read it as
     minus-six-euros-fifty of charge. */
  it('takes the direction from `action`, not from the sign', () => {
    const signed = {
      update_summary: { result: { action: 'credit', amount: '-650' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(signed), { action: 'credit', amount: '6.50', payNow: '0.00', credited: false })
  })

  it('answers `nothing` rather than a zero charge', () => {
    const free = {
      update_summary: { result: { action: 'charge', amount: '0' } },
      immediate_transaction: { details: { totals: { grand_total: '0' } } },
    }
    assert.deepEqual(readChangeCost(free), { action: 'nothing', amount: '0.00', payNow: '0.00', credited: false })
    assert.deepEqual(readChangeCost({ immediate_transaction: null }), {
      credited: false,
      action: 'nothing',
      amount: '0.00',
      payNow: '0.00',
    })
  })

  /*
   * **Null is not zero**, and this is the test that keeps it that way. A preview this cannot
   * parse means the amount is unknown; printing «you pay nothing» there would be a claim about
   * somebody's card made from a parse failure.
   */
  it('answers null for a preview it cannot read, so nothing can print it as free', () => {
    for (const bad of [null, undefined, 'nope', 42, { update_summary: { result: { action: 'charge', amount: 350 } } }, { update_summary: { result: { action: 'refund', amount: '350' } } }]) {
      assert.equal(readChangeCost(bad), null, JSON.stringify(bad))
    }
  })
})

/**
 * The rename between the SDK's entity and Paddle's wire format, which is where a field went
 * missing for real: `credit` was left out of the object literal that used to sit inline in
 * `paddlePlanChange.ts`, so `credited` was false for every change the app ever previewed and the
 * screen could not say «the difference» whatever Paddle answered. Nothing failed — an absent
 * property is not a type error, and no other reader of that object exists.
 */
describe('readSdkChangeCost', () => {
  it('carries the credit across the rename', () => {
    const previewed = {
      updateSummary: {
        credit: { amount: '-349', currencyCode: 'EUR' },
        result: { action: 'charge', amount: '350', currencyCode: 'EUR' },
      },
      immediateTransaction: { details: { totals: { grandTotal: '350' } } },
    }

    assert.deepEqual(readSdkChangeCost(previewed), { action: 'charge', amount: '3.50', payNow: '3.50', credited: true })
  })

  it('reads a zero credit as no credit, exactly as the wire shape does', () => {
    const previewed = {
      updateSummary: {
        credit: { amount: '0', currencyCode: 'EUR' },
        result: { action: 'charge', amount: '9999', currencyCode: 'EUR' },
      },
      immediateTransaction: { details: { totals: { grandTotal: '9999' } } },
    }

    assert.deepEqual(readSdkChangeCost(previewed), {
      action: 'charge',
      amount: '99.99',
      payNow: '99.99',
      credited: false,
    })
  })

  /* `do_not_bill` previews carry neither, and «nothing to pay» is the right reading of that —
     not `null`, which the caller would turn into a refusal. */
  it('reads a change that bills nothing at all', () => {
    assert.deepEqual(readSdkChangeCost({ updateSummary: null, immediateTransaction: null }), {
      action: 'nothing',
      amount: '0.00',
      payNow: '0.00',
      credited: false,
    })
  })
})

describe('changeCostLine', () => {
  it('names the amount that leaves the card', () => {
    assert.equal(
      changeCostLine({ action: 'charge', amount: '3.50', payNow: '3.50', credited: true }),
      'You pay €3.50 now — the difference for the rest of the period you have already paid for.',
    )
  })

  it('says both numbers when credit covers the change', () => {
    const line = changeCostLine({ action: 'charge', amount: '3.50', payNow: '0.00', credited: true })
    assert.match(line, /€3\.50/)
    assert.match(line, /€0\.00 leaves your card/)
  })

  it('never says «you pay» for a change that gives money back', () => {
    const line = changeCostLine({ action: 'credit', amount: '6.50', payNow: '0.00', credited: true })
    assert.match(line, /pay nothing now/)
    assert.match(line, /€6\.50/)
  })

  /*
   * **An uncredited change is not a prorated one, and the sentence must not say it is.**
   * Measured against the sandbox on 2026-09-14: Standard yearly → Premium yearly on a
   * subscription whose cycle had been moved twice came back `credit: 0` / `charge: 9999`, while
   * the same change on a subscription bought minutes earlier came back €65.00. The totals look
   * exactly like each other, which is why this hangs off Paddle's own `credit` and not off the
   * two cycles — a change of cycle credits perfectly well on a fresh subscription (€96.50 of
   * €99.99, same day), and the rule behind the ones that credit nothing is only half known.
   * `credited`'s own comment has both halves.
   *
   * **What it must not say either is «a fresh period starts today»**, which is what it said
   * first: the uncredited case kept its renewal date to the second, so that sentence was a guess
   * about the calendar in place of a guess about the money. The date has a row of its own.
   */
  it('promises no difference where Paddle credited nothing', () => {
    const uncredited = changeCostLine({ action: 'charge', amount: '99.99', payNow: '99.99', credited: false })

    assert.equal(
      uncredited,
      'You pay €99.99 now — the full price of the new plan, with nothing credited for what is left of the old one.',
    )
    assert.doesNotMatch(uncredited, /difference/)
    assert.doesNotMatch(uncredited, /already paid for/)
    assert.doesNotMatch(uncredited, /fresh period/)
  })

  it('still says both numbers when account credit partly covers an uncredited change', () => {
    const line = changeCostLine({ action: 'charge', amount: '99.99', payNow: '90.33', credited: false })

    assert.match(line, /full price of the new plan/)
    assert.doesNotMatch(line, /fresh period/)
    assert.match(line, /€90\.33 leaves your card/)
  })
})

/**
 * `do_not_bill` produces no `update_summary` and no immediate transaction at all, so the cost
 * reader answers `nothing` — true, and on its own the wrong thing to show somebody who has just
 * arranged to lose a plan on a particular day.
 */
describe('scheduledChangeLine', () => {
  it('says what is kept, until when, and what comes after', () => {
    const line = scheduledChangeLine('Premium', 'Standard', '13 October 2026')

    assert.match(line, /Nothing to pay now/)
    assert.match(line, /keep Premium until 13 October 2026/)
    assert.match(line, /move to Standard/)
  })

  it('is not what a change with no date says', () => {
    assert.equal(
      changeCostLine({ action: 'nothing', amount: '0.00', payNow: '0.00', credited: false }),
      'There is nothing to pay for this change.',
    )
  })
})

/**
 * The pair, asserted as a pair. `changeReason` says what `changeCostLine` says without the
 * figure, and the risk is not that either is badly worded — it is that one is edited and the
 * other is not, which no assertion about a single wording would catch.
 */
describe('changeReason', () => {
  it('drops the figure the stop already hangs beside it', () => {
    const cost: ChangeCost = { action: 'charge', amount: '96.51', payNow: '96.51', credited: true }

    assert.match(changeCostLine(cost), /€96\.51/)
    assert.doesNotMatch(changeReason(cost) ?? '', /96\.51/)
    assert.equal(changeReason(cost), 'You pay the difference for the rest of the period you have already paid for.')
  })

  /* The same asymmetry the sentence beside it lives under: «the difference» is Paddle's word,
     not ours, and promising it where nothing was credited is a discount that never appears. */
  it('promises no difference where Paddle credited nothing', () => {
    const uncredited = changeReason({ action: 'charge', amount: '99.99', payNow: '99.99', credited: false })

    assert.equal(
      uncredited,
      'You pay the full price of the new plan, with nothing credited for what is left of the old one.',
    )
    assert.doesNotMatch(uncredited ?? '', /difference/)
  })

  /* Both functions have to branch on `credited` the same way round — which is the one thing
     that could be reversed in an edit and read perfectly well. */
  it('agrees with the sentence about whether there was a difference', () => {
    for (const credited of [true, false]) {
      const cost: ChangeCost = { action: 'charge', amount: '10.00', payNow: '10.00', credited }
      const saysDifference = /the difference/.test(changeCostLine(cost))
      assert.equal(/the difference/.test(changeReason(cost) ?? ''), saysDifference, String(credited))
    }
  })

  /*
   * The stop hangs `payNow`; the deal is `amount`. Naming the wrong one of those two is the
   * mistake this test exists for — an account with credit pays €10.33 on a change that costs
   * €96.51, and «€96.51 is covered by the credit» would be false by the whole amount.
   */
  it('names the size of the deal, not the part the credit covered', () => {
    const line = changeReason({ action: 'charge', amount: '96.51', payNow: '10.33', credited: true }) ?? ''

    assert.match(line, /works out at €96\.51/)
    assert.doesNotMatch(line, /€10\.33/)
  })

  /* Money coming back reads as money coming back in both, never as a charge. */
  it('says what a credit does', () => {
    const line = changeReason({ action: 'credit', amount: '6.50', payNow: '0.00', credited: true }) ?? ''
    assert.match(line, /€6\.50 of what you have already paid comes back/)
  })

  /* Nothing to pay needs no sentence: the stop's own «Nothing» is the whole fact, and a line
     under it restating that is one the reader has to read to learn nothing. */
  it('says nothing at all when there is nothing to explain', () => {
    assert.equal(changeReason({ action: 'nothing', amount: '0.00', payNow: '0.00', credited: false }), null)
  })
})

/**
 * The sentence after the press. It is read where the reader can check it against a statement,
 * so what it promises has to be what happened.
 */
describe('arrangedLines', () => {
  const linesOf = (over: Partial<Parameters<typeof arrangedLines>[0]> = {}) =>
    arrangedLines({
      direction: 'upgrade',
      when: 'now',
      on: null,
      credited: true,
      target: 'Premium',
      keep: 'Premium, billed yearly',
      names: { from: 'Premium', to: 'Standard' },
      ...over,
    })

  it('leads with the plan and explains the money underneath', () => {
    assert.deepEqual(linesOf(), {
      lead: 'Moving you to Premium.',
      body: 'What you have not used of your old plan comes off the charge, and the new plan appears in a moment.',
    })
  })

  /*
   * **`when` is read before `direction`, and B7 is why.** A change that waits can be a rise in
   * tier — moving onto monthly billing while a year is paid for — so a direction-first branch
   * would tell somebody who was charged nothing that their unused time came off a charge.
   */
  it('reads a change that waits as a date, whichever direction it is', () => {
    for (const direction of ['upgrade', 'downgrade'] as const) {
      const lines = linesOf({ direction, when: 'period-end', on: '13 October 2026' })

      assert.equal(lines.lead, 'You keep Premium until 13 October 2026.')
      assert.match(lines.body, /Nothing has been charged\./)
      assert.match(lines.body, /Standard starts that day\./)
      assert.doesNotMatch(lines.body, /comes off the charge/)
    }
  })

  /* A waiting change with no date has nothing to promise a day against, so it falls back to
     describing the money rather than printing a sentence with a hole in it. */
  it('does not claim a day Paddle did not send', () => {
    const lines = linesOf({ when: 'period-end', on: null })
    assert.equal(lines.lead, 'Moving you to Premium.')
  })

  /* The same correction `changeCostLine` and `changeReason` carry, one press later: where
     Paddle credited nothing, «comes off the charge» is a reduction the invoice will not show. */
  it('promises no credit where Paddle gave none', () => {
    const lines = linesOf({ credited: false })

    assert.equal(lines.lead, 'Moving you to Premium.')
    assert.match(lines.body, /full price of the new plan/)
    assert.doesNotMatch(lines.body, /comes off the charge/)
    assert.doesNotMatch(lines.body, /credited against your next invoice/)
  })

  it('reads a call-off as nothing moving at all', () => {
    const lines = linesOf({ direction: 'revert' })

    assert.match(lines.lead, /^Kept — you stay on Premium, billed yearly\./)
    assert.match(lines.body, /called off/)
    assert.doesNotMatch(lines.lead, /Moving you/)
  })

  /* An immediate drop in tier gives money back rather than taking it, and must not borrow the
     upgrade's sentence about a charge. */
  it('says money coming back on an immediate drop', () => {
    assert.match(linesOf({ direction: 'downgrade' }).body, /credited against your next invoice/)
  })
})
