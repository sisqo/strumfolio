'use client'

/**
 * Which sections a reader has opened, per songbook.
 *
 * In `localStorage` and not in the database, on purpose: closing a section is a gesture
 * of the hand, not a preference to find again on the tablet — and it has to work with no
 * network, which is the state this app is used in most.
 *
 * Only what somebody has actually chosen is written down. A section that is absent from
 * the map has not been decided about, and the screen is then free to apply its two
 * exceptions — a songbook with a single section, and the section you have just come
 * back from — without overruling anybody.
 */

import { keyFor } from '@/lib/storage/scope'

/** Base name; `keyFor` scopes it to the signed-in account — see `lib/storage/scope.ts`. */
const KEY = 'songs:sections'

/** sectionId → open, for the sections of one songbook. */
export type Folds = Record<string, boolean>

type Stored = Record<string, Folds>

function readAll(): Stored {
  if (typeof window === 'undefined') return {}

  /* No scope, no cache — never an unscoped one. Everything stays closed, which is the same
     answer this already gives when storage is unavailable. */
  const key = keyFor(KEY)
  if (key === null) return {}

  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return {}

    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}

    return parsed as Stored
  } catch {
    // Disabled storage, or a shape from an older version: everything stays closed.
    return {}
  }
}

export function readFolds(songbookSlug: string): Folds {
  const held = readAll()[songbookSlug]
  if (typeof held !== 'object' || held === null) return {}

  return Object.fromEntries(
    Object.entries(held).filter(([, open]) => typeof open === 'boolean'),
  ) as Folds
}

export function writeFolds(songbookSlug: string, folds: Folds): void {
  if (typeof window === 'undefined') return

  const key = keyFor(KEY)
  if (key === null) return

  try {
    window.localStorage.setItem(key, JSON.stringify({ ...readAll(), [songbookSlug]: folds }))
  } catch {
    // The memory is optional by design: the fold still works for this visit.
  }
}

/**
 * The song a link asked for, from `#song-<slug>`.
 *
 * A fragment rather than a query parameter, and that is not a detail: a query string
 * would make the URL miss its own entry in the precache, so the way back from a song
 * would stop working offline — which is precisely when it is needed.
 */
export function songFromHash(hash: string): string | null {
  const found = /^#song-(.+)$/.exec(decodeURIComponent(hash))
  return found === null ? null : found[1]
}
