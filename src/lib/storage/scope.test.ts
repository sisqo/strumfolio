import assert from 'node:assert/strict'
import { test } from 'node:test'

/* A browser's worth of globals, just enough for `scope.ts`: a cookie jar, an enumerable
   `localStorage`, and a Cache Storage that records what it was asked to delete. */
const store = new Map<string, string>()
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
}
const localStorage = new Proxy(storage, {
  ownKeys: () => [...store.keys()],
  getOwnPropertyDescriptor: (target, key) =>
    typeof key === 'string' && store.has(key)
      ? { enumerable: true, configurable: true, value: store.get(key) }
      : Object.getOwnPropertyDescriptor(target, key),
})
let cookie = ''
const deleted: string[] = []
Object.assign(globalThis, {
  document: {
    get cookie() {
      return cookie
    },
  },
  window: { localStorage },
  caches: {
    keys: async () => ['repertoire', 'home'],
    delete: async (name: string) => (deleted.push(name), true),
  },
})

test('one tab going from one account to another settles the second one too', async () => {
  const { keyFor, settleScope, clearLocalStorageForSignOut } = await import('./scope')
  const a = 'a'.repeat(16)
  const b = 'b'.repeat(16)

  cookie = `songbook-scope=${a}`
  const aKey = keyFor('songs:edits')
  assert.ok(aKey !== null)
  store.set(aKey, 'A')
  await settleScope()

  /* Sign-out and a password sign-in are soft navigations: same realm, new cookie. */
  cookie = ''
  clearLocalStorageForSignOut()
  cookie = `songbook-scope=${b}`
  deleted.length = 0
  await settleScope()

  assert.equal(store.get('songs:scope'), b, 'the marker names the account now signed in')
  assert.deepEqual(deleted.sort(), ['home', 'repertoire'], "the previous account's pages are emptied")

  /* And B's own writes survive B's next read, which is what the next cold launch does. */
  const bKey = keyFor('songs:edits')
  assert.ok(bKey !== null)
  store.set(bKey, 'B')
  deleted.length = 0
  await settleScope()
  assert.equal(store.get(bKey), 'B')
  assert.deepEqual(deleted, [])
})
