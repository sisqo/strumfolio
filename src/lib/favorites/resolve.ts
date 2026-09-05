/**
 * Which songs are starred, out of answers that can each be right.
 *
 * The same layering `PrefsProvider` runs for one song, applied to a whole list, and pure
 * so that the interesting part — which answer wins — is testable on its own.
 *
 * - **`live`, whenever there is one.** The database is the single source of truth. `null`
 *   means only that it could not be asked, never that nothing is starred.
 * - **`baked` when there is not.** The list the page was rendered with, which offline is
 *   whatever the service worker had cached and may be of any age.
 * - **`cached`, only while `live` is `null`.** This device's own record of every song it
 *   has opened or starred. With the server unreachable it is the freshest thing there is;
 *   with the server answering it is the *older* of the two and must not overrule it, or a
 *   star removed on the tablet would keep showing on a phone that had opened the song once
 *   months ago.
 * - **`writes`, over everything.** What this visit has actually told the queue to save.
 *   These outlive their own writes on purpose: once a write has reached the server the
 *   value agrees with it anyway, so keeping the override costs nothing — while dropping it
 *   the moment the queue drained would hand the list back to a `live` snapshot fetched
 *   *before* that write, and put the star the reader just set straight back out.
 */
export function resolveFavorites({
  baked,
  live,
  cached,
  writes,
}: {
  /** The slugs the page was rendered with. */
  baked: readonly string[]
  /** The slugs the server has just answered with, or null if it could not be asked. */
  live: readonly string[] | null
  /** slug → starred, as this device remembers it. Consulted only when `live` is null. */
  cached: Readonly<Record<string, boolean>>
  /** slug → starred, for every star this visit has written. */
  writes: Readonly<Record<string, boolean>>
}): Set<string> {
  const resolved = new Set(live ?? baked)

  const apply = (answers: Readonly<Record<string, boolean>>) => {
    for (const [slug, starred] of Object.entries(answers)) {
      if (starred) resolved.add(slug)
      else resolved.delete(slug)
    }
  }

  if (live === null) apply(cached)
  apply(writes)

  return resolved
}
