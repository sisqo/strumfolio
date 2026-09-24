import { accessTo } from '@/lib/auth/session'
import { songAccountOf } from '@/lib/data/access'

/**
 * Whether the signed-in reader may open the song behind this slug — the reading page's own
 * `permitted`, for the per-song writes that take a slug from the browser.
 *
 * Slugs are unique across the installation and easy to guess, and `songIdOf` resolves any of
 * them, so a note, a preference or a star could be written against another account's song. It
 * leaked nothing of that song, but «saved» against «no such song» told any signed-in reader
 * what another account's repertoire held, and left rows nobody could ever read. Asking this
 * first makes a song one cannot open answer exactly like one that does not exist.
 *
 * Not a `'use server'` module: it is a check for server actions to call, never an endpoint.
 */
export async function mayOpenSong(slug: string): Promise<boolean> {
  const owner = await songAccountOf(slug)
  if (owner === null) return false
  return (await accessTo(owner)) !== null
}
