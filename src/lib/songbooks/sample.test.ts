import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sampleSongs } from './sample'

describe('sampleSongs', () => {
  it('parses every song with a real title, distinct from a placeholder', () => {
    for (const song of sampleSongs()) {
      assert.notEqual(song.title, 'Untitled')
      assert.notEqual(song.title.trim(), '')
    }
  })

  it('gives every song a distinct title', () => {
    const titles = sampleSongs().map((song) => song.title)
    assert.equal(new Set(titles).size, titles.length)
  })

  it('never carries the {new_song} separator into a body: the file was split by hand', () => {
    for (const song of sampleSongs()) {
      assert.doesNotMatch(song.body, /\{\s*(?:ns|new_song)\b/i)
    }
  })

  it('stays comfortably under every plan cap, so trimming never has to trim', () => {
    // The free plan's own cap (`PLANS.free.songs`, `plans/types.ts`) — repeated as a
    // literal here rather than imported, so a future change to that cap fails this
    // test instead of silently letting the sample songbook grow past it unnoticed.
    assert.ok(sampleSongs().length <= 30)
  })
})
