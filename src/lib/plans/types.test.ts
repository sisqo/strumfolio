import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { saveMessage } from '@/lib/import/types'
import { writeMessage } from '@/lib/songbooks/types'

import { UNGATED } from './entitlements'
import {
  audienceIsFull,
  audienceSentence,
  LIMIT_MESSAGE,
  limitFacts,
  limitSentence,
  PLANS,
  PLAN_RANK,
  PLAN_STATUS_VALUES,
  PLAN_VALUES,
  readPlan,
  readPlanStatus,
  thanksCapacitySentence,
  thanksDevicesCaption,
  thanksSongsCaption,
} from './types'
import type { LimitFacts, LimitReason } from './types'

describe('readPlan', () => {
  it('reads every stored value back as itself', () => {
    for (const plan of PLAN_VALUES) {
      assert.equal(readPlan(plan), plan)
    }
  })

  it('reads an unrecognised string as free', () => {
    assert.equal(readPlan('gold'), 'free')
    assert.equal(readPlan('Premium'), 'free', 'our own code only ever writes lowercase')
    assert.equal(readPlan(''), 'free')
  })

  it('reads a non-string as free', () => {
    assert.equal(readPlan(null), 'free')
    assert.equal(readPlan(undefined), 'free')
    assert.equal(readPlan(0), 'free')
    assert.equal(readPlan(1), 'free')
    assert.equal(readPlan({}), 'free')
    assert.equal(readPlan(['premium']), 'free')
    assert.equal(readPlan(true), 'free')
  })
})

describe('readPlanStatus', () => {
  it('reads every stored value back as itself', () => {
    for (const status of PLAN_STATUS_VALUES) {
      assert.equal(readPlanStatus(status), status)
    }
  })

  it('reads anything else as active', () => {
    assert.equal(readPlanStatus('cancelled'), 'active')
    assert.equal(readPlanStatus(''), 'active')
    assert.equal(readPlanStatus(null), 'active')
    assert.equal(readPlanStatus(undefined), 'active')
    assert.equal(readPlanStatus(0), 'active')
    assert.equal(readPlanStatus({}), 'active')
  })

  /*
   * The asymmetry, asserted in one place so it reads as a decision rather than an
   * inconsistency: the two readers fall in opposite directions on purpose. An unreadable
   * plan must never grant paid limits; an unreadable status must never revoke them, because
   * 'expired' is the only status that takes something away and a byte we cannot parse is no
   * evidence that anybody lapsed.
   */
  it('never grants on an unreadable plan and never revokes on an unreadable status', () => {
    assert.equal(readPlan('premium-plus-ultra'), 'free')
    assert.equal(readPlanStatus('paused'), 'active')
  })
})

describe('PLANS', () => {
  it('is the decided table, row by row', () => {
    assert.deepEqual(PLANS.free, {
      songbooks: 1,
      songs: 30,
      ukulele: false,
      featureRequests: 'no',
      smartCapo: false,
      booklet: 'no',
      mayLead: false,
      devices: 0,
    })
    assert.deepEqual(PLANS.standard, {
      songbooks: 3,
      songs: 300,
      ukulele: true,
      featureRequests: 'no',
      smartCapo: true,
      booklet: 'branded',
      mayLead: true,
      devices: 1,
    })
    assert.deepEqual(PLANS.plus, {
      songbooks: null,
      songs: null,
      ukulele: true,
      featureRequests: 'yes',
      smartCapo: true,
      booklet: 'plain',
      mayLead: true,
      devices: 3,
    })
    assert.deepEqual(PLANS.premium, {
      songbooks: null,
      songs: null,
      ukulele: true,
      featureRequests: 'priority',
      smartCapo: true,
      booklet: 'custom',
      mayLead: true,
      devices: 100,
    })
  })

  it('gives lifetime exactly premium’s limits', () => {
    assert.deepEqual(PLANS.lifetime, PLANS.premium)
  })

  it('has a row for every stored value', () => {
    for (const plan of PLAN_VALUES) {
      assert.notEqual(PLANS[plan], undefined, `no limits for ${plan}`)
    }
  })

  it('spells unlimited as null and never as a large number', () => {
    for (const plan of ['plus', 'premium', 'lifetime'] as const) {
      assert.equal(PLANS[plan].songbooks, null, `${plan} songbooks`)
      assert.equal(PLANS[plan].songs, null, `${plan} songs`)
    }

    for (const plan of ['free', 'standard'] as const) {
      const { songbooks, songs } = PLANS[plan]
      assert.ok(songbooks !== null && Number.isInteger(songbooks) && songbooks > 0, `${plan} songbooks`)
      assert.ok(songs !== null && Number.isInteger(songs) && songs > 0, `${plan} songs`)
    }
  })

  it('keeps premium’s 100 devices a number, whatever the listing calls it', () => {
    assert.equal(PLANS.premium.devices, 100)
    for (const plan of PLAN_VALUES) {
      assert.equal(typeof PLANS[plan].devices, 'number', `${plan} devices`)
    }
  })

  it('withholds the booklet from free alone', () => {
    assert.deepEqual(
      PLAN_VALUES.map((plan) => PLANS[plan].booklet),
      ['no', 'branded', 'plain', 'custom', 'custom'],
    )
  })
})

describe('PLAN_RANK', () => {
  it('increases strictly with what a plan grants', () => {
    assert.ok(PLAN_RANK.free < PLAN_RANK.standard)
    assert.ok(PLAN_RANK.standard < PLAN_RANK.plus)
    assert.ok(PLAN_RANK.plus < PLAN_RANK.premium)
  })

  /*
   * Lifetime's limits equal premium's, but its rank must not: the subscription-versus-grant
   * comparison has to be total, and two sides at the same rank would leave the winner to
   * whichever branch happened to be written first.
   */
  it('ranks lifetime strictly above premium', () => {
    assert.ok(PLAN_RANK.lifetime > PLAN_RANK.premium)
  })

  it('has a rank for every stored value', () => {
    for (const plan of PLAN_VALUES) {
      assert.equal(typeof PLAN_RANK[plan], 'number', `no rank for ${plan}`)
    }
  })
})

describe('LIMIT_MESSAGE', () => {
  /*
   * The literal list is the test: if the union ever grows a member this file stops
   * compiling, which is the only way a reason can be prevented from reaching a screen with
   * nothing to say.
   */
  it('has a non-empty message for every reason', () => {
    const reasons: LimitReason[] = ['songbook-limit', 'song-limit', 'frozen', 'plan-required']
    for (const reason of reasons) {
      assert.equal(typeof LIMIT_MESSAGE[reason], 'string', reason)
      assert.ok(LIMIT_MESSAGE[reason].length > 0, `${reason} has no wording`)
    }
    assert.equal(Object.keys(LIMIT_MESSAGE).length, reasons.length, 'a message with no reason')
  })
})

describe('limitFacts', () => {
  it('names the songbook cap of the plan that refused', () => {
    assert.deepEqual(limitFacts(PLANS.free, 'songbook-limit'), { kind: 'songbooks', max: 1 })
    assert.deepEqual(limitFacts(PLANS.standard, 'songbook-limit'), { kind: 'songbooks', max: 3 })
  })

  it('names the song cap of the plan that refused', () => {
    assert.deepEqual(limitFacts(PLANS.free, 'song-limit'), { kind: 'songs', max: 30 })
    assert.deepEqual(limitFacts(PLANS.standard, 'song-limit'), { kind: 'songs', max: 300 })
  })

  /*
   * The `kind` follows the reason and not the plan field the caller had in mind: a paste
   * refused because its Unfiled songbook would be one too many is a *songbook* refusal even
   * though the reader was saving songs. `resolveSection` depends on this.
   */
  it('takes its kind from the reason, not from the caller', () => {
    assert.equal(limitFacts(PLANS.free, 'songbook-limit')?.kind, 'songbooks')
    assert.equal(limitFacts(PLANS.free, 'song-limit')?.kind, 'songs')
  })

  it('has no number to name for the two reasons that are not counts', () => {
    assert.equal(limitFacts(PLANS.free, 'frozen'), undefined)
    assert.equal(limitFacts(PLANS.free, 'plan-required'), undefined)
  })

  /*
   * Unreachable in practice — an unlimited cap cannot be what refused a write — but asserted
   * because the alternative is a sentence reading «goes up to null songs» if a caller ever
   * builds facts from a reason the entitlements did not produce.
   */
  it('has no number to name on an unlimited plan', () => {
    assert.equal(limitFacts(PLANS.plus, 'songbook-limit'), undefined)
    assert.equal(limitFacts(PLANS.premium, 'song-limit'), undefined)
  })
})

describe('limitSentence', () => {
  /*
   * Both sentences are pinned to the letter, «in all» included. That phrase is not
   * decoration: the song cap is account-wide and the only song count any screen renders is
   * per songbook, so a sentence that loses it starts reading as a per-songbook cap on the
   * very screens it appears on. The songbook sentence is pinned without it for the same
   * reason — the home screen lists every songbook, so scoping it would be noise. A refactor
   * that folds the two kinds back into one template fails here rather than shipping.
   */
  it('names the number for both kinds, and scopes the song cap', () => {
    assert.equal(limitSentence({ kind: 'songs', max: 30 }), 'This plan goes up to 30 songs in all.')
    assert.equal(limitSentence({ kind: 'songbooks', max: 3 }), 'This plan goes up to 3 songbooks.')
  })

  // `free` allows exactly one songbook, so the singular is the commonest form of this
  // sentence in the installation rather than an edge case.
  it('reads well in the singular', () => {
    assert.equal(limitSentence({ kind: 'songbooks', max: 1 }), 'This plan goes up to 1 songbook.')
    assert.equal(limitSentence({ kind: 'songs', max: 1 }), 'This plan goes up to 1 song in all.')
  })

  it('carries the digits of every plan that has a cap', () => {
    for (const plan of PLAN_VALUES) {
      for (const reason of ['songbook-limit', 'song-limit'] as const) {
        const facts = limitFacts(PLANS[plan], reason)
        if (facts === undefined) continue
        assert.ok(
          limitSentence(facts).includes(String(facts.max)),
          `${plan}/${reason} loses its number`,
        )
      }
    }
  })
})

/*
 * Both helpers are tested here, in the plans folder, rather than one beside each union.
 * The requirement they exist for is that the songbook side and the song side say the *same*
 * sentence about the same cap, and a test living in `songbooks/` and a test living in
 * `import/` cannot assert agreement between the two — only that each is separately
 * plausible, which is exactly the state that let two capless copies of the wording drift
 * apart in the first place.
 */
describe('writeMessage / saveMessage', () => {
  const capped: LimitFacts[] = [
    { kind: 'songbooks', max: 1 },
    { kind: 'songbooks', max: 3 },
    { kind: 'songs', max: 1 },
    { kind: 'songs', max: 30 },
  ]

  it('names the cap when the refusal carries one', () => {
    for (const limit of capped) {
      const sentence = limitSentence(limit)
      assert.equal(writeMessage({ reason: 'songbook-limit', limit }), sentence)
      assert.equal(saveMessage({ reason: 'song-limit', limit }), sentence)
      assert.ok(sentence.includes(String(limit.max)))
    }
  })

  it('says the same thing on both sides for the same cap', () => {
    for (const limit of capped) {
      assert.equal(
        writeMessage({ reason: 'songbook-limit', limit }),
        saveMessage({ reason: 'song-limit', limit }),
      )
    }
  })

  it('falls back to the capless wording when no cap came with the refusal', () => {
    assert.equal(writeMessage({ reason: 'songbook-limit' }), LIMIT_MESSAGE['songbook-limit'])
    assert.equal(saveMessage({ reason: 'song-limit' }), LIMIT_MESSAGE['song-limit'])
    assert.equal(writeMessage({ reason: 'frozen' }), LIMIT_MESSAGE.frozen)
    assert.equal(saveMessage({ reason: 'plan-required' }), LIMIT_MESSAGE['plan-required'])
  })

  it('still words the failures that have nothing to do with the plan', () => {
    assert.equal(writeMessage({ reason: 'failed' }), 'Save failed. Please try again.')
    assert.equal(writeMessage({ reason: 'not-found' }), 'This songbook no longer exists.')
    assert.equal(saveMessage({ reason: 'failed' }), 'Save failed. Please try again.')
    assert.equal(saveMessage({ reason: 'duplicate' }), 'A song with this title and artist already exists.')
  })
})

describe('audienceSentence', () => {
  it('names the cap when there is one worth naming', () => {
    assert.equal(audienceSentence(2, 3), '2 of 3 devices following')
    assert.equal(audienceSentence(0, 3), '0 of 3 devices following')
    assert.equal(audienceSentence(3, 3), '3 of 3 devices following')
  })

  it('agrees with the cap, not the count, in the ratio', () => {
    // standard's cap is 1, so these two are the most-read forms of this sentence
    // anywhere in the installation — not an edge case.
    assert.equal(audienceSentence(0, PLANS.standard.devices), '0 of 1 device following')
    assert.equal(audienceSentence(1, PLANS.standard.devices), '1 of 1 device following')
  })

  it('drops the cap for premium, for lifetime and for plans switched off', () => {
    // One test resolves all three, because UNGATED.limits.devices is PLANS.premium.devices.
    assert.equal(audienceSentence(2, PLANS.premium.devices), '2 devices following')
    assert.equal(audienceSentence(2, PLANS.lifetime.devices), '2 devices following')
    assert.equal(audienceSentence(2, UNGATED.limits.devices), '2 devices following')
  })

  it('agrees with the count, not the cap, in the bare form', () => {
    assert.equal(audienceSentence(1, PLANS.premium.devices), '1 device following')
    assert.equal(audienceSentence(0, PLANS.premium.devices), '0 devices following')
  })

  it('never says "of 100": that would advertise a cap nobody configured', () => {
    for (const following of [0, 1, 2, 99, 100, 101]) {
      assert.ok(!audienceSentence(following, PLANS.premium.devices).includes('of'))
    }
  })

  it('drops the cap when a plan lapsed under a live broadcast, rather than saying "of 0"', () => {
    // free cannot *start* a broadcast, but a broadcast already running when the subscription
    // lapses is deliberately never interrupted — so its cap becomes free's 0 with devices
    // still on it. «2 of 0 devices following» would read as a bug in the app.
    assert.equal(audienceSentence(2, PLANS.free.devices), '2 devices following')
    assert.equal(audienceSentence(0, PLANS.free.devices), '0 devices following')
  })

  it('drops the cap when the count has passed it, after a downgrade mid-performance', () => {
    // A plus broadcast downgraded to standard mid-performance produces a count above the cap,
    // and nothing stops it: a live performance is deliberately never interrupted. `seatDevice`'s
    // read-then-write race used to be a second way here and is not one any more — `count` and
    // `seat` share one advisory lock per broadcast — so this sentence now survives exactly one
    // cause rather than two, and that cause is a decision rather than a gap.
    assert.equal(audienceSentence(2, PLANS.standard.devices), '2 devices following')
    assert.equal(audienceSentence(4, PLANS.plus.devices), '4 devices following')
  })
})

describe('audienceIsFull', () => {
  it('is true only at a cap that is real and exactly reached', () => {
    assert.equal(audienceIsFull(1, PLANS.standard.devices), true)
    assert.equal(audienceIsFull(3, PLANS.plus.devices), true)
    assert.equal(audienceIsFull(0, PLANS.standard.devices), false)
    assert.equal(audienceIsFull(2, PLANS.plus.devices), false)
  })

  it('is false wherever no place could ever free up, so the hint is never a false promise', () => {
    // A lapsed plan under a live broadcast (cap 0), and a count already over the cap: in
    // both, every device closing its link changes nothing.
    assert.equal(audienceIsFull(0, PLANS.free.devices), false)
    assert.equal(audienceIsFull(2, PLANS.free.devices), false)
    assert.equal(audienceIsFull(2, PLANS.standard.devices), false)
  })

  it('is false for premium, for lifetime and for plans switched off', () => {
    assert.equal(audienceIsFull(100, PLANS.premium.devices), false)
    assert.equal(audienceIsFull(100, PLANS.lifetime.devices), false)
    assert.equal(audienceIsFull(100, UNGATED.limits.devices), false)
  })
})

describe('thanksSongsCaption', () => {
  it('names the real cap for a plan that has one', () => {
    assert.equal(thanksSongsCaption('standard'), '300 songs across 3 songbooks.')
  })

  it('drops every number for a plan with no cap', () => {
    assert.equal(thanksSongsCaption('plus'), 'Unlimited songs, organized your way.')
    assert.equal(thanksSongsCaption('premium'), 'Unlimited songs, organized your way.')
    assert.equal(thanksSongsCaption('lifetime'), 'Unlimited songs, organized your way.')
  })
})

describe('thanksDevicesCaption', () => {
  it('spells out the singular for a cap of one', () => {
    assert.equal(thanksDevicesCaption('standard'), 'Start a Strum Together session, one device following.')
  })

  it('names the real cap for plus', () => {
    assert.equal(thanksDevicesCaption('plus'), 'Start a Strum Together session, up to 3 devices following.')
  })

  it('calls premium and lifetime unlimited, never the bare number 100', () => {
    assert.equal(thanksDevicesCaption('premium'), 'Start a Strum Together session, unlimited devices.')
    assert.equal(thanksDevicesCaption('lifetime'), 'Start a Strum Together session, unlimited devices.')
  })
})

describe('thanksCapacitySentence', () => {
  it('joins the capped songs clause and the capped devices clause for standard', () => {
    assert.equal(thanksCapacitySentence('standard'), '3 songbooks, 300 songs, one screen following along.')
  })

  it('joins the uncapped songs clause and the capped devices clause for plus', () => {
    assert.equal(thanksCapacitySentence('plus'), 'every songbook, every song, up to 3 screens following along.')
  })

  it('joins the uncapped songs clause and the unlimited devices clause for premium and lifetime', () => {
    assert.equal(thanksCapacitySentence('premium'), 'every songbook, every song, the whole room following along.')
    assert.equal(thanksCapacitySentence('lifetime'), 'every songbook, every song, the whole room following along.')
  })
})
