import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { readNotesHidden, writeNotesHidden } from './notesVisibility'

/**
 * There is no DOM under `tsx --test`, so `window` is what these install and remove — which
 * is also the first case worth covering: on the server there is no storage at all, and the
 * provider renders there before it renders anywhere else.
 */
type FakeStorage = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void }

function install(storage: FakeStorage): void {
  ;(globalThis as { window?: unknown }).window = { sessionStorage: storage }
}

function memoryStorage(): FakeStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>()
  return {
    entries,
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => void entries.set(k, v),
    removeItem: (k) => void entries.delete(k),
  }
}

/** Private mode: reaching for the store throws on read as well as on write. */
function throwingStorage(): FakeStorage {
  const refuse = (): never => {
    throw new Error('storage disabled')
  }
  return { getItem: refuse, setItem: refuse, removeItem: refuse }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

test('with no window at all the notes are visible', () => {
  assert.equal(readNotesHidden(), false)
})

test('nothing stored reads as visible', () => {
  install(memoryStorage())
  assert.equal(readNotesHidden(), false)
})

test('hiding survives a read, and showing again clears it', () => {
  const storage = memoryStorage()
  install(storage)

  writeNotesHidden(true)
  assert.equal(readNotesHidden(), true)

  writeNotesHidden(false)
  assert.equal(readNotesHidden(), false)
  // Cleared rather than written as a falsy value: nothing stored and "not hidden" are the
  // same answer, and one of them is not a row in somebody's storage inspector.
  assert.equal(storage.entries.size, 0)
})

test('a browser refusing storage reads as visible instead of throwing', () => {
  install(throwingStorage())
  assert.equal(readNotesHidden(), false)
})

test('a browser refusing storage swallows the write', () => {
  install(throwingStorage())
  assert.doesNotThrow(() => writeNotesHidden(true))
})
