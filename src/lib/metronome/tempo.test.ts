import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_BPM,
  MAX_BPM,
  MIN_BPM,
  beatSeconds,
  beatsDue,
  clampBeatsPerBar,
  clampBpm,
  parseTimeSignature,
  readBeatsPerBar,
  readBpm,
} from './tempo'

describe('readBpm', () => {
  it('keeps a tempo somebody actually wrote', () => {
    assert.equal(readBpm(96), 96)
    assert.equal(readBpm('76'), 76)
    assert.equal(readBpm(' 120 '), 120)
  })

  /*
   * The case this exists for. `{tempo: fast}` and `{tempo: allegro}` are both written by
   * real apps, and `Number('fast')` is `NaN` — which passes `typeof value === 'number'`,
   * survives every clamp, and reaches the audio clock as a beat interval of `NaN`. Null is
   * the honest answer: the song has not said, so the reader's own value or the default
   * stands.
   */
  it('says nothing rather than NaN for a tempo written in words', () => {
    for (const value of ['fast', 'allegro', '', undefined, null, {}, [], Number.NaN, Infinity]) {
      assert.equal(readBpm(value), null)
    }
  })

  it('refuses what is out of range instead of clamping it', () => {
    assert.equal(readBpm(MIN_BPM - 1), null)
    assert.equal(readBpm(MAX_BPM + 1), null)
    assert.equal(readBpm(0), null)
    assert.equal(readBpm(-120), null)
  })

  /* A stored value is narrowed, never clamped: 500 in a row is corruption or a newer
     deploy, and beating at 300 because of it would be inventing a tempo nobody chose. The
     reader's own steppers are the other direction — see `clampBpm`. */
  it('is not the same thing as clamping', () => {
    assert.equal(readBpm(500), null)
    assert.equal(clampBpm(500), MAX_BPM)
  })
})

describe('clampBpm', () => {
  it('holds the reader inside the range', () => {
    assert.equal(clampBpm(MIN_BPM - 40), MIN_BPM)
    assert.equal(clampBpm(MAX_BPM + 40), MAX_BPM)
    assert.equal(clampBpm(119.6), 120)
  })
})

describe('readBeatsPerBar and clampBeatsPerBar', () => {
  it('admits a bar this app does not offer in its menu', () => {
    assert.equal(readBeatsPerBar(5), 5)
    assert.equal(clampBeatsPerBar(5), 5)
  })

  it('says nothing for what is not a bar at all', () => {
    for (const value of [0, -3, 13, 'quattro', null, undefined]) {
      assert.equal(readBeatsPerBar(value), null)
    }
  })
})

describe('parseTimeSignature', () => {
  it('counts the beats and drops the note value', () => {
    assert.equal(parseTimeSignature('4/4'), 4)
    assert.equal(parseTimeSignature('3/4'), 3)
    assert.equal(parseTimeSignature(' 6/8 '), 6)
    assert.equal(parseTimeSignature('12/8'), 12)
  })

  it('refuses what it cannot count', () => {
    for (const value of ['common', 'C', '4', '4/', 'four/four', '']) {
      assert.equal(parseTimeSignature(value), null)
    }
  })
})

describe('beatSeconds', () => {
  it('is a beat every half second at 120', () => {
    assert.equal(beatSeconds(120), 0.5)
    assert.equal(beatSeconds(60), 1)
  })
})

/**
 * The loop's whole behaviour, tested where an `AudioContext` is not needed for it.
 *
 * Every case below is one this hook actually meets on a phone: a tick that finds nothing
 * due, a tick that finds one, a bar counted from the first beat, and — the one that
 * matters most — waking up after the screen went off.
 */
describe('beatsDue', () => {
  const seconds = 0.5

  it('schedules nothing when the next beat is past the horizon', () => {
    const result = beatsDue({ time: 10, index: 0 }, { now: 9, horizon: 0.1, seconds, beatsPerBar: 4 })
    assert.deepEqual(result.beats, [])
    assert.deepEqual(result.phase, { time: 10, index: 0 })
  })

  it('schedules every beat inside the horizon, at times the phase decided', () => {
    const result = beatsDue(
      { time: 10, index: 0 },
      { now: 9.95, horizon: 1.1, seconds, beatsPerBar: 4 },
    )
    assert.deepEqual(
      result.beats.map((beat) => beat.time),
      [10, 10.5, 11],
    )
    assert.deepEqual(result.phase, { time: 11.5, index: 3 })
  })

  it('accents the first beat of each bar and nothing else', () => {
    const result = beatsDue(
      { time: 0, index: 0 },
      { now: 0, horizon: 4.1, seconds, beatsPerBar: 4 },
    )
    assert.deepEqual(
      result.beats.map((beat) => beat.accent),
      [true, false, false, false, true, false, false, false, true],
    )
  })

  /* One in a bar is how the accent is turned off: every beat is a downbeat, so no beat
     stands out — the same sound as no accent at all, without a control that means "off". */
  it('accents every beat when the bar is one', () => {
    const result = beatsDue({ time: 0, index: 0 }, { now: 0, horizon: 1.1, seconds, beatsPerBar: 1 })
    assert.ok(result.beats.every((beat) => beat.accent))
  })

  /*
   * The pocket case. A hidden tab's timers fire about once a second, so the phase is
   * routinely seconds behind by the time anything runs again. Scheduling that backlog
   * would fire it all at once — a burst of clicks, not a tempo.
   */
  it('drops the beats that went by while the tab was hidden', () => {
    const result = beatsDue(
      { time: 10, index: 0 },
      { now: 20, horizon: 0.1, seconds, beatsPerBar: 4 },
    )
    assert.deepEqual(
      result.beats.map((beat) => beat.time),
      [20],
    )
    /* Twenty beats went by unheard, and the count knows it: the bar of the beat that does
       sound is the bar the metronome would have been in, not a fresh one starting here. */
    assert.equal(result.beats[0].index, 20)
    assert.equal(result.beats[0].accent, true)
  })

  it('catches up an hour of silence without an hour of arithmetic', () => {
    const result = beatsDue(
      { time: 0, index: 0 },
      { now: 3600, horizon: 0.1, seconds, beatsPerBar: 4 },
    )
    assert.equal(result.beats.length, 1)
    assert.equal(result.phase.index, 7201)
  })

  /*
   * The property the whole design exists for: where a beat lands never depends on when the
   * timer ran. Ticking at deliberately uneven moments must produce exactly the grid an
   * even tick would.
   */
  it('puts a beat in the same place however uneven the timer is', () => {
    let phase = { time: 0, index: 0 }
    const times: number[] = []
    const gaps = [0.02, 0.09, 0.05, 0.1, 0.03]
    let now = 0
    for (let tick = 0; now <= 2.05; tick += 1) {
      const result = beatsDue(phase, { now, horizon: 0.12, seconds, beatsPerBar: 4 })
      times.push(...result.beats.map((beat) => beat.time))
      phase = result.phase
      now += gaps[tick % gaps.length]
    }
    assert.deepEqual(times, [0, 0.5, 1, 1.5, 2])
  })

  /*
   * The other half of the same property, and the reason `GRACE_SECONDS` exists. A timer
   * that fires two milliseconds after a beat was due has not missed it in any sense a
   * listener could hear, and dropping it there would lose a click for nothing. The beat is
   * scheduled at its own time, which is already past, and the audio clock plays it at once.
   */
  it('still plays a beat the timer was a hair late for', () => {
    const result = beatsDue(
      { time: 0.5, index: 1 },
      { now: 0.502, horizon: 0.02, seconds, beatsPerBar: 4 },
    )
    assert.deepEqual(
      result.beats.map((beat) => beat.time),
      [0.5],
    )
  })

  it('beats at the default tempo when nothing has said otherwise', () => {
    assert.equal(beatSeconds(DEFAULT_BPM), 0.5)
  })
})
