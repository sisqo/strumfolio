import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  finishTime,
  formatClockTime,
  formatDuration,
  formatSpoken,
  parseClockTime,
  parseDuration,
  readSetlist,
  setlistTotals,
} from './setlist'

describe('reading a length', () => {
  it('reads the one form a setlist is written in', () => {
    assert.equal(parseDuration('3:45'), 225)
    assert.equal(parseDuration('03:45'), 225)
    assert.equal(parseDuration('12:00'), 720)
    assert.equal(parseDuration('1:15:30'), 4530)
  })

  it('allows minutes past sixty in the short form, because a long track exists', () => {
    assert.equal(parseDuration('75:00'), 4500)
  })

  it('refuses seconds past sixty rather than carrying them', () => {
    /* `3:75` is a typo. Reading it as 4:15 would add fifteen seconds of music nobody wrote. */
    assert.equal(parseDuration('3:75'), null)
    assert.equal(parseDuration('1:75:00'), null)
  })

  it('refuses everything ambiguous', () => {
    /* Each of these has two plausible readings, and the page names the one form instead of
       guessing between them — see the module header. */
    for (const token of ['4', '3.45', '4m10s', '210s', '1:2:3:4', '', 'three']) {
      assert.equal(parseDuration(token), null, `«${token}» was read as a length`)
    }
  })
})

describe('reading a pasted setlist', () => {
  it('takes the length off the end and leaves the title alone', () => {
    const songs = readSetlist('1. The Last Bus Home 3:45\nDanny Boy 4:10')

    assert.deepEqual(songs, [
      { title: '1. The Last Bus Home', seconds: 225, unreadable: false },
      { title: 'Danny Boy', seconds: 250, unreadable: false },
    ])
  })

  it('leaves a song with no length for the default to fill', () => {
    const songs = readSetlist('The Last Bus Home\nDanny Boy 4:10')

    assert.equal(songs[0].seconds, null)
    assert.equal(songs[0].title, 'The Last Bus Home')
  })

  /*
   * The trap this module was written around: a number at the end of a line is far more often
   * the end of a title than a length, so it must stay in the title. A calculator that ate it
   * would report a set that is minutes shorter than the one being played.
   */
  it('does not mistake a number in a title for a length', () => {
    const songs = readSetlist('Interlude 2\nBlues No. 5\nTake 4')

    assert.deepEqual(
      songs.map((song) => song.title),
      ['Interlude 2', 'Blues No. 5', 'Take 4'],
    )
    assert.ok(songs.every((song) => song.seconds === null))
    assert.ok(songs.every((song) => !song.unreadable))
  })

  it('reports a length it could not read instead of swallowing it', () => {
    const songs = readSetlist('The Last Bus Home 3:75')

    assert.equal(songs[0].unreadable, true)
    assert.equal(songs[0].seconds, null)
    assert.equal(songs[0].title, 'The Last Bus Home 3:75')
  })

  it('accepts a bare list of lengths, which is a real way to use the box', () => {
    const songs = readSetlist('3:45\n4:10')

    assert.deepEqual(
      songs.map((song) => song.seconds),
      [225, 250],
    )
    assert.ok(songs.every((song) => song.title === 'Untitled'))
  })

  it('skips blank lines and both line endings', () => {
    assert.equal(readSetlist('A 3:00\r\n\r\nB 3:00\n\n').length, 2)
  })
})

describe('what the set adds up to', () => {
  const songs = readSetlist('A 3:00\nB 4:00\nC 5:00')

  it('adds the music and the gaps between it', () => {
    const totals = setlistTotals(songs, 240, 30)

    assert.equal(totals.playSeconds, 12 * 60)
    /* Three songs, two gaps — the whole reason this is a function. */
    assert.equal(totals.gapSeconds, 60)
    assert.equal(totals.totalSeconds, 13 * 60)
    assert.equal(totals.assumed, 0)
  })

  it('never puts a gap after the last song', () => {
    for (let count = 0; count <= 4; count += 1) {
      const list = readSetlist(Array.from({ length: count }, () => 'X 3:00').join('\n'))
      assert.equal(setlistTotals(list, 240, 60).gapSeconds, Math.max(0, count - 1) * 60)
    }
  })

  it('fills the songs that stated no length, and says how many it filled', () => {
    const mixed = readSetlist('A 3:00\nB\nC')
    const totals = setlistTotals(mixed, 240, 0)

    assert.equal(totals.assumed, 2)
    assert.equal(totals.playSeconds, 180 + 240 + 240)
  })

  it('has an answer for an empty list', () => {
    const totals = setlistTotals([], 240, 30)

    assert.deepEqual(totals, { songs: 0, playSeconds: 0, gapSeconds: 0, totalSeconds: 0, assumed: 0 })
  })
})

describe('saying a length back', () => {
  it('writes a length the way a musician writes one', () => {
    assert.equal(formatDuration(225), '3:45')
    assert.equal(formatDuration(4530), '1:15:30')
    assert.equal(formatDuration(0), '0:00')
    assert.equal(formatDuration(59), '0:59')
  })

  it('rounds a spoken length up, because a slot is a promise', () => {
    assert.equal(formatSpoken(44 * 60 + 20), '45 min')
    assert.equal(formatSpoken(3600), '1 h')
    assert.equal(formatSpoken(4530), '1 h 16 min')
    assert.equal(formatSpoken(0), '0 min')
  })
})

describe('the wall clock', () => {
  it('reads a time and writes it back', () => {
    assert.equal(parseClockTime('21:30'), 21 * 60 + 30)
    assert.equal(parseClockTime('9:05'), 9 * 60 + 5)
    assert.equal(formatClockTime(21 * 60 + 30), '21:30')
    assert.equal(formatClockTime(9 * 60 + 5), '09:05')
  })

  it('refuses what is not a time', () => {
    for (const value of ['24:00', '25:10', '21:60', 'half nine', '', '21']) {
      assert.equal(parseClockTime(value), null, `«${value}» was read as a time`)
    }
  })

  it('finishes a set that runs past midnight, and says so', () => {
    const late = finishTime(parseClockTime('22:30') ?? 0, 2 * 3600 + 15 * 60)

    assert.equal(late.clock, '00:45')
    assert.equal(late.nextDay, true)
  })

  it('does not claim tomorrow for a set that ends tonight', () => {
    const early = finishTime(parseClockTime('19:00') ?? 0, 45 * 60)

    assert.equal(early.clock, '19:45')
    assert.equal(early.nextDay, false)
  })

  it('rounds the finish up to the minute, late rather than early', () => {
    assert.equal(finishTime(20 * 60, 20).clock, '20:01')
  })
})
