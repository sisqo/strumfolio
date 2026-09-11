'use client'

import { useEffect } from 'react'

import { clearLocalStorageForSignOut, clearPageCaches, currentScope } from '@/lib/storage/scope'

/**
 * Empties this browser's account caches when nobody is signed in.
 *
 * Rendered on `/login`, which is where `signOut()` lands. Scoped keys already stop the *next*
 * account reading what the last one left (`lib/storage/scope.ts`), so this is not about what
 * gets served — it is about what is left lying there. After signing out on a borrowed or shared
 * laptop, another person's songbook names, and in `songs:edits` their words and chords, should
 * not still be sitting in `localStorage` for anybody who opens devtools.
 *
 * **`currentScope() === null` is the signal, not the URL.** The sign-out action deletes the
 * scope cookie, so its absence means «no session here» — while a reader who is perfectly signed
 * in and merely looking at `/login` still carries it and keeps their offline copy, which they
 * would otherwise lose for having visited the wrong page. A visitor who has never signed in has
 * nothing to clear and this costs them one empty loop.
 *
 * In an effect rather than during render, and deliberately not in a layout effect: nothing on
 * screen depends on the outcome, so there is no reason to make the browser wait for it.
 */
export function StorageCleanup() {
  useEffect(() => {
    if (currentScope() !== null) return

    clearLocalStorageForSignOut()
    void clearPageCaches()
  }, [])

  return null
}
