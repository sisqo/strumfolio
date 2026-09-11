'use client'

/**
 * Whether the lists are showing only the starred songs.
 *
 * In `localStorage` and not in the database, on the same reasoning `sections/folds.ts`
 * gives for itself: this is the state of an evening, not a preference to find again on
 * the tablet — and it has to survive with no network, which is when it is used.
 *
 * **One switch for the whole app**, not one per screen. Turned on from the home screen it
 * is on inside a songbook too, and it is still on when a reader comes back from a song —
 * which is the gesture this exists for: open a favorite, play it, come back for the next
 * one. Two switches would raise a question ("why is it on here and off there?") that one
 * switch never asks.
 *
 * Read in a layout effect, never during render: this is a value the server does not have,
 * and reading it while rendering would produce markup the server never sent.
 */

import { keyFor } from '@/lib/storage/scope'

/** Base name; `keyFor` scopes it to the signed-in account — see `lib/storage/scope.ts`. */
const KEY = 'songs:favorites-only'

export function readFavoritesOnly(): boolean {
  if (typeof window === 'undefined') return false

  /* No scope, no cache — never an unscoped one. The unfiltered list is the safe answer and
     the one this function already gives when storage is unavailable. */
  const key = keyFor(KEY)
  if (key === null) return false

  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    // Private-mode browsers and disabled storage both throw. Everything shows: the
    // filter is a convenience, and the unfiltered list is the safe answer.
    return false
  }
}

export function writeFavoritesOnly(only: boolean): void {
  if (typeof window === 'undefined') return

  const key = keyFor(KEY)
  if (key === null) return

  try {
    window.localStorage.setItem(key, only ? 'true' : 'false')
  } catch {
    // The memory is optional by design: the filter still works for this visit.
  }
}
