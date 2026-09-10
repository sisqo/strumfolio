/**
 * `worthAnnouncing` and `giftOccurrenceKey` — the two rules that decide whether somebody gets
 * an email and whether they get a second one.
 *
 * Beside `grant.test.ts` and for the same reason it gives: these are the part of the gift
 * feature that has nothing to do with the world, and they are also the part whose mistakes
 * are unrecoverable. A predicate that is too generous sends mail nobody meant to send, and a
 * key that moves when it should not sends the same mail twice.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { giftOccurrenceKey, worthAnnouncing } from './giftNotice'
import type { GiftSnapshot } from './giftNotice'

const NONE: GiftSnapshot = { plan: null, untilOn: null }

test('worthAnnouncing', async (t) => {
  await t.test('a first gift is news', () => {
    assert.equal(worthAnnouncing(NONE, { plan: 'premium', untilOn: '2027-03-01' }), true)
    assert.equal(worthAnnouncing(NONE, { plan: 'standard', untilOn: null }), true)
  })

  await t.test('a higher plan is news, a lower one is not', () => {
    const until = '2027-03-01'
    assert.equal(worthAnnouncing({ plan: 'standard', untilOn: until }, { plan: 'premium', untilOn: until }), true)
    assert.equal(worthAnnouncing({ plan: 'premium', untilOn: until }, { plan: 'standard', untilOn: until }), false)
  })

  await t.test('a date moved further out is news, a shortened one is not', () => {
    assert.equal(
      worthAnnouncing({ plan: 'premium', untilOn: '2027-03-01' }, { plan: 'premium', untilOn: '2027-09-01' }),
      true,
    )
    assert.equal(
      worthAnnouncing({ plan: 'premium', untilOn: '2027-09-01' }, { plan: 'premium', untilOn: '2027-03-01' }),
      false,
    )
  })

  /* Dropping the end date is the same move as pushing it out, with no bound — and putting one
     back on a gift that had none is the shortening, which says nothing. */
  await t.test('losing the end date is news, gaining one is not', () => {
    assert.equal(worthAnnouncing({ plan: 'premium', untilOn: '2027-03-01' }, { plan: 'premium', untilOn: null }), true)
    assert.equal(worthAnnouncing({ plan: 'premium', untilOn: null }, { plan: 'premium', untilOn: '2027-03-01' }), false)
  })

  /*
   * The case the whole predicate exists for. `setGrant` rewrites `granted_at` on every save,
   * so «did the row change» would be true here — and the reader would get a second identical
   * email because somebody fixed a word in an audit field they will never see.
   */
  await t.test('the same gift saved again is not news', () => {
    const gift: GiftSnapshot = { plan: 'premium', untilOn: '2027-03-01' }
    assert.equal(worthAnnouncing(gift, { ...gift }), false)
    assert.equal(worthAnnouncing({ plan: 'lifetime', untilOn: null }, { plan: 'lifetime', untilOn: null }), false)
  })

  await t.test('taking a gift away is never news', () => {
    assert.equal(worthAnnouncing({ plan: 'premium', untilOn: '2027-03-01' }, NONE), false)
    assert.equal(worthAnnouncing({ plan: 'lifetime', untilOn: null }, NONE), false)
    /* Not even from nothing to nothing, which is what a save on an account with no gift and
       no plan chosen would look like if anything ever produced it. */
    assert.equal(worthAnnouncing(NONE, NONE), false)
  })
})

test('giftOccurrenceKey', async (t) => {
  await t.test('names the plan and the day', () => {
    assert.equal(giftOccurrenceKey({ plan: 'premium', untilOn: '2027-03-01' }), 'premium:2027-03-01')
  })

  await t.test('a gift with no end has a key of its own, not an empty one', () => {
    assert.equal(giftOccurrenceKey({ plan: 'lifetime', untilOn: null }), 'lifetime:none')
    /* Distinct from a dated gift of the same plan, which is the point: the two are different
       gifts and the second of them has not been announced. */
    assert.notEqual(
      giftOccurrenceKey({ plan: 'premium', untilOn: null }),
      giftOccurrenceKey({ plan: 'premium', untilOn: '2027-03-01' }),
    )
  })

  /*
   * The reason this key is not `granted_at`: an improved gift must be announceable and a
   * re-saved one must not, and only a key made of the gift itself tells those apart.
   */
  await t.test('moves when the gift does and stands still when it does not', () => {
    const gift: GiftSnapshot & { plan: 'premium' } = { plan: 'premium', untilOn: '2027-03-01' }
    assert.equal(giftOccurrenceKey(gift), giftOccurrenceKey({ ...gift }))
    assert.notEqual(giftOccurrenceKey(gift), giftOccurrenceKey({ ...gift, untilOn: '2027-09-01' }))
    assert.notEqual(giftOccurrenceKey(gift), giftOccurrenceKey({ ...gift, plan: 'lifetime' }))
  })
})
