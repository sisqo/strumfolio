'use client'

/**
 * Local cache for the mutable songbook layer.
 *
 * Same role as the preferences cache: the database stays the source of truth,
 * but the pages are static and precached, so without a local copy a rename would
 * only appear after a rebuild, and offline the app would show whatever the last
 * build happened to bake in.
 */

import { keyFor } from '@/lib/storage/scope'
import type { SongbookState } from './types'

/**
 * The base name; the key actually used is this scoped to the signed-in account by `keyFor`.
 *
 * **This cache is why another account's songbook names used to flash on screen.**
 * `SongbookProvider` reads it in a `useLayoutEffect` — before the browser paints — so it
 * replaced the correct, server-rendered state with whatever the previous reader of this
 * browser had left here, and `refresh()` only put it right a round trip later. The key said
 * what was stored and never whose it was, and nothing emptied it at sign-out.
 */
const KEY = 'songs:songbooks'

export function readSongbookCache(): SongbookState | null {
  if (typeof window === 'undefined') return null

  /* No scope means no cache, never an unscoped one: the snapshot baked into the page is
     always present and always this account's, so refusing costs a cache miss where guessing
     would cost the bug above. */
  const key = keyFor(KEY)
  if (key === null) return null

  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null

    const parsed = JSON.parse(raw) as Partial<SongbookState>
    if (!Array.isArray(parsed.songbooks) || typeof parsed.assignments !== 'object') return null
    if (parsed.assignments === null) return null
    /*
     * A cache written before sections existed has no `sections` and its assignments
     * point at songbook slugs rather than section ids. Both are caught here, and
     * that is the whole migration: an unrecognised shape is discarded and the state
     * falls back to the snapshot baked into the page. No key to version.
     */
    if (!Array.isArray(parsed.sections)) return null

    return {
      songbooks: parsed.songbooks.filter(
        (entry) => typeof entry?.slug === 'string' && typeof entry?.name === 'string',
      ),
      sections: parsed.sections.filter(
        (entry) =>
          typeof entry?.id === 'number' &&
          typeof entry?.songbookSlug === 'string' &&
          typeof entry?.name === 'string' &&
          typeof entry?.position === 'number',
      ),
      assignments: Object.fromEntries(
        Object.entries(parsed.assignments).filter(([, id]) => typeof id === 'number'),
      ) as Record<string, number>,
    }
  } catch {
    // Disabled storage, or a shape from an older version: fall back to the
    // snapshot baked into the page.
    return null
  }
}

export function writeSongbookCache(state: SongbookState): void {
  if (typeof window === 'undefined') return

  const key = keyFor(KEY)
  if (key === null) return

  try {
    window.localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // The cache is optional by design.
  }
}
