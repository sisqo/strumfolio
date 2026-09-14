import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ChangeCost } from './changePreview'
import { changeStops, changeSummary, nextChargeOf } from './changeSummary'

const nothing: ChangeCost = { action: 'nothing', amount: '0.00', payNow: '0.00', credited: false }
const charged: ChangeCost = { action: 'charge', amount: '3.50', payNow: '3.50', credited: true }

const value = (summary: { rows: { label: string; value: string }[] }, label: string) =>
  summary.rows.find((row) => row.label === label)?.value ?? null

const summaryOf = (over: Partial<Parameters<typeof changeSummary>[0]> = {}) =>
  changeSummary({
    from: { plan: 'premium', cycle: 'year', label: 'Premium, billed yearly' },
    to: { plan: 'standard', cycle: 'year' },
    direction: 'downgrade',
    when: 'period-end',
    effectiveAt: '2027-09-13T00:00:00.000Z',
    cost: nothing,
    nextCharge: { amount: '34.99', on: '2027-09-13T00:00:00.000Z', cycle: 'year', source: 'listino' },
    arranged: null,
    headline: 'Nothing to pay now.',
    ...over,
  })

/**
 * Where the next charge comes from, which is the one thing in this feature that can be
 * confidently wrong rather than merely missing.
 */
describe('nextChargeOf', () => {
  /*
   * **The pinned case, and the reason this function exists.** Paddle's preview describes the
   * subscription as the *first* call would leave it — with the period restarted a year out,
   * because a change of frequency restarts it even under `do_not_bill`. This app then puts the
   * date back with a second call Paddle has not been asked about, so quoting the preview here
   * would tell a reader their next bill is eleven months later than it is.
   */
  it('ignores Paddle entirely when a second call is about to move the date', () => {
    const next = nextChargeOf({
      to: { plan: 'plus', cycle: 'month' },
      pinBillingDate: true,
      effectiveAt: '2027-09-13T00:00:00.000Z',
      fromPaddle: { total: '6999', startsAt: '2028-09-13T00:00:00.000Z' },
    })

    assert.deepEqual(next, {
      amount: '6.99',
      on: '2027-09-13T00:00:00.000Z',
      cycle: 'month',
      source: 'listino',
    })
  })

  /* And where no second call is coming, Paddle's own answer is the whole truth — a period left
     alone by `do_not_bill`, or one deliberately restarted by an immediate upgrade. */
  it('takes Paddle’s answer whenever Paddle is the one who knows', () => {
    const next = nextChargeOf({
      to: { plan: 'standard', cycle: 'year' },
      pinBillingDate: false,
      effectiveAt: '2027-09-13T00:00:00.000Z',
      fromPaddle: { total: '3499', startsAt: '2027-09-13T00:00:00.000Z' },
    })

    assert.deepEqual(next, {
      amount: '34.99',
      on: '2027-09-13T00:00:00.000Z',
      cycle: 'year',
      source: 'paddle',
    })
  })

  /* Nothing to promise is a row that is not drawn. Zero would be a claim that the next invoice
     is free, which is `readChangeCost`'s own asymmetry pointed at a different field. */
  it('answers null rather than inventing a charge it cannot read', () => {
    const base = { to: { plan: 'plus', cycle: 'month' } as const, effectiveAt: '2027-09-13T00:00:00.000Z' }

    assert.equal(nextChargeOf({ ...base, pinBillingDate: false, fromPaddle: null }), null)
    assert.equal(
      nextChargeOf({ ...base, pinBillingDate: false, fromPaddle: { total: 'soon', startsAt: '2027-09-13T00:00:00.000Z' } }),
      null,
    )
    assert.equal(
      nextChargeOf({ ...base, pinBillingDate: false, fromPaddle: { total: '699', startsAt: 'never' } }),
      null,
    )
    /* A pinned change with no date is refused upstream; this is the brace to that belt. */
    assert.equal(nextChargeOf({ ...base, pinBillingDate: true, effectiveAt: null, fromPaddle: null }), null)
  })
})

describe('changeSummary', () => {
  it('says what is held, what it becomes, when, and what is paid — today and next', () => {
    const summary = summaryOf()

    assert.equal(value(summary, 'Today you are on'), 'Premium, billed yearly')
    assert.equal(value(summary, 'You move to'), 'Standard, billed yearly')
    assert.equal(value(summary, 'Takes effect'), '13 September 2027')
    assert.equal(value(summary, 'You pay today'), 'Nothing')
    assert.equal(value(summary, 'Next charge'), '€34.99 every year, from 13 September 2027')
  })

  /*
   * **The row that was the whole point.** Every waiting change costs nothing today, so a screen
   * that reports only the immediate cost tells a reader the same thing about a move to Standard
   * and a move to Plus. What separates them is the next invoice.
   */
  it('names an amount today when there is one', () => {
    const summary = summaryOf({ to: { plan: 'plus', cycle: 'year' }, direction: 'upgrade', when: 'now', effectiveAt: null, cost: charged })

    assert.equal(value(summary, 'Takes effect'), 'Straight away')
    assert.equal(value(summary, 'You pay today'), '€3.50')
  })

  /*
   * A revert is not a move and must not be drawn as one: the target *is* the plan already paid
   * for, so a «Today you are on / You move to» pair would print the same plan twice and
   * describe the opposite of what the press does.
   */
  it('draws a revert as a change being called off, not as a move', () => {
    const summary = summaryOf({
      to: { plan: 'premium', cycle: 'year' },
      direction: 'revert',
      when: 'now',
      effectiveAt: null,
      headline: 'Nothing to pay.',
    })

    assert.equal(value(summary, 'You stay on'), 'Premium, billed yearly')
    assert.equal(value(summary, 'You move to'), null)
    assert.equal(value(summary, 'Takes effect'), null)
    /* Named, not merely marked: «Called off» on its own arrived above the row that said what it
       referred to, and a reader met a verdict about nothing. */
    assert.equal(value(summary, 'Being called off'), 'The change you had arranged')
    /* And the arranged change is not also repeated at the foot, where it would be the same
       sentence twice on one short table. */
    const named = summaryOf({
      to: { plan: 'premium', cycle: 'year' }, direction: 'revert', when: 'now', effectiveAt: null,
      arranged: 'You are already moving to Standard on 13 September 2027.', headline: 'Nothing to pay.',
    })
    assert.equal(value(named, 'Being called off'), 'You are already moving to Standard on 13 September 2027.')
    assert.equal(value(named, 'Already arranged'), null)
  })

  /*
   * **A date that cannot be read must never become «Straight away»**, which is the opposite of
   * what a waiting change does and the one mistake here that would read as a plan taken away
   * early. `formatPlanDate` on an unparseable date prints «Invalid Date», which is how this
   * would otherwise surface.
   */
  it('never reports a waiting change as immediate, whatever the date says', () => {
    const summary = summaryOf({ effectiveAt: 'the end of the year' })

    assert.equal(value(summary, 'Takes effect'), 'At the end of the period you have paid for')
  })

  it('carries a change already arranged into the summary — case C6', () => {
    const summary = summaryOf({ arranged: 'You are already moving to Standard on 13 September 2027.' })

    assert.equal(value(summary, 'Already arranged'), 'You are already moving to Standard on 13 September 2027.')
  })

  /*
   * **Both sides of the pair are complete**, which is the opposite of what `changeNames` does
   * for a sentence and right for a table: two rows read side by side, and «Today you are on
   * Premium» over «You move to Standard» hides that the billing is moving as well.
   */
  it('names the billing on both sides, even where a sentence would say it once', () => {
    const summary = summaryOf({ to: { plan: 'standard', cycle: 'month' } })

    assert.equal(value(summary, 'Today you are on'), 'Premium, billed yearly')
    assert.equal(value(summary, 'You move to'), 'Standard, billed monthly')
  })

  /* The headline is chosen by the caller and passed through untouched: the three sentences this
     screen may say live in `changePreview.ts`, each with its own argument, and a summary that
     reworded them would be a second copy of the copy. */
  it('passes the headline through rather than writing one', () => {
    assert.equal(summaryOf({ headline: 'Anything at all.' }).headline, 'Anything at all.')
  })

  /* No next charge is no row, never a row saying nothing — the same rule as the amount. */
  it('draws no next-charge row when there is nothing to promise', () => {
    assert.equal(value(summaryOf({ nextCharge: null }), 'Next charge'), null)
  })
})

/**
 * The calendar the checkout draws, and the case the mock did not cover.
 */
describe('changeStops', () => {
  const stopsOf = (over: Partial<Parameters<typeof changeStops>[0]> = {}) =>
    changeStops({
      from: { plan: 'Standard', label: 'Standard, billed monthly' },
      to: 'Premium',
      direction: 'upgrade',
      when: 'now',
      effectiveAt: null,
      cost: { action: 'charge', amount: '96.51', payNow: '96.51', credited: true },
      nextCharge: { amount: '99.99', on: '2027-09-14T00:00:00.000Z', cycle: 'year', source: 'paddle' },
      reason: 'You pay the difference for the rest of the period you have already paid for.',
      ...over,
    })

  it('draws an immediate change as today and the renewal', () => {
    const stops = stopsOf()

    assert.equal(stops.length, 2)
    assert.equal(stops[0]?.when, 'Today')
    assert.equal(stops[0]?.title, 'Premium starts')
    assert.equal(stops[0]?.amount, '€96.51')
    assert.match(stops[0]?.note ?? '', /^Standard, billed monthly ends now\./)
    assert.equal(stops[1]?.title, 'Renews, then every year')
    assert.equal(stops[1]?.amount, '€99.99')
  })

  /*
   * **The case the mock does not draw, and the one this function exists for.** A `do_not_bill`
   * downgrade starts nothing today and charges nothing, so the first stop must not say «Standard
   * starts» — it says the plan they have is still theirs, and hangs «Nothing» beside it. Losing
   * that stop altogether would leave the card describing only what happens in eleven months.
   */
  it('makes today a stop on a change that waits, and says nothing is taken', () => {
    const stops = stopsOf({
      direction: 'downgrade',
      when: 'period-end',
      from: { plan: 'Premium', label: 'Premium, billed yearly' },
      to: 'Standard',
      effectiveAt: '2027-09-14T00:00:00.000Z',
      cost: { action: 'nothing', amount: '0.00', payNow: '0.00', credited: false },
      nextCharge: { amount: '34.99', on: '2027-09-14T00:00:00.000Z', cycle: 'year', source: 'listino' },
      reason: null,
    })

    assert.equal(stops.length, 2)
    assert.equal(stops[0]?.title, 'Premium stays yours')
    assert.equal(stops[0]?.amount, 'Nothing')
    assert.match(stops[0]?.note ?? '', /Nothing is charged now/)
    assert.doesNotMatch(stops[0]?.title ?? '', /starts/)

    /* And the second stop carries both facts, because for a waiting change they are the same
       day: the new plan starting and the first charge at its price. */
    assert.equal(stops[1]?.when, '14 September 2027')
    assert.equal(stops[1]?.title, 'Standard starts, then every year')
    assert.equal(stops[1]?.amount, '€34.99')
  })

  /* A revert takes nothing away and starts nothing: the plan simply carries on, which is the
     whole of what the press does, so neither stop may say a plan «starts». */
  it('reads a call-off as the plan carrying on', () => {
    const stops = stopsOf({
      direction: 'revert',
      from: { plan: 'Premium', label: 'Premium, billed yearly' },
      to: 'Premium',
      cost: { action: 'nothing', amount: '0.00', payNow: '0.00', credited: false },
    })

    assert.equal(stops[0]?.title, 'Premium stays yours')
    assert.equal(stops[0]?.amount, 'Nothing')
    assert.match(stops[0]?.note ?? '', /called off/)
    assert.equal(stops[1]?.title, 'Renews, then every year')
  })

  /*
   * A dated row with no figure would read as a charge of unknown size, which is worse than no
   * row — the same rule `nextChargeOf` follows in deciding to answer null at all.
   */
  it('draws no second stop where there is no next charge to promise', () => {
    assert.equal(stopsOf({ nextCharge: null }).length, 1)
    assert.equal(
      stopsOf({ nextCharge: { amount: '99.99', on: 'not a date', cycle: 'year', source: 'paddle' } }).length,
      1,
    )
  })

  /* The note is handed in rather than written here, so a cost with nothing to explain simply
     leaves the sentence off instead of printing an empty one. */
  it('leaves the note to the sentence it was given, and omits it when there is none', () => {
    const stops = stopsOf({ reason: null })
    assert.equal(stops[0]?.note, 'Standard, billed monthly ends now.')
  })
})

/**
 * The title and the leading figure, both new with `Checkout.dc.html` and both here rather than
 * in the dialog — the rule this file opens with.
 */
describe('what the confirmation is called', () => {
  it('names the change rather than the act of changing', () => {
    assert.equal(
      summaryOf({ from: { plan: 'premium', cycle: 'year', label: 'Premium, billed yearly' }, to: { plan: 'standard', cycle: 'year' } }).title,
      'Switching Premium to Standard',
    )
  })

  /*
   * **B4 is why this uses `changeNames`.** Premium yearly to Premium monthly changes the
   * billing and nothing else, and «Switching Premium to Premium» is a title about no change at
   * all on the one screen whose job is to describe the change.
   */
  it('names the billing when the billing is what moves', () => {
    const summary = summaryOf({
      from: { plan: 'premium', cycle: 'year', label: 'Premium, billed yearly' },
      to: { plan: 'premium', cycle: 'month' },
    })

    assert.equal(summary.title, 'Switching yearly billing to monthly billing')
  })

  it('says what a call-off is instead of naming a move', () => {
    const summary = summaryOf({ direction: 'revert' })

    assert.equal(summary.title, 'Calling off the change you arranged')
    assert.doesNotMatch(summary.title, /Switching/)
  })

  /* The figure is set above the title and listed in the rows, so the two must come from one
     value — a reader checking the list against the headline is checking the same number. */
  it('sets the same figure above the list as inside it', () => {
    const paid = summaryOf({ cost: charged })
    assert.equal(paid.payToday, '€3.50')
    assert.equal(value(paid, 'You pay today'), '€3.50')

    const free = summaryOf({ cost: nothing })
    assert.equal(free.payToday, 'Nothing')
    assert.equal(value(free, 'You pay today'), 'Nothing')
  })
})
