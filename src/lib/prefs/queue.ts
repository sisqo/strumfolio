'use client'

/**
 * Write queue for preferences.
 *
 * A change takes effect on screen immediately and the save is queued. If the
 * network is gone the queue holds it and drains when the connection returns, so
 * transposing a song in a rehearsal room with no signal works and is not lost
 * quietly.
 *
 * The queue lives in memory only. That is the deliberate limit of keeping the
 * database as the single source of truth: reloading the page while still offline
 * loses a queued change. It is a small, understood cost, and it is why the
 * indicator in the control bar exists — a pending write is visible.
 */

import { keyFor } from '@/lib/storage/scope'

import type { SaveResult } from './actions'
import type { GlobalPrefs, SongPrefs } from './types'

type Pending =
  | { kind: 'global'; prefs: GlobalPrefs }
  | { kind: 'song'; slug: string; prefs: SongPrefs }
  /**
   * The star, and the one entry here that does not carry a whole row.
   *
   * A key of its own rather than a field inside `song`, because the two are queued
   * under different circumstances: a capo is moved by somebody already reading, while
   * the star is tapped the instant a page opens — before the server's row has arrived.
   * Sharing `song:${slug}` would make that tap pin whatever the client happened to be
   * showing at the time, which is the defaults, and flush them over the reader's real
   * preferences. See `saveFavorite` for the race in full.
   *
   * Last-write-wins per song is still exactly right for this one: five taps of the same
   * star are one save, the same way five taps of +1 are.
   */
  | { kind: 'favorite'; slug: string; favorite: boolean }
  /**
   * Whether the tab blocks show open, and the other entry that does not carry a whole
   * row — same reasoning as `favorite` right above: a tab can be tapped open on the very
   * first render of a song, before its row has arrived, and sharing `song:${slug}` would
   * make that tap pin the client's still-default capo and semitones. See `saveTabsExpanded`.
   */
  | { kind: 'tabsExpanded'; slug: string; tabsExpanded: boolean }

export type QueueKey = 'global' | `song:${string}` | `favorite:${string}` | `tabsExpanded:${string}`

const DEBOUNCE_MS = 2000
/** Longer than the debounce: a failing server should not be hammered. */
const RETRY_MS = 15000

export interface QueueHandlers {
  saveGlobal: (prefs: GlobalPrefs) => Promise<SaveResult>
  saveSong: (slug: string, prefs: SongPrefs) => Promise<SaveResult>
  saveFavorite: (slug: string, favorite: boolean) => Promise<SaveResult>
  saveTabsExpanded: (slug: string, tabsExpanded: boolean) => Promise<SaveResult>
}

/**
 * Built as a factory rather than module-level state so it can be tested without
 * a backdoor to reset globals.
 */
/**
 * Where the queue keeps itself between page loads (2026-10-17). In memory alone, a change made
 * seconds before a reload or a closed tab was lost: confirmed in a real browser — five taps of
 * +1 and a star, Next, reload, and the server's old row came back over the device's newer one,
 * because `adopt.ts` lets the server win when nothing is pending. Restored, the entries are
 * pending again, so the device's value stands and is sent.
 */
export interface QueuePersistence {
  load(): [string, Pending][] | null
  save(entries: [string, Pending][]): void
}

export function createPrefsQueue(
  options: { debounceMs?: number; retryMs?: number; persist?: QueuePersistence } = {},
) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS
  const retryMs = options.retryMs ?? RETRY_MS
  const persist = options.persist

  /**
   * At most one pending write per target: only the latest value matters, so a
   * reader tapping +1 five times produces one save, not five.
   */
  const pending = new Map<QueueKey, Pending>()
  let restored = false
  /** Read back once, the first time anything asks — in the browser, after the scope exists. */
  function restore() {
    if (restored || persist === undefined || typeof window === 'undefined') return
    restored = true
    const stored = persist.load()
    if (stored === null) return
    for (const [key, entry] of stored) if (!pending.has(key as QueueKey)) pending.set(key as QueueKey, entry)
    if (pending.size > 0) {
      notify()
      schedule(debounceMs)
    }
  }
  function save() {
    if (persist === undefined || typeof window === 'undefined') return
    persist.save([...pending.entries()])
  }
  const listeners = new Set<(count: number) => void>()

  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing = false
  let handlers: QueueHandlers | null = null
  let wired = false

  function notify() {
    for (const listener of listeners) listener(pending.size)
  }

  function schedule(delay: number) {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delay)

    // In Node the timer would otherwise hold the event loop open, which hangs
    // the test run. Browsers return a plain number and are unaffected.
    if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref()
  }

  async function flush(): Promise<void> {
    restore()
    if (flushing || handlers === null || pending.size === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return

    flushing = true
    let retry = false

    try {
      // Snapshot the keys: an entry replaced while we were away must not be
      // dropped, so only the exact value we sent is removed.
      for (const [key, entry] of [...pending.entries()]) {
        let result: SaveResult
        try {
          if (entry.kind === 'global') result = await handlers.saveGlobal(entry.prefs)
          else if (entry.kind === 'song') result = await handlers.saveSong(entry.slug, entry.prefs)
          else if (entry.kind === 'favorite') result = await handlers.saveFavorite(entry.slug, entry.favorite)
          else result = await handlers.saveTabsExpanded(entry.slug, entry.tabsExpanded)
        } catch {
          // Offline, or the request never arrived.
          retry = true
          break
        }

        if (result === 'failed') {
          retry = true
          break
        }

        /**
         * Everything but 'failed' clears the entry — 'saved', 'no-destination' and
         * 'not-in-plan' alike. Without that, the queue would never empty when there is
         * nobody signed in, no database configured, or a preference the plan will not
         * store — and the indicator that exists to promise "nothing is lost in silence"
         * would sit there lying. Only 'failed' is a write that might yet succeed.
         */
        if (pending.get(key) === entry) {
          pending.delete(key)
          notify()
          save()
        }
      }
    } finally {
      flushing = false
    }

    // A failure needs its own retry: otherwise the write waits for the app to be
    // backgrounded or the connection to drop and return.
    if (retry) schedule(retryMs)
    // And a change made while this flush was out — its own `schedule` found `flushing` set
    // and gave up — would otherwise wait for the next change or the next `online`.
    else if (pending.size > 0) schedule(debounceMs)
  }

  return {
    setHandlers(next: QueueHandlers) {
      handlers = next
      restore()
    },

    subscribe(listener: (count: number) => void): () => void {
      restore()
      listeners.add(listener)
      listener(pending.size)
      return () => listeners.delete(listener)
    },

    enqueueGlobal(prefs: GlobalPrefs) {
      restore()
      pending.set('global', { kind: 'global', prefs })
      notify()
      save()
      schedule(debounceMs)
    },

    enqueueSong(slug: string, prefs: SongPrefs) {
      restore()
      pending.set(`song:${slug}`, { kind: 'song', slug, prefs })
      notify()
      save()
      schedule(debounceMs)
    },

    enqueueFavorite(slug: string, favorite: boolean) {
      restore()
      pending.set(`favorite:${slug}`, { kind: 'favorite', slug, favorite })
      notify()
      save()
      schedule(debounceMs)
    },

    enqueueTabsExpanded(slug: string, tabsExpanded: boolean) {
      restore()
      pending.set(`tabsExpanded:${slug}`, { kind: 'tabsExpanded', slug, tabsExpanded })
      notify()
      save()
      schedule(debounceMs)
    },

    /** True while a change for this scope has not reached the server yet. */
    hasPending(key: QueueKey): boolean {
      restore()
      return pending.has(key)
    },

    /**
     * The stars still waiting, slug by slug, with the value each is waiting to write.
     *
     * `hasPending` answers about one key a caller already knows the name of, which is no
     * use to a list: `FavoritesProvider` has to learn *which* songs have just been starred
     * without being told, and it has to learn the value too — a star tapped on and off
     * again inside the debounce window is one entry whose value changed and whose key did
     * not.
     */
    pendingFavorites(): Record<string, boolean> {
      restore()
      const found: Record<string, boolean> = {}
      for (const entry of pending.values()) {
        if (entry.kind === 'favorite') found[entry.slug] = entry.favorite
      }
      return found
    },

    size(): number {
      return pending.size
    },

    flush,

    /** Drains the queue when the connection comes back. */
    watchConnection() {
      if (wired || typeof window === 'undefined') return
      wired = true

      window.addEventListener('online', () => void flush())
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void flush()
      })
    },
  }
}

/** The queue's own key, scoped to the account like every other (`keyFor`): another reader
    signing in on this device never sends this one's changes. */
const QUEUE_KEY = 'prefs-queue'

export const prefsQueue = createPrefsQueue({
  persist: {
    load() {
      try {
        const key = keyFor(QUEUE_KEY)
        const raw = key === null ? null : window.localStorage.getItem(key)
        const parsed: unknown = raw === null ? null : JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as [string, Pending][]) : null
      } catch {
        return null
      }
    },
    save(entries) {
      try {
        const key = keyFor(QUEUE_KEY)
        if (key === null) return
        if (entries.length === 0) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, JSON.stringify(entries))
      } catch {
        // Private mode or a full quota: the queue still works in memory, as it always did.
      }
    },
  },
})
