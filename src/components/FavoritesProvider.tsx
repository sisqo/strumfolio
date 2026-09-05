'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'

import { loadFavoriteSlugs } from '@/lib/favorites/actions'
import { readFavoritesOnly, writeFavoritesOnly } from '@/lib/favorites/filter'
import { resolveFavorites } from '@/lib/favorites/resolve'
import { prefsQueue } from '@/lib/prefs/queue'
import { readCachedFavorites } from '@/lib/prefs/store'

interface FavoritesContextValue {
  /** Whether this reader has starred this song. */
  isFavorite: (slug: string) => boolean
  /** The starred slugs, for a caller that needs the set rather than one answer. */
  favorites: ReadonlySet<string>
  /** Whether the lists are showing only the starred songs. */
  only: boolean
  setOnly: (only: boolean) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

/**
 * The stars of the account on screen, and whether the lists are filtered by them.
 *
 * Two things in one provider because every screen that wants either wants both, and
 * because a hook called once per consumer would fetch the list again for each of them —
 * the reading page alone has three, the title's own count, the bar's arrows and the quick
 * search panel.
 *
 * Which answer wins lives in `resolveFavorites`, where it is tested. What this adds is the
 * plumbing those rules need:
 *
 * - **the server's current answer**, fetched once after mount, `null` while it has not
 *   arrived or could not be had — the same job `useLiveSongs` does for the rows themselves,
 *   and needed for the same reason: the shell may have come from the service worker's
 *   cache and be a snapshot of unknown age.
 * - **this visit's own writes**, taken from the queue rather than from a callback on the
 *   button. `toggleFavorite` enqueues, the queue notifies, and this reads back both the
 *   slug and the value — which is what makes a star tapped on a song appear on the lists
 *   behind it, and what keeps a star tapped twice inside the debounce window honest.
 * - **the local cache**, read only when the server could not answer, since that is the
 *   only state in which it is the freshest thing on the device.
 *
 * `only` starts false on the server and on the first client render, then a layout effect
 * puts the reader's own answer in before paint — the same dance `SongbookSongs` does for
 * its folds, and for the same hydration reason.
 */
export function FavoritesProvider({
  initial,
  children,
}: {
  /** The starred slugs as the page was rendered with them. */
  initial: string[]
  children: ReactNode
}) {
  const [live, setLive] = useState<string[] | null>(null)
  const [writes, setWrites] = useState<Record<string, boolean>>({})
  const [only, setOnlyState] = useState(false)

  useLayoutEffect(() => {
    setOnlyState(readFavoritesOnly())
  }, [])

  const setOnly = useCallback((next: boolean) => {
    setOnlyState(next)
    writeFavoritesOnly(next)
  }, [])

  useEffect(() => {
    let cancelled = false

    loadFavoriteSlugs()
      .then((slugs) => {
        if (!cancelled && slugs !== null) setLive(slugs)
      })
      .catch(() => {
        // Offline or signed out: the rendered list still stands, and the local cache
        // then decides for every song this device has an answer about.
      })

    return () => {
      cancelled = true
    }
  }, [])

  /*
   * Every queued write is merged in and none is ever dropped — see `resolveFavorites` for
   * why an override has to outlive the write that produced it.
   *
   * The queue notifies on every preference of any kind, a zoom step included, so the
   * common case has to cost nothing: with no star queued this returns before touching
   * state at all, and an unchanged merge returns the same object so React bails out of the
   * render rather than rebuilding the set.
   */
  useEffect(() => {
    const sync = () => {
      const queued = prefsQueue.pendingFavorites()
      if (Object.keys(queued).length === 0) return

      setWrites((previous) => {
        let changed = false
        const next = { ...previous }
        for (const [slug, starred] of Object.entries(queued)) {
          if (next[slug] === starred) continue
          next[slug] = starred
          changed = true
        }
        return changed ? next : previous
      })
    }

    return prefsQueue.subscribe(sync)
  }, [])

  const favorites = useMemo(
    () =>
      resolveFavorites({
        baked: initial,
        live,
        // Read lazily, and only in the one state that consults it: walking every cached
        // song is not work to do on a page whose server has answered.
        cached: live === null ? readCachedFavorites() : {},
        writes,
      }),
    [initial, live, writes],
  )

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      isFavorite: (slug: string) => favorites.has(slug),
      only,
      setOnly,
    }),
    [favorites, only, setOnly],
  )

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const context = useContext(FavoritesContext)
  if (context === null) {
    throw new Error('useFavorites must be used inside a FavoritesProvider')
  }
  return context
}
