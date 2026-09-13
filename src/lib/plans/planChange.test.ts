import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LivePaddleSubscription, NoLiveSubscription } from './paddleAccount'
import { checkoutMode, planChangeEffect } from './planChange'
import { PAID_PLANS } from './prices'
import { PLAN_RANK } from './types'

describe('planChangeEffect', () => {
  it('bills an upgrade at once, and holds a downgrade of tier to the end of the period', () => {
    assert.deepEqual(planChangeEffect({ plan: 'standard', cycle: 'year' }, { plan: 'premium', cycle: 'year' }), {
      ok: true,
      direction: 'upgrade',
      proration: 'prorated_immediately',
      when: 'now',
      pinBillingDate: false,
    })
    /* B2. `do_not_bill` charges and credits nothing, which is the point: the period is already
       paid at the old price and the reader keeps the plan it bought until it runs out. */
    assert.deepEqual(planChangeEffect({ plan: 'premium', cycle: 'year' }, { plan: 'standard', cycle: 'year' }), {
      ok: true,
      direction: 'downgrade',
      proration: 'do_not_bill',
      when: 'period-end',
      pinBillingDate: false,
    })
  })

  /* Every ordered pair of paid plans, so a plan added to the middle of the rank cannot
     quietly become its own upgrade. */
  it('agrees with PLAN_RANK on every pair of paid plans', () => {
    for (const from of PAID_PLANS) {
      for (const to of PAID_PLANS) {
        const effect = planChangeEffect({ plan: from, cycle: 'year' }, { plan: to, cycle: 'year' })
        if (from === to) {
          assert.deepEqual(effect, { ok: false, reason: 'same' })
          continue
        }
        assert.equal(
          effect.ok && effect.direction,
          PLAN_RANK[to] > PLAN_RANK[from] ? 'upgrade' : 'downgrade',
          `${from} -> ${to}`,
        )
      }
    }
  })

  /*
   * **B8, and the trap this function exists to avoid.** Comparing what each row *costs per
   * period* would read this as a rise — €9.99 becomes €34.99 — and take the money on the spot
   * for a move the reader made to spend less. It waits like every other drop in tier: decided
   * on 2026-09-13 against the analysis document's own proposal, which was to bill the year at
   * once because the cash arrives sooner.
   */
  it('makes premium/month to standard/year wait, though it bills more per period', () => {
    const effect = planChangeEffect({ plan: 'premium', cycle: 'month' }, { plan: 'standard', cycle: 'year' })
    assert.deepEqual(effect, {
      ok: true,
      direction: 'downgrade',
      proration: 'do_not_bill',
      when: 'period-end',
      pinBillingDate: true,
    })
  })

  /* B6 — both dimensions down at once, which is the same rule twice and no new branch. */
  it('makes a drop in tier and cycle together wait, and pins the date', () => {
    assert.deepEqual(planChangeEffect({ plan: 'premium', cycle: 'year' }, { plan: 'standard', cycle: 'month' }), {
      ok: true,
      direction: 'downgrade',
      proration: 'do_not_bill',
      when: 'period-end',
      pinBillingDate: true,
    })
  })

  /*
   * The rule stated as a rule rather than case by case: **nothing that lowers the tier is ever
   * billed immediately, whatever the cycle does.** Written as a sweep so a later branch cannot
   * quietly reintroduce an immediate downgrade for one combination out of six.
   *
   * Its `pinBillingDate` assertion is deliberately weak and must not be read as protecting that
   * rule: with no `pendingDowngrade` in the fixture the items' cycle *is* the paid cycle, so the
   * expectation restates the implementation. The case that actually bites — the pin measured
   * against the items rather than against what was paid — is «pins the date when the items, not
   * the paid plan, change frequency» below, which is therefore not redundant with this.
   */
  it('never bills a drop in tier now, in any combination of cycles', () => {
    for (const from of PAID_PLANS) {
      for (const to of PAID_PLANS) {
        if (PLAN_RANK[to] >= PLAN_RANK[from]) continue
        for (const fromCycle of ['year', 'month'] as const) {
          for (const toCycle of ['year', 'month'] as const) {
            const effect = planChangeEffect({ plan: from, cycle: fromCycle }, { plan: to, cycle: toCycle })
            assert.deepEqual(
              effect,
              {
                ok: true,
                direction: 'downgrade',
                proration: 'do_not_bill',
                when: 'period-end',
                pinBillingDate: fromCycle !== toCycle,
              },
              `${from}/${fromCycle} -> ${to}/${toCycle}`,
            )
          }
        }
      }
    }
  })

  it('treats yearly as the upgrade when only the cycle moves', () => {
    assert.deepEqual(planChangeEffect({ plan: 'plus', cycle: 'month' }, { plan: 'plus', cycle: 'year' }), {
      ok: true,
      direction: 'upgrade',
      proration: 'prorated_immediately',
      when: 'now',
      pinBillingDate: false,
    })
  })

  /*
   * **B4.** A year has been paid for; going monthly must not take any of it away. Nothing is
   * billed, the change waits for the last day of the year, and `pinBillingDate` is the half
   * that is invisible from the outside: a change of *frequency* restarts the billing period
   * even under `do_not_bill`, so without a second call putting the date back the reader would
   * be charged again next month and lose the rest of the year they had bought.
   */
  it('holds a year-to-month move to the end of the year, and pins the billing date', () => {
    assert.deepEqual(planChangeEffect({ plan: 'plus', cycle: 'year' }, { plan: 'plus', cycle: 'month' }), {
      ok: true,
      direction: 'downgrade',
      proration: 'do_not_bill',
      when: 'period-end',
      pinBillingDate: true,
    })
  })

  /* An update with the items it already carries still prorates zero, still fires an event and
     still writes a receipt for nothing. */
  it('refuses a change that changes nothing', () => {
    for (const cycle of ['year', 'month'] as const) {
      assert.deepEqual(planChangeEffect({ plan: 'plus', cycle }, { plan: 'plus', cycle }), {
        ok: false,
        reason: 'same',
      })
    }
  })

  /*
   * Lifetime is not a recurring price, so `subscriptions.update` cannot take it and the
   * subscription would go on billing beside a plan bought for ever. The two sides are told
   * apart because the screen has different things to say about them.
   */
  it('refuses Lifetime on both sides, and says which side', () => {
    assert.deepEqual(planChangeEffect({ plan: 'premium', cycle: 'year' }, { plan: 'lifetime', cycle: null }), {
      ok: false,
      reason: 'lifetime-target',
    })
    assert.deepEqual(planChangeEffect({ plan: 'lifetime', cycle: null }, { plan: 'premium', cycle: 'year' }), {
      ok: false,
      reason: 'lifetime-live',
    })
  })

  /*
   * Everything below is decided against the plan that was **paid for**, never against Paddle's
   * items — which, while a downgrade is arranged, already carry the cheaper plan. That is the
   * whole reason `LiveSubscribedTo` exists, and getting it wrong charges somebody a second time
   * for a period they have already paid in full.
   */
  describe('with a downgrade already arranged', () => {
    const premium = { plan: 'premium', cycle: 'month' } as const
    const pending = { ...premium, pendingDowngrade: { plan: 'standard', cycle: 'month' } } as const

    /* C1/C3, the change of mind. Asking for the plan you are paying for is the no-op B11 when
       nothing is scheduled and the exact opposite when something is: the items have to go back,
       and nothing is billed for putting them there. */
    it('reads a return to the paid plan as a revert, not as an upgrade', () => {
      assert.deepEqual(planChangeEffect(pending, premium), {
        ok: true,
        direction: 'revert',
        proration: 'do_not_bill',
        when: 'now',
        pinBillingDate: false,
      })
      assert.deepEqual(planChangeEffect(premium, premium), { ok: false, reason: 'same' })
    })

    /* C2: last one wins, and it is stamped from the paid plan again, so two downgrades in a row
       cannot compound into a date or a plan nobody chose. */
    it('replaces one arranged downgrade with another', () => {
      assert.deepEqual(planChangeEffect(pending, { plan: 'plus', cycle: 'month' }), {
        ok: true,
        direction: 'downgrade',
        proration: 'do_not_bill',
        when: 'period-end',
        pinBillingDate: false,
      })
    })

    /*
     * **The pin is measured against what Paddle *carries*, not against what was paid.** This
     * reader paid yearly and has already arranged to go monthly, so Paddle's items are monthly;
     * asking now for a cheaper tier on the *yearly* price moves the frequency back, which
     * restarts the period — and the date has to be pinned even though the paid cycle and the
     * target cycle are the same. Reading `from.cycle` here would lose the paid year at the
     * second press, silently.
     */
    it('pins the date when the items, not the paid plan, change frequency', () => {
      const goingMonthly = { plan: 'premium', cycle: 'year', pendingDowngrade: { plan: 'premium', cycle: 'month' } } as const

      assert.deepEqual(planChangeEffect(goingMonthly, { plan: 'standard', cycle: 'year' }), {
        ok: true,
        direction: 'downgrade',
        proration: 'do_not_bill',
        when: 'period-end',
        pinBillingDate: true,
      })
      /* And undoing that arranged change is itself a change of frequency. */
      assert.deepEqual(planChangeEffect(goingMonthly, { plan: 'premium', cycle: 'year' }), {
        ok: true,
        direction: 'revert',
        proration: 'do_not_bill',
        when: 'now',
        pinBillingDate: true,
      })
    })

    /* A change that bills nothing has no figure to get wrong, so it is allowed to replace what
       is arranged — where a priced one is refused. B4 over a pending tier downgrade. */
    it('allows a free change of cycle over something already arranged', () => {
      const effect = planChangeEffect(
        { plan: 'premium', cycle: 'year', pendingDowngrade: { plan: 'standard', cycle: 'year' } },
        { plan: 'premium', cycle: 'month' },
      )
      assert.deepEqual(effect, {
        ok: true,
        direction: 'downgrade',
        proration: 'do_not_bill',
        when: 'period-end',
        pinBillingDate: true,
      })
    })

    /*
     * **Not `same`**, which would be a different sentence about a different fact. This reader is
     * on Premium until the date; telling them on Standard's own checkout that Standard is «the
     * plan you are already on» describes a downgrade that has not happened yet as one that has.
     */
    it('refuses to arrange the same downgrade twice, and does not call it «same»', () => {
      assert.deepEqual(planChangeEffect(pending, { plan: 'standard', cycle: 'month' }), {
        ok: false,
        reason: 'already-scheduled',
      })
    })

    /*
     * **The refusal is about the figure, not about the change.** Paddle would price a move
     * against the items — the cheaper plan — while the two calls that would actually run credit
     * the dearer one that was paid for, so the amount shown and the amount charged would
     * differ. That applies to exactly the two priced moves: going up a tier, and going yearly.
     * Calling the arranged change off first is one press, and prices honestly.
     */
    it('refuses the two priced moves until the arranged change is called off', () => {
      /* B3 from a paid monthly plan: yearly is billed now, so it has a figure to get wrong. */
      assert.deepEqual(planChangeEffect(pending, { plan: 'premium', cycle: 'year' }), {
        ok: false,
        reason: 'pending-downgrade',
      })
      /* C1: an upgrade of tier. */
      assert.deepEqual(planChangeEffect({ ...pending, plan: 'plus' }, { plan: 'premium', cycle: 'month' }), {
        ok: false,
        reason: 'pending-downgrade',
      })
    })

    /* And the mirror of it: a move that bills nothing has no figure to get wrong, so it simply
       replaces what stands — whichever dimension it moves. */
    it('lets any free change replace what is arranged', () => {
      for (const to of [
        { plan: 'standard', cycle: 'month' },
        { plan: 'standard', cycle: 'year' },
        { plan: 'premium', cycle: 'month' },
      ] as const) {
        const effect = planChangeEffect({ ...pending, pendingDowngrade: { plan: 'plus', cycle: 'month' } }, to)
        assert.equal(effect.ok && effect.proration, 'do_not_bill', `${to.plan}/${to.cycle}`)
      }
    })
  })

  /* A live subscription is never `free` — that is the shape of having none — and a cycle that
     cannot be read is a catalogue this app does not recognise. Neither is a direction. */
  it('refuses free and a missing cycle rather than guessing a direction', () => {
    assert.deepEqual(planChangeEffect({ plan: 'free', cycle: 'year' }, { plan: 'plus', cycle: 'year' }), {
      ok: false,
      reason: 'unreadable',
    })
    assert.deepEqual(planChangeEffect({ plan: 'plus', cycle: null }, { plan: 'premium', cycle: 'year' }), {
      ok: false,
      reason: 'unreadable',
    })
  })
})

/** One live subscription, so `checkoutMode`'s one positive case reads as a sentence. */
function liveSubscription(): LivePaddleSubscription {
  return {
    ok: true,
    id: 'sub_1',
    plan: 'plus',
    cycle: 'year',
    pendingDowngrade: null,
    periodEndsAt: new Date('2027-01-01T00:00:00Z'),
    scheduledChange: false,
    customData: { account_id: 1 },
    accountId: 1,
  }
}

describe('checkoutMode', () => {
  it('sells to somebody who has never subscribed, and to somebody whose subscription ended', () => {
    for (const reason of ['no-subscription', 'gone'] as const) {
      assert.equal(checkoutMode({ ok: false, reason }), 'sell')
    }
  })

  it('changes the plan of a live subscription', () => {
    assert.equal(checkoutMode(liveSubscription()), 'change')
  })

  /*
   * The expensive half. Each of these means something may still be billing, and a checkout
   * opened beside it is a second subscription nobody asked for — the exact shape of the defect
   * this branch was added to close, arrived at from the other direction.
   */
  it('offers nothing while anything may still be running', () => {
    for (const reason of ['not-live', 'unexpected-items', 'unreadable'] as const) {
      assert.equal(checkoutMode({ ok: false, reason }), 'stalled', reason)
    }
  })

  /*
   * A reason added later defaults to `stalled`, never to `sell`. Stated as a test rather than
   * trusted to whoever adds it: the switch is written so the two selling reasons are named and
   * everything else falls through, and this is what holds that shape in place.
   */
  it('refuses to sell on a reason nobody has thought about yet', () => {
    const invented = 'something-new' as NoLiveSubscription
    const live: LivePaddleSubscription = { ok: false, reason: invented }
    assert.equal(checkoutMode(live), 'stalled')
  })
})
