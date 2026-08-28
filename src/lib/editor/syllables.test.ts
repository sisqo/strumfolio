import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { nearestSnap, snapPoints, wordStarts } from './syllables'

describe('word starts', () => {
  it('finds every space-separated word', () => {
    assert.deepEqual(wordStarts('Quando sono solo scrivo'), [0, 7, 12, 17])
  })

  it('skips leading blanks and keeps an elision as one word', () => {
    assert.deepEqual(wordStarts('  ciao'), [2])
    assert.deepEqual(wordStarts("l'anima"), [0])
  })

  it('has none on a wordless line', () => {
    assert.deepEqual(wordStarts('   '), [])
  })
})

describe('snap points', () => {
  it('splits a plain word at its syllables', () => {
    // chi-tar-ra: a digraph onset, a double split between the two letters.
    assert.deepEqual(snapPoints('chitarra'), [0, 3, 6, 8])
  })

  it('keeps a coda consonant with the syllable before it', () => {
    // sem-pre, not se-mpre: the nasal closes the first syllable.
    assert.deepEqual(snapPoints('sempre'), [0, 3, 6])
  })

  it('sends a lone consonant and an s-cluster to the next syllable', () => {
    // pa-sta: s impura opens the second syllable.
    assert.deepEqual(snapPoints('pasta'), [0, 2, 5])
  })

  it('splits a double letter between the two', () => {
    assert.deepEqual(snapPoints('gatto'), [0, 3, 5])
  })

  it('starts a point at every word', () => {
    assert.deepEqual(snapPoints('la la la'), [0, 3, 6, 8])
  })

  it('treats an apostrophe as a word break', () => {
    // l' + a-ni-ma: the elision snaps apart, the word snaps at its syllables.
    assert.deepEqual(snapPoints("l'anima"), [0, 2, 3, 5, 7])
  })

  it('keeps a vowel run as one nucleus', () => {
    // No point inside "uo": a diphthong split would offer targets a finger apart.
    assert.deepEqual(snapPoints('buono'), [0, 3, 5])
  })

  it('always offers the seat past the last word', () => {
    assert.deepEqual(snapPoints(''), [0])
    assert.deepEqual(snapPoints('re'), [0, 2])
  })
})

describe('nearest snap', () => {
  it('pulls a near miss onto the syllable', () => {
    assert.equal(nearestSnap('chitarra', 4), 3)
    assert.equal(nearestSnap('chitarra', 5), 6)
  })

  it('breaks a tie towards the earlier point', () => {
    // 7 sits exactly between tar|ra (6) and the end (8).
    assert.equal(nearestSnap('chitarra', 7), 6)
  })

  it('reaches the seat past the last word', () => {
    assert.equal(nearestSnap('re mi', 5), 5)
  })
})
