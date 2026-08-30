import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  UNGATED,
  bookletBrandLine,
  bookletCustomFooterAllowed,
  entitlementsFor,
  liveSubscription,
  planStateFor,
  resolveSubscription,
} from './entitlements'
import type { StoredPlan } from './entitlements'
import { PLANS } from './types'
import type { LimitReason, RepertoireCounts } from './types'

const NOW = new Date('2026-08-20T12:00:00Z')
const PAST = new Date('2026-08-19T12:00:00Z')
const FUTURE = new Date('2026-09-20T12:00:00Z')

/** A free, active, never-expiring, never-gifted, nothing-pending row: what every existing account holds. */
function stored(overrides: Partial<StoredPlan> = {}): StoredPlan {
  return {
    plan: 'free',
    expiresAt: null,
    status: 'active',
    pendingPlan: null,
    pendingCycle: null,
    grantedPlan: null,
    grantedUntil: null,
    ...overrides,
  }
}

function counts(songbooks: number, songs: number): RepertoireCounts {
  return { songbooks, songs }
}

const EMPTY = counts(0, 0)

describe('the plan matrix', () => {
  it('gives free an empty account nothing to lead, print or strum with', () => {
    const ent = entitlementsFor(stored(), NOW, EMPTY)

    assert.equal(ent.frozen, false)
    assert.equal(ent.refused.createSongbook, null)
    assert.equal(ent.refused.createSong, null)
    assert.equal(ent.refused.editRepertoire, null)
    assert.equal(ent.refused.lead, 'plan-required')
    assert.equal(ent.refused.booklet, 'plan-required')
    assert.equal(ent.refused.bookletCustomFooter, 'plan-required')
    assert.equal(ent.refused.ukulele, 'plan-required')
  })

  it('opens all three of those on standard, brand line included, custom footer still refused', () => {
    const ent = entitlementsFor(stored({ plan: 'standard' }), NOW, EMPTY)

    assert.equal(ent.refused.lead, null)
    assert.equal(ent.refused.booklet, null)
    assert.equal(ent.refused.bookletCustomFooter, 'plan-required')
    assert.equal(ent.refused.ukulele, null)
    assert.equal(bookletBrandLine(ent), true)
  })

  it('drops the brand line from plus upwards, and opens the custom footer from premium upwards', () => {
    const plus = entitlementsFor(stored({ plan: 'plus' }), NOW, EMPTY)
    const premium = entitlementsFor(stored({ plan: 'premium' }), NOW, EMPTY)
    const lifetime = entitlementsFor(stored({ plan: 'lifetime' }), NOW, EMPTY)

    assert.equal(bookletBrandLine(plus), false)
    assert.equal(bookletBrandLine(premium), false)
    assert.equal(bookletBrandLine(lifetime), false)

    assert.equal(bookletCustomFooterAllowed(plus), false)
    assert.equal(plus.refused.bookletCustomFooter, 'plan-required')
    assert.equal(bookletCustomFooterAllowed(premium), true)
    assert.equal(premium.refused.bookletCustomFooter, null)
    assert.equal(bookletCustomFooterAllowed(lifetime), true)
    assert.equal(lifetime.refused.bookletCustomFooter, null)
  })

  /* The lifetime-is-premium mapping asserted through the function, not through the table. */
  it('answers for lifetime exactly what it answers for premium', () => {
    const held = counts(4, 700)
    const lifetime = entitlementsFor(stored({ plan: 'lifetime' }), NOW, held)
    const premium = entitlementsFor(stored({ plan: 'premium' }), NOW, held)

    assert.deepEqual(lifetime.limits, premium.limits)
    assert.deepEqual(lifetime.refused, premium.refused)
    assert.equal(lifetime.frozen, premium.frozen)
    assert.equal(lifetime.state?.effectivePlan, 'lifetime', 'and still reports what was bought')
  })

  it('treats an unlimited cap as unlimited, not as a big number', () => {
    for (const plan of ['plus', 'premium', 'lifetime'] as const) {
      const ent = entitlementsFor(stored({ plan }), NOW, counts(500, 100_000))
      assert.equal(ent.frozen, false, plan)
      assert.equal(ent.refused.createSongbook, null, plan)
      assert.equal(ent.refused.createSong, null, plan)
      assert.equal(ent.refused.editRepertoire, null, plan)
    }
  })
})

describe('the caps', () => {
  it('has free’s one songbook already spent at one', () => {
    const ent = entitlementsFor(stored(), NOW, counts(1, 29))
    assert.equal(ent.refused.createSongbook, 'songbook-limit')
    assert.equal(ent.refused.createSong, null)
  })

  it('lets a free account with no songbook yet make one', () => {
    assert.equal(entitlementsFor(stored(), NOW, counts(0, 29)).refused.createSongbook, null)
  })

  it('lets a full account still edit what it has', () => {
    const ent = entitlementsFor(stored(), NOW, counts(1, 30))
    assert.equal(ent.refused.createSong, 'song-limit')
    assert.equal(ent.frozen, false)
    assert.equal(ent.refused.editRepertoire, null)
  })

  it('applies standard’s caps the same way', () => {
    const full = entitlementsFor(stored({ plan: 'standard' }), NOW, counts(3, 299))
    assert.equal(full.refused.createSongbook, 'songbook-limit')
    assert.equal(full.refused.createSong, null)

    const songsFull = entitlementsFor(stored({ plan: 'standard' }), NOW, counts(2, 300))
    assert.equal(songsFull.refused.createSong, 'song-limit')
    assert.equal(songsFull.refused.createSongbook, null)
  })

  /*
   * The boundary, said once and on purpose: `>=` refuses a creation, `>` is what freezes.
   * At exactly the cap an account is full but legal; one over it — which only a downgrade or
   * an expiry can produce — is frozen, and the difference is whether editing survives.
   */
  it('separates full from frozen at exactly the cap', () => {
    const full = entitlementsFor(stored(), NOW, counts(1, 30))
    const overFull = entitlementsFor(stored(), NOW, counts(1, 31))

    assert.equal(full.frozen, false)
    assert.equal(full.refused.createSong, 'song-limit')
    assert.equal(full.refused.editRepertoire, null)

    assert.equal(overFull.frozen, true)
    assert.equal(overFull.refused.createSong, 'frozen')
    assert.equal(overFull.refused.editRepertoire, 'frozen')
  })
})

describe('expiry', () => {
  it('honours a subscription whose date is still ahead', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: FUTURE }), NOW, EMPTY)

    assert.deepEqual(ent.limits, PLANS.premium)
    assert.equal(ent.state?.effectivePlan, 'premium')
    assert.equal(ent.state?.source, 'subscription')
    assert.equal(ent.state?.until, FUTURE)
  })

  it('lapses one whose date has passed, whatever the status still says', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: PAST }), NOW, EMPTY)

    assert.deepEqual(ent.limits, PLANS.free)
    assert.equal(ent.state?.plan, 'premium', 'nothing is deleted')
    assert.equal(ent.state?.effectivePlan, 'free')
    assert.equal(ent.state?.source, 'none')
    assert.equal(ent.state?.until, null)
  })

  it('counts a date of exactly now as passed', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: NOW }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.free)
  })

  it('never invents an expiry for a row that has none', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: null }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.premium)
    assert.equal(ent.state?.until, null)
  })

  it('lets a stored expired revoke even against a future date', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: FUTURE, status: 'expired' }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.free)
    assert.equal(ent.state?.effectivePlan, 'free')
  })

  it('lets it revoke a lifetime too, because refunds exist', () => {
    const ent = entitlementsFor(stored({ plan: 'lifetime', status: 'expired' }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.free)
    assert.equal(ent.state?.plan, 'lifetime', 'still reports what was bought')
  })

  it('keeps reporting what was bought in every lapsed case', () => {
    const lapsed = [
      stored({ plan: 'standard', expiresAt: PAST }),
      stored({ plan: 'plus', status: 'expired' }),
      stored({ plan: 'premium', expiresAt: NOW }),
      stored({ plan: 'lifetime', status: 'expired' }),
    ]

    for (const row of lapsed) {
      const ent = entitlementsFor(row, NOW, EMPTY)
      assert.equal(ent.state?.plan, row.plan)
      assert.equal(ent.state?.effectivePlan, 'free')
      assert.equal(ent.state?.status, row.status, 'and why')
    }
  })
})

describe('grace', () => {
  /*
   * The date is ignored on purpose. By the time a card has failed the paid period is
   * virtually always already over, so comparing the date here would make 'grace' unreachable
   * and revoke the plan of the exact customer it exists to protect.
   */
  it('keeps the full plan on a failed renewal, past date and all', () => {
    const ent = entitlementsFor(stored({ plan: 'standard', expiresAt: PAST, status: 'grace' }), NOW, EMPTY)

    assert.deepEqual(ent.limits, PLANS.standard)
    assert.equal(ent.state?.effectivePlan, 'standard')
    assert.equal(ent.state?.until, PAST)
  })

  it('works the same with no date at all', () => {
    const ent = entitlementsFor(stored({ plan: 'premium', expiresAt: null, status: 'grace' }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.premium)
  })

  it('grants the plan and not an upgrade', () => {
    const ent = entitlementsFor(stored({ plan: 'free', status: 'grace' }), NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.free)
  })
})

describe('a pending change', () => {
  it('changes nothing before its date — the full current plan applies', () => {
    const row = stored({ plan: 'premium', expiresAt: FUTURE, pendingPlan: 'standard', pendingCycle: 'year' })

    const ent = entitlementsFor(row, NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.premium)
    assert.equal(ent.state?.effectivePlan, 'premium')
  })

  it('carries the pending plan and cycle through untouched, ahead of the date', () => {
    const row = stored({ plan: 'premium', expiresAt: FUTURE, pendingPlan: 'standard', pendingCycle: 'year' })
    const resolved = resolveSubscription(row, NOW)

    assert.equal(resolved.plan, 'premium')
    assert.equal(resolved.expiresAt, FUTURE)
    assert.equal(resolved.pendingPlan, 'standard')
    assert.equal(resolved.pendingCycle, 'year')
  })

  it('becomes the pending plan the instant its date passes, with nothing left pending', () => {
    const row = stored({ plan: 'premium', expiresAt: PAST, pendingPlan: 'standard', pendingCycle: 'year' })

    const ent = entitlementsFor(row, NOW, EMPTY)
    assert.deepEqual(ent.limits, PLANS.standard)
    assert.equal(ent.state?.effectivePlan, 'standard')
    assert.equal(ent.state?.until, null, 'no invented renewal date for the plan it became')

    const resolved = resolveSubscription(row, NOW)
    assert.equal(resolved.pendingPlan, null, 'resolved in one step, nothing left to resolve again')
  })

  it('lapses to free exactly like a plain expiry when the pending plan is free — a cancellation', () => {
    const cancelled = stored({ plan: 'premium', expiresAt: PAST, pendingPlan: 'free', pendingCycle: null })
    const neverScheduled = stored({ plan: 'premium', expiresAt: PAST })

    assert.deepEqual(entitlementsFor(cancelled, NOW, EMPTY).limits, entitlementsFor(neverScheduled, NOW, EMPTY).limits)
    assert.equal(liveSubscription(cancelled, NOW), 'free')
  })

  it('counts a date of exactly now as already due, same as a plain expiry', () => {
    const row = stored({ plan: 'premium', expiresAt: NOW, pendingPlan: 'standard', pendingCycle: 'year' })
    assert.equal(liveSubscription(row, NOW), 'standard')
  })

  it('never fires during grace, whatever the date says — a failed renewal is not the moment to downgrade', () => {
    const row = stored({ plan: 'standard', expiresAt: PAST, status: 'grace', pendingPlan: 'free', pendingCycle: null })

    assert.equal(liveSubscription(row, NOW), 'standard')
  })

  /*
   * The other half of the rule above, and the half that changed: grace does not *fire* a
   * pending change, but it does keep reporting one. `/billing` shows its "Keep <plan>" button
   * only when the resolved `pendingPlan` is non-null, so dropping it here hid both the
   * scheduled downgrade and the only way to undo it from the customer whose card is failing.
   */
  it('still reports a pending change during grace, so it stays visible and undoable', () => {
    const row = stored({ plan: 'standard', expiresAt: PAST, status: 'grace', pendingPlan: 'free', pendingCycle: null })
    const resolved = resolveSubscription(row, NOW)

    assert.equal(resolved.plan, 'standard', 'still the plan they hold — the pending has not fired')
    assert.equal(resolved.status, 'grace')
    assert.equal(resolved.pendingPlan, 'free', 'and the scheduled change is still reported')
  })

  it('drops a pending change once expired — nothing live left to resolve it against', () => {
    const row = stored({ plan: 'standard', expiresAt: PAST, status: 'expired', pendingPlan: 'free', pendingCycle: null })
    assert.equal(resolveSubscription(row, NOW).pendingPlan, null)
  })

  it('never fires once already expired — nothing left live to resolve', () => {
    const row = stored({ plan: 'standard', expiresAt: PAST, status: 'expired', pendingPlan: 'free', pendingCycle: null })
    assert.equal(liveSubscription(row, NOW), null)
  })

  it('has nothing to fire on lifetime or a bare free row — both carry a null expiry', () => {
    for (const plan of ['free', 'lifetime'] as const) {
      const row = stored({ plan, pendingPlan: 'standard', pendingCycle: 'year' })
      // No date to compare against, so the resolver can only pass the row through as-is.
      assert.deepEqual(resolveSubscription(row, FUTURE), row)
    }
  })

  it('resolves the same way twice and mutates neither the row nor its dates', () => {
    const row = stored({ plan: 'premium', expiresAt: PAST, pendingPlan: 'standard', pendingCycle: 'year' })
    const snapshot = { ...row }

    const first = resolveSubscription(row, NOW)
    const second = resolveSubscription(row, NOW)

    assert.deepEqual(first, second)
    assert.deepEqual(row, snapshot)
  })
})

describe('the manual grant', () => {
  /*
   * A free row with no expiry is a live subscription — the plan it names is `free`, and it
   * applies. So `source` reads 'subscription' there, not 'none': 'none' is reserved for the
   * case where both sides are actually dead and the free limits are a *fallback* rather than
   * the row's own answer. Worth pinning, because the two look identical from the limits alone.
   */
  it('reads a plain free row as its own live subscription, not as nothing', () => {
    const ent = entitlementsFor(stored(), NOW, EMPTY)

    assert.equal(ent.state?.effectivePlan, 'free')
    assert.equal(ent.state?.source, 'subscription')
    assert.equal(ent.state?.until, null)

    const dead = entitlementsFor(stored({ plan: 'premium', expiresAt: PAST }), NOW, EMPTY)
    assert.deepEqual(dead.limits, ent.limits, 'the same limits')
    assert.equal(dead.state?.source, 'none', 'reached a different way')
  })

  it('carries an account on its own when nothing is subscribed', () => {
    const ent = entitlementsFor(stored({ grantedPlan: 'premium', grantedUntil: null }), NOW, EMPTY)

    assert.deepEqual(ent.limits, PLANS.premium)
    assert.equal(ent.state?.effectivePlan, 'premium')
    assert.equal(ent.state?.source, 'grant')
    assert.equal(ent.state?.until, null)
  })

  it('never takes anything away from a better subscription', () => {
    const ent = entitlementsFor(
      stored({ plan: 'premium', expiresAt: FUTURE, grantedPlan: 'standard', grantedUntil: null }),
      NOW,
      EMPTY,
    )

    assert.deepEqual(ent.limits, PLANS.premium)
    assert.equal(ent.state?.source, 'subscription')
  })

  it('leaves a tie to the subscription, which is what a customer is paying for', () => {
    const ent = entitlementsFor(
      stored({ plan: 'premium', expiresAt: FUTURE, grantedPlan: 'premium', grantedUntil: FUTURE }),
      NOW,
      EMPTY,
    )

    assert.equal(ent.state?.source, 'subscription')
  })

  it('stops contributing once its own date has passed', () => {
    const ent = entitlementsFor(stored({ grantedPlan: 'premium', grantedUntil: PAST }), NOW, EMPTY)

    assert.deepEqual(ent.limits, PLANS.free)
    assert.equal(ent.state?.effectivePlan, 'free')
    assert.notEqual(ent.state?.source, 'grant')
  })

  /* The property the separate columns exist for, stated as a test. */
  it('survives a subscription that a webhook has expired', () => {
    const ent = entitlementsFor(
      stored({ plan: 'premium', status: 'expired', grantedPlan: 'plus', grantedUntil: FUTURE }),
      NOW,
      EMPTY,
    )

    assert.deepEqual(ent.limits, PLANS.plus)
    assert.equal(ent.state?.source, 'grant')
    assert.equal(ent.state?.until, FUTURE)
    assert.equal(ent.state?.plan, 'premium', 'and what was bought is still on the row')
  })

  it('falls to free when both sides are dead', () => {
    const ent = entitlementsFor(
      stored({ plan: 'premium', expiresAt: PAST, grantedPlan: 'plus', grantedUntil: PAST }),
      NOW,
      EMPTY,
    )

    assert.deepEqual(ent.limits, PLANS.free)
    assert.equal(ent.state?.source, 'none')
  })

  /*
   * The one test the whole no-blending rule rests on. Premium until FUTURE with a standard
   * gift running to 2030 is premium today and standard the day after FUTURE — never premium
   * until 2030, which is what taking the higher plan and the later date independently would
   * have produced: years of the paid plan given away by folding two facts into one.
   */
  it('never blends the better plan with the longer date', () => {
    const row = stored({
      plan: 'premium',
      expiresAt: FUTURE,
      grantedPlan: 'standard',
      grantedUntil: new Date('2030-01-01T00:00:00Z'),
    })

    const before = entitlementsFor(row, NOW, EMPTY)
    assert.deepEqual(before.limits, PLANS.premium)
    assert.equal(before.state?.until, FUTURE)

    const after = entitlementsFor(row, new Date('2026-10-01T12:00:00Z'), EMPTY)
    assert.deepEqual(after.limits, PLANS.standard)
    assert.equal(after.state?.source, 'grant')
    assert.notDeepEqual(after.limits, PLANS.premium, 'not premium until 2030')
  })

  it('ignores grantedUntil entirely when there is no granted plan', () => {
    for (const grantedUntil of [null, PAST, FUTURE, new Date('2030-01-01T00:00:00Z')]) {
      const ent = entitlementsFor(stored({ grantedPlan: null, grantedUntil }), NOW, EMPTY)
      assert.deepEqual(ent.limits, PLANS.free)
      assert.equal(ent.state?.effectivePlan, 'free')
      assert.notEqual(ent.state?.source, 'grant')
      assert.equal(ent.state?.until, null)
    }
  })
})

/*
 * `planStateFor` is what `/accounts` reads: the winner rule on its own, with no counts to
 * supply and therefore no `frozen`/`refused` to fabricate. These four cases pin the two
 * things the extraction has to keep true — that it answers exactly what `entitlementsFor`
 * puts in `.state`, and that a *present but not winning* grant is still visible in the row
 * it was written to, which is the case the operator panel exists to show.
 */
describe('the plan state on its own', () => {
  it('answers exactly what entitlementsFor puts in .state', () => {
    const rows = [
      stored({ grantedPlan: 'premium', grantedUntil: FUTURE }),
      stored({ plan: 'plus', expiresAt: FUTURE }),
      stored({ plan: 'premium', expiresAt: PAST, grantedPlan: 'plus', grantedUntil: PAST }),
    ]

    for (const row of rows) {
      assert.deepEqual(planStateFor(row, NOW), entitlementsFor(row, NOW, EMPTY).state)
    }
  })

  /*
   * The one an operator would otherwise read as "the gift was never saved": equal ranks, so
   * `grantWins` is false and the subscription is named — while the gift sits in the row,
   * intact, waiting for the subscription to lapse.
   */
  it('names the subscription when the gift only equals it, and shows the subscription’s own date', () => {
    const row = stored({
      plan: 'premium',
      expiresAt: FUTURE,
      grantedPlan: 'premium',
      grantedUntil: new Date('2027-06-30T23:59:59.999Z'),
    })
    const state = planStateFor(row, NOW)

    assert.equal(state.effectivePlan, 'premium')
    assert.equal(state.source, 'subscription')
    assert.equal(state.until, FUTURE, 'never the later of the two dates')
  })

  it('keeps a weaker gift present in the row while the subscription is the one in force', () => {
    const row = stored({ plan: 'premium', expiresAt: FUTURE, grantedPlan: 'standard', grantedUntil: null })
    const state = planStateFor(row, NOW)

    assert.equal(state.source, 'subscription')
    assert.equal(state.effectivePlan, 'premium')
    assert.equal(row.grantedPlan, 'standard', 'the gift is still there to be rendered')
  })

  it('reads its clock only from its argument and mutates nothing', () => {
    const row = stored({ plan: 'premium', expiresAt: FUTURE })
    const snapshot = { ...row }

    assert.equal(planStateFor(row, NOW).effectivePlan, 'premium')
    assert.equal(planStateFor(row, new Date('2027-01-01T00:00:00Z')).effectivePlan, 'free')
    assert.deepEqual(row, snapshot)
  })
})

describe('the freeze', () => {
  it('closes creating, adding and editing on a downgraded account', () => {
    const ent = entitlementsFor(stored(), NOW, counts(3, 50))

    assert.equal(ent.frozen, true)
    assert.equal(ent.refused.createSongbook, 'frozen')
    assert.equal(ent.refused.createSong, 'frozen')
    assert.equal(ent.refused.editRepertoire, 'frozen')
  })

  it('freezes on either cap alone', () => {
    assert.equal(entitlementsFor(stored(), NOW, counts(1, 31)).frozen, true, 'songs only')
    assert.equal(entitlementsFor(stored(), NOW, counts(2, 0)).frozen, true, 'songbooks only')
  })

  it('does not freeze an account sitting exactly on both caps', () => {
    const ent = entitlementsFor(stored(), NOW, counts(1, 30))

    assert.equal(ent.frozen, false)
    assert.equal(ent.refused.createSongbook, 'songbook-limit')
    assert.equal(ent.refused.createSong, 'song-limit')
    assert.equal(ent.refused.editRepertoire, null, 'full is not frozen: the two rules are not one rule')
  })

  /*
   * The precedence lives in the field's own expression, never in the gate: a gate that
   * checked the cap first would tell a frozen account to upgrade for more songs when the
   * actual answer is to delete until it fits.
   */
  it('says frozen, not song-limit, when both would apply', () => {
    assert.equal(entitlementsFor(stored(), NOW, counts(1, 40)).refused.createSong, 'frozen')
    assert.equal(entitlementsFor(stored(), NOW, counts(4, 40)).refused.createSongbook, 'frozen')
  })

  it('leaves leading, printing and the instrument to a frozen paying account', () => {
    const ent = entitlementsFor(stored({ plan: 'standard' }), NOW, counts(9, 9))

    assert.equal(ent.frozen, true)
    assert.equal(ent.refused.lead, null)
    assert.equal(ent.refused.booklet, null)
    assert.equal(ent.refused.ukulele, null)
  })

  it('still refuses those three to a frozen free account by its plan, not by the freeze', () => {
    const ent = entitlementsFor(stored(), NOW, counts(9, 900))

    assert.equal(ent.frozen, true)
    assert.equal(ent.refused.lead, 'plan-required')
    assert.equal(ent.refused.booklet, 'plan-required')
    assert.equal(ent.refused.bookletCustomFooter, 'plan-required')
    assert.equal(ent.refused.ukulele, 'plan-required')
  })

  /* None of the vocabulary is dead: every reason is something this file can actually produce. */
  it('produces every LimitReason from some real row', () => {
    const scenarios = [
      entitlementsFor(stored(), NOW, counts(1, 30)),
      entitlementsFor(stored(), NOW, counts(0, 30)),
      entitlementsFor(stored(), NOW, counts(9, 900)),
      entitlementsFor(stored({ plan: 'premium' }), NOW, counts(9, 900)),
    ]

    const produced = new Set<LimitReason>()
    for (const ent of scenarios) {
      for (const reason of Object.values(ent.refused)) {
        if (reason !== null) produced.add(reason)
      }
    }

    assert.deepEqual(
      [...produced].sort(),
      ['frozen', 'plan-required', 'song-limit', 'songbook-limit'],
    )
  })
})

describe('purity', () => {
  it('answers differently for two different nows, so the clock cannot be read inside', () => {
    const row = stored({ plan: 'premium', expiresAt: FUTURE })

    assert.deepEqual(entitlementsFor(row, NOW, EMPTY).limits, PLANS.premium)
    assert.deepEqual(entitlementsFor(row, new Date('2027-01-01T00:00:00Z'), EMPTY).limits, PLANS.free)
  })

  it('returns the same answer twice and mutates neither argument', () => {
    const row = stored({ plan: 'standard', expiresAt: FUTURE, grantedPlan: 'plus', grantedUntil: PAST })
    const held = counts(2, 200)
    const snapshot = { row: { ...row }, held: { ...held } }

    assert.deepEqual(entitlementsFor(row, NOW, held), entitlementsFor(row, NOW, held))
    assert.deepEqual(row, snapshot.row)
    assert.deepEqual(held, snapshot.held)
  })
})

describe('the off switch', () => {
  it('refuses nothing but the custom footer, which stays pinned shut on purpose', () => {
    assert.deepEqual(UNGATED.refused, {
      createSongbook: null,
      createSong: null,
      editRepertoire: null,
      lead: null,
      booklet: null,
      bookletCustomFooter: 'plan-required',
      ukulele: null,
      featureRequest: null,
    })
  })

  it('freezes nothing and reports no plan, because nothing is being enforced', () => {
    assert.equal(UNGATED.frozen, false)
    assert.equal(UNGATED.state, null)
  })

  it('caps nothing and withholds nothing', () => {
    assert.equal(UNGATED.limits.songbooks, null)
    assert.equal(UNGATED.limits.songs, null)
    assert.equal(UNGATED.limits.ukulele, true)
    assert.equal(UNGATED.limits.smartCapo, true)
    assert.equal(UNGATED.limits.mayLead, true)
  })

  /*
   * The whole claim the switch makes: absent SONGBOOK_PLANS, behaviour is what it is today —
   * and today every booklet carries the «Printed with Strumfolio» line. This assertion is the
   * switch's only test coverage, because the half that reads the environment is async and
   * queries the database, and this repo has no infrastructure for testing that.
   */
  it('keeps printing the brand line, and never lets it be replaced', () => {
    assert.equal(bookletBrandLine(UNGATED), true)
    assert.equal(bookletCustomFooterAllowed(UNGATED), false)
  })

  it('differs from premium in the brand line and in nothing else', () => {
    assert.notDeepEqual(UNGATED.limits, PLANS.premium, 'which is why this constant exists at all')
    assert.equal(UNGATED.limits.booklet, 'branded')
    assert.equal(PLANS.premium.booklet, 'custom')
    assert.deepEqual({ ...UNGATED.limits, booklet: PLANS.premium.booklet }, PLANS.premium)
  })
})
