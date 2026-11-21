/**
 * Which account's shelf a songbook slug is on, and whether the asking reader may see it — for
 * the two pages under `/songbooks/[slug]` and the layout above them.
 *
 * `null` for either «no such songbook» or «not this reader's», on purpose, same as
 * `access.ts`'s own reasoning. `accountOwnerEmail` is `null` only when there is no database at
 * all, in which case there is one local repertoire and nothing to check — see
 * `lib/data/index.ts`.
 *
 * **Asked by the layout first** (2026-11-21), which is what makes a missing songbook a 404: the
 * segment's `loading.tsx` wraps the page in Suspense, so a `notFound()` thrown from the page
 * streamed a 200 shell first — the scar `layout.tsx` already carries for `redirect()`.
 * `cache()` makes the page's own call the same query, not a second one.
 */

import { cache } from 'react'

import { accessTo } from '@/lib/auth/session'
import { songbookAccountOf } from '@/lib/data/access'
import { hasDatabase } from '@/lib/db/client'

export const resolveSongbook = cache(async (slug: string): Promise<{ accountOwnerEmail: string | null } | null> => {
  if (!hasDatabase) return { accountOwnerEmail: null }

  const owner = await songbookAccountOf(slug)
  if (owner === null) return null
  if ((await accessTo(owner)) === null) return null

  return { accountOwnerEmail: owner }
})
