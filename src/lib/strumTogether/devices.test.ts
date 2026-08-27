import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEVICE_STALE_SECONDS,
  HEARTBEAT_SECONDS,
  admits,
  holdsSlot,
  needsHeartbeat,
  staleBefore,
} from './devices'

/** One fixed instant, so every case below reads as "seen this long before now". */
const NOW = new Date('2026-08-21T20:00:00Z')

/** `seconds` before `NOW` — the only way a `last_seen_at` is expressed in this file. */
function seenAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000)
}

describe('holdsSlot', () => {
  it('holds a slot for a device that has just been seen', () => {
    assert.equal(holdsSlot(NOW, NOW), true)
    assert.equal(holdsSlot(seenAgo(4), NOW), true, 'one poll ago')
  })

  /*
   * The decided behaviour, not an incidental one: a browser throttles a hidden tab's timers
   * to roughly one tick a minute, so this is the phone in a pocket during a song, and it must
   * keep its place. A 60 s window would evict it — which is the whole reason the constant is
   * 120 and why this assertion sits between the two boundary cases below.
   */
  it('holds a slot for a phone whose screen has been locked for a minute', () => {
    assert.equal(holdsSlot(seenAgo(75), NOW), true)
  })

  it('still holds at exactly the staleness window', () => {
    assert.equal(holdsSlot(seenAgo(DEVICE_STALE_SECONDS), NOW), true)
  })

  it('releases the slot one second past the window', () => {
    assert.equal(holdsSlot(seenAgo(DEVICE_STALE_SECONDS + 1), NOW), false)
  })

  /*
   * Clock skew between the app server and Neon can put a Postgres `now()` slightly ahead of
   * Node's, so a freshly written row can read as being in the future. That must count as
   * fresh — the alternative is a device losing the slot it has just been given.
   */
  it('treats a timestamp from the future as fresh', () => {
    assert.equal(holdsSlot(seenAgo(-5), NOW), true)
  })
})

describe('staleBefore', () => {
  /*
   * The point of the helper: the cutoff SQL compares against and the predicate JavaScript
   * evaluates are the same rule, so a broadcast can never refuse a device the poll would have
   * treated as still following. This is the assertion that would fail if somebody tuned one of
   * the two, which is the whole reason the constant is not written twice.
   */
  it('agrees with holdsSlot at the boundary', () => {
    assert.equal(holdsSlot(staleBefore(NOW), NOW), true, 'exactly at the cutoff still holds')
    assert.equal(
      holdsSlot(new Date(staleBefore(NOW).getTime() - 1), NOW),
      false,
      'a millisecond before it does not',
    )
  })

  it('is the staleness window before now', () => {
    assert.equal(NOW.getTime() - staleBefore(NOW).getTime(), DEVICE_STALE_SECONDS * 1000)
  })
})

describe('needsHeartbeat', () => {
  it('writes nothing for a row refreshed a poll ago', () => {
    assert.equal(needsHeartbeat(NOW, NOW), false)
    assert.equal(needsHeartbeat(seenAgo(4), NOW), false)
  })

  /*
   * The saving this whole design rests on: at `POLL_MS = 4000` the polls before the threshold
   * cost a read each and no write at all. Seven of them, which is the "roughly one write per
   * eight polls" the module header claims.
   */
  it('writes nothing for any of the seven polls before the threshold', () => {
    for (let elapsed = 0; elapsed < HEARTBEAT_SECONDS; elapsed += 4) {
      assert.equal(needsHeartbeat(seenAgo(elapsed), NOW), false, `${elapsed}s`)
    }
  })

  it('writes at exactly the throttle threshold', () => {
    assert.equal(needsHeartbeat(seenAgo(HEARTBEAT_SECONDS), NOW), true)
  })

  it('writes for a row that is older still', () => {
    assert.equal(needsHeartbeat(seenAgo(90), NOW), true)
  })

  /*
   * The two constants are a pair, and this is the relationship that makes the slot safe rather
   * than merely cheap: a device that heartbeats whenever this says to can never come close to
   * lapsing, so the throttle can be tuned without anybody having to re-check the cap.
   */
  it('fires well inside the staleness window', () => {
    assert.ok(HEARTBEAT_SECONDS * 4 <= DEVICE_STALE_SECONDS)
  })
})

describe('admits', () => {
  it('lets a device in while the plan has room', () => {
    assert.equal(admits(0, 1, true), true, 'standard, nobody following yet')
    assert.equal(admits(2, 3, true), true, 'plus, one place left')
  })

  it('refuses the device that would exceed the cap', () => {
    assert.equal(admits(1, 1, true), false, 'standard is a duo')
    assert.equal(admits(3, 3, true), false, 'plus is a quartet')
    assert.equal(admits(100, 100, true), false)
  })

  /*
   * THE test of this file. `UNGATED.limits.devices` is 100, so a cap read as a bare
   * `held < max` would refuse the 101st guest of an installation that enforces nothing — a
   * limit nobody configured, imposed by the fail-open value. With the switch off the counting,
   * the heartbeat and the peak all still happen and the refusal is the only thing that does
   * not.
   */
  it('refuses nobody at all when the plans are not enforced', () => {
    assert.equal(admits(100, 100, false), true)
    assert.equal(admits(150, 100, false), true)
    assert.equal(admits(1, 1, false), true)
  })

  /*
   * Free's cap is 0, and it is reached in practice rather than only in theory: a broadcast
   * already running when the subscription lapses is deliberately not interrupted, so it keeps
   * playing under free's cap and refuses every new device. `seatDevice` reports that refusal
   * as `closed` rather than `full`, since no place can ever free up under it.
   */
  it('refuses everybody on a cap of zero', () => {
    assert.equal(admits(0, 0, true), false)
  })
})
