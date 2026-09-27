import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { prunable, shouldKeep } from './keep'

describe('shouldKeep', () => {
  it('keeps whatever an AI write replaces', () => {
    assert.equal(shouldKeep({ kind: 'ai', tokenId: 1 }, { aiWrittenAt: null }), true)
    assert.equal(shouldKeep({ kind: 'ai', tokenId: 1 }, { aiWrittenAt: new Date() }), true)
  })

  it('keeps an AI text the app overwrites, and nothing else the app overwrites', () => {
    assert.equal(shouldKeep({ kind: 'app' }, { aiWrittenAt: new Date() }), true)
    assert.equal(shouldKeep({ kind: 'app' }, { aiWrittenAt: null }), false)
  })

  it('always keeps on a restore', () => {
    assert.equal(shouldKeep({ kind: 'app' }, { aiWrittenAt: null }, true), true)
  })
})

describe('prunable', () => {
  const rows = (authors: ('app' | 'ai')[]) =>
    authors.map((writtenBy, index) => ({ id: authors.length - index, writtenBy }))

  it('keeps the newest twenty', () => {
    const all = rows(Array.from({ length: 22 }, () => 'app' as const))
    assert.deepEqual(prunable(all), [2, 1])
  })

  it('never prunes the newest version a person wrote, however many AI saves followed', () => {
    const all = rows([...Array.from({ length: 25 }, () => 'ai' as const), 'app', 'app'])
    const doomed = prunable(all)
    const human = all.find((row) => row.writtenBy === 'app')!.id
    assert.equal(doomed.includes(human), false)
    assert.equal(doomed.length, all.length - 20 - 1)
  })

  it('prunes nothing under the limit', () => {
    assert.deepEqual(prunable(rows(['ai', 'app', 'ai'])), [])
  })
})
