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
export function createPrefsQueue(options: { debounceMs?: number; retryMs?: number } = {}) {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS
  const retryMs = options.retryMs ?? RETRY_MS

  /**
   * At most one pending write per target: only the latest value matters, so a
   * reader tapping +1 five times produces one save, not five.
   */
  const pending = new Map<QueueKey, Pending>()
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
        }
      }
    } finally {
      flushing = false
    }

    // A failure needs its own retry: otherwise the write waits for the app to be
    // backgrounded or the connection to drop and return.
    if (retry) schedule(retryMs)
  }

  return {
    setHandlers(next: QueueHandlers) {
      handlers = next
    },

    subscribe(listener: (count: number) => void): () => void {
      listeners.add(listener)
      listener(pending.size)
      return () => listeners.delete(listener)
    },

    enqueueGlobal(prefs: GlobalPrefs) {
      pending.set('global', { kind: 'global', prefs })
      notify()
      schedule(debounceMs)
    },

    enqueueSong(slug: string, prefs: SongPrefs) {
      pending.set(`song:${slug}`, { kind: 'song', slug, prefs })
      notify()
      schedule(debounceMs)
    },

    enqueueFavorite(slug: string, favorite: boolean) {
      pending.set(`favorite:${slug}`, { kind: 'favorite', slug, favorite })
      notify()
      schedule(debounceMs)
    },

    enqueueTabsExpanded(slug: string, tabsExpanded: boolean) {
      pending.set(`tabsExpanded:${slug}`, { kind: 'tabsExpanded', slug, tabsExpanded })
      notify()
      schedule(debounceMs)
    },

    /** True while a change for this scope has not reached the server yet. */
    hasPending(key: QueueKey): boolean {
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

export const prefsQueue = createPrefsQueue()
