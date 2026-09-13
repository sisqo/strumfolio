import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { LivePaddleSubscription, NoLiveSubscription } from './paddleAccount'
import { checkoutMode, planChangeEffect } from './planChange'
import { PAID_PLANS } from './prices'
import { PLAN_RANK } from './types'

describe('planChangeEffect', () => {
  it('bills an upgrade at once and credits a downgrade on the next invoice', () => {
    assert.deepEqual(planChangeEffect({ plan: 'standard', cycle: 'year' }, { plan: 'premium', cycle: 'year' }), {
      ok: true,
      direction: 'upgrade',
      proration: 'prorated_immediately',
    })
    assert.deepEqual(planChangeEffect({ plan: 'premium', cycle: 'year' }, { plan: 'standard', cycle: 'year' }), {
      ok: true,
      direction: 'downgrade',
      proration: 'prorated_next_billing_period',
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
   * The trap this function exists to avoid. Comparing what each row *costs per period* would
   * read this as a rise — €9.99 becomes €34.99 — and take the money on the spot for a move
   * the reader made to spend less.
   */
  it('reads premium/month to standard/year as a downgrade, though it bills more per period', () => {
    const effect = planChangeEffect({ plan: 'premium', cycle: 'month' }, { plan: 'standard', cycle: 'year' })
    assert.deepEqual(effect, { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period' })
  })

  it('treats yearly as the upgrade when only the cycle moves', () => {
    assert.deepEqual(planChangeEffect({ plan: 'plus', cycle: 'month' }, { plan: 'plus', cycle: 'year' }), {
      ok: true,
      direction: 'upgrade',
      proration: 'prorated_immediately',
    })
    const back = planChangeEffect({ plan: 'plus', cycle: 'year' }, { plan: 'plus', cycle: 'month' })
    assert.deepEqual(back, { ok: true, direction: 'downgrade', proration: 'prorated_next_billing_period' })
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

describe('checkoutMode', () => {
  it('sells to somebody who has never subscribed, and to somebody whose subscription ended', () => {
    for (const reason of ['no-subscription', 'gone'] as const) {
      assert.equal(checkoutMode({ ok: false, reason }), 'sell')
    }
  })

  it('changes the plan of a live subscription', () => {
    assert.equal(
      checkoutMode({ ok: true, id: 'sub_1', plan: 'plus', cycle: 'year', scheduled: false }),
      'change',
    )
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
