'use server'

/**
 * What this reader has starred, asked fresh from the browser.
 *
 * The counterpart to `loadSongIndex` (`lib/library/actions.ts`) and it exists for the same
 * reason that one does: every screen listing songs is rendered per request, but the shell
 * it starts from may have come out of the service worker's cache and be a snapshot of
 * unknown age. This is how the browser finds out which stars have changed since.
 *
 * Scoped to the reader's **current account** by `listFavoriteSlugs`, so a global owner
 * switched into somebody's account gets their own stars on that account's songs and
 * nothing from anywhere else. Null means the question could not be asked — offline, signed
 * out, or no database — and never that nothing is starred; `resolveFavorites` is what
 * keeps those two apart.
 */

import { currentUser } from '@/lib/auth/session'
import { listFavoriteSlugs } from '@/lib/data/db'
import { hasDatabase } from '@/lib/db/client'

export async function loadFavoriteSlugs(): Promise<string[] | null> {
  if (!hasDatabase) return null

  const user = await currentUser()
  if (user === null) return null

  try {
    return await listFavoriteSlugs(user.accountOwnerEmail, user.email)
  } catch (error) {
    console.error('loadFavoriteSlugs failed', error)
    return null
  }
}
