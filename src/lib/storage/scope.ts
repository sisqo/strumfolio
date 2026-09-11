'use client'

/**
 * Which account this browser's local caches belong to, and the key names that follow from it.
 *
 * Every `localStorage` key in this app used to be a constant — `songs:songbooks`,
 * `songs:edits`, `songs:prefs` — so it named what was stored and never whose it was. Nothing
 * emptied them at sign-out or when a second account signed in on the same browser, so the next
 * reader inherited the previous one's songbook names and, in `songs:edits`, their words and
 * chords. See `lib/accounts/scope.ts` for the tag itself and why it is a digest.
 *
 * **Two defences, because either one alone fails in a way the other catches.** The keys are
 * scoped, so a cache belonging to another account cannot be read even if it is still sitting
 * there; and the whole area is emptied the moment the tag changes, so another account's words
 * do not linger in devtools on a shared machine. Scoping without emptying leaks history;
 * emptying without scoping leaks whenever the emptying does not run — a tab closed mid-flight,
 * a sign-out that never reached this code — which is exactly how the original bug survived
 * being noticed.
 *
 * **The tag is read from a cookie rather than passed down as a prop**, and that is a decision
 * about where mistakes can happen. `PrefsProvider` alone is mounted on about twenty pages, so a
 * `scope` prop would be twenty chances to omit one, and an omission would silently fall back to
 * an unscoped key — reintroducing this bug on one page, invisibly. A cookie is readable
 * synchronously by any of them, which matters: `SongbookProvider` reads its cache in a
 * `useLayoutEffect`, before the browser paints, so anything asynchronous would arrive too late
 * to prevent the flash.
 */

import { SCOPE_COOKIE, isScopeTag } from '@/lib/accounts/scope'

/** Where the tag of whatever is currently stored is remembered, so a change can be noticed. */
const STORED_SCOPE_KEY = 'songs:scope'

/** Everything this app keeps in `localStorage` is under this prefix, which is what makes the
 *  purge below able to name what to remove without a list that would drift. */
const APP_PREFIX = 'songs:'

/**
 * The two keys under that prefix which are **not** account data and must survive a purge.
 *
 * `songs:theme` belongs to the device, not to whoever is signed in on it: it is read by the
 * inline script in `app/layout.tsx` before React exists, precisely so the page never paints in
 * the wrong colours, and wiping it would make a change of account flash the whole app to the
 * other theme — a visible regression in service of nothing, since a theme says nothing about
 * anybody. `songs:scope` is the marker this module writes to notice the change at all; taking
 * it out would make every load look like a fresh account and purge on every visit.
 */
const DEVICE_KEYS: ReadonlySet<string> = new Set(['songs:theme', STORED_SCOPE_KEY])

/** Whether a key holds something belonging to an account, rather than to this browser. */
function isAccountKey(key: string): boolean {
  return key.startsWith(APP_PREFIX) && !DEVICE_KEYS.has(key)
}

/**
 * The tag for the account currently signed in on this browser, or `null` when there is none to
 * be had — nobody signed in, a session older than this cookie, or storage the browser refuses.
 *
 * `null` makes every caller refuse to read *and* to write, which is the safe direction: the
 * server-rendered snapshot is always correct and always present, so the cost of refusing is a
 * cache miss, while the cost of guessing would be the bug this module exists to end.
 */
export function currentScope(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${SCOPE_COOKIE}=([^;]*)`))
  const value = match === null ? null : decodeURIComponent(match[1])

  return isScopeTag(value) ? value : null
}

/** Runs once per page load; see `keyFor`. */
let purged = false

/**
 * Empty every cache on this device that belongs to a different account than the one signed in
 * now — `localStorage` and the service worker's page caches alike.
 *
 * Called from `keyFor` rather than from a mount somewhere, deliberately: the guarantee wanted
 * is "before the first read", and the only place that can promise it is the read itself. A
 * component asked to do this in an effect is a component somebody can forget to render.
 */
function purgeIfForeign(scope: string): void {
  if (purged) return
  purged = true

  try {
    if (window.localStorage.getItem(STORED_SCOPE_KEY) === scope) return

    for (const key of Object.keys(window.localStorage)) {
      if (isAccountKey(key)) window.localStorage.removeItem(key)
    }
    window.localStorage.setItem(STORED_SCOPE_KEY, scope)
  } catch {
    // Private mode, or storage disabled. Nothing is cached either way, so nothing can leak.
    return
  }

  /* The service worker's page caches hold whole rendered screens of the previous account and
     are keyed by URL alone, so they carry the same problem one layer down. Not awaited: this
     runs on the render path and the caches it clears are only ever consulted offline, where a
     few milliseconds later is soon enough. */
  void clearPageCaches()
}

/** Drop every Cache Storage entry. Best effort — an old browser or a denied permission simply
 *  leaves the service worker's own `rejectUnauthenticated` and `NetworkFirst` as they were. */
export async function clearPageCaches(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    const names = await caches.keys()
    await Promise.all(names.map((name) => caches.delete(name)))
  } catch {
    // Nothing to do: this is a defence in depth, not the defence.
  }
}

/**
 * The storage key a cache should use, or `null` when this browser must not cache at all.
 *
 * `base` is what the key used to be in full (`songs:songbooks`), so the old name stays readable
 * in the new one and a key seen in devtools is still traceable to the module that writes it.
 */
export function keyFor(base: string): string | null {
  const scope = currentScope()
  if (scope === null) return null

  purgeIfForeign(scope)

  return `${APP_PREFIX}${scope}:${base.startsWith(APP_PREFIX) ? base.slice(APP_PREFIX.length) : base}`
}

/**
 * Empty this device's caches outright, whoever they belong to — the sign-out path.
 *
 * Scoped keys already stop the *next* account reading them, so this is about what is left
 * behind rather than about what is served: after signing out on a borrowed laptop, another
 * account's songs should not still be sitting in `localStorage` for anybody who looks.
 */
export function clearLocalStorageForSignOut(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (isAccountKey(key)) window.localStorage.removeItem(key)
    }
  } catch {
    // Storage unavailable; there is nothing stored to clear.
  }
}
