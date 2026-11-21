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

import { useOnline } from '@/lib/useOnline'

import {
  addSampleSongbook,
  arrangeSongbooks,
  createSongbook,
  loadSongbooks,
  moveSong,
  purgeSongbook,
  removeSongbook,
  renameSongbook,
} from '@/lib/songbooks/actions'
import { readSongbookCache, writeSongbookCache } from '@/lib/songbooks/store'
import {
  type SongbookState,
  type CreateResult,
  type CreateSectionResult,
  type WriteResult,
  songbookOf,
  sectionsOf,
} from '@/lib/songbooks/types'
import type { ArrangedSection } from '@/lib/songbooks/order'
import type { Section } from '@/lib/data/types'
import {
  arrangeSongbook,
  createSection,
  purgeSection,
  removeSection,
  renameSection,
} from '@/lib/sections/actions'

interface SongbookContextValue extends SongbookState {
  /** False while the browser reports no connection: management is disabled. */
  online: boolean
  /** Re-reads the layer. Exposed because saving a song can change its songbook. */
  refresh: () => Promise<void>

  create: (name: string) => Promise<CreateResult>
  /** Adds the one-click "Example songbook" — offered only while the account has none. */
  addSample: () => Promise<CreateResult>
  rename: (slug: string, name: string) => Promise<WriteResult>
  remove: (slug: string, moveTo: string | null) => Promise<WriteResult>
  /** Deletes a songbook and everything in it — its sections and their songs, no move. */
  purge: (slug: string) => Promise<WriteResult>
  /** Sends a song to a section, of this songbook or of another. */
  move: (songSlug: string, sectionId: number) => Promise<WriteResult>
  /** Writes the order of the reader's own songbooks — see `arrange` for a songbook's own. */
  arrangeSongbooks: (slugs: string[]) => Promise<WriteResult>

  addSection: (songbookSlug: string, name: string) => Promise<CreateSectionResult>
  renameSection: (id: number, name: string) => Promise<WriteResult>
  removeSection: (id: number, moveTo: number | null) => Promise<WriteResult>
  /** Deletes a section and every song inside it, no move. */
  purgeSection: (id: number) => Promise<WriteResult>
  arrange: (songbookSlug: string, groups: ArrangedSection[]) => Promise<WriteResult>

  nameOf: (slug: string | null | undefined) => string | null
  /** The sections of one songbook, in the order it is played through. */
  divisionsOf: (songbookSlug: string) => Section[]
  /** Which songbook a song is in, by way of its section. */
  homeOf: (songSlug: string) => string | null
}

const SongbookContext = createContext<SongbookContextValue | null>(null)

/**
 * Holds the mutable songbook layer.
 *
 * Three sources: the snapshot the page was rendered with, the local cache, and the
 * server, which is authoritative. **The cache is adopted only offline** (2026-11-21). The
 * pages are rendered per request, so online `initial` is already the server's answer and
 * the cache — written by home, a songbook and `/add`, whenever those were last open — can
 * only be older: the editor, which does not refresh on mount, showed a section menu without
 * a section added since on another device, and choosing a songbook there filed the song in
 * a section that no longer existed. Offline the page itself came from the service worker's
 * copy, and there the cache may be the newer of the two. Read in a layout effect so it stays
 * out of render — that would differ from the server markup and trip hydration — while still
 * landing before the browser paints.
 */
export function SongbookProvider({
  initial,
  refreshOnMount = true,
  children,
}: {
  /** The snapshot this page was rendered with, so the first paint is already right. */
  initial: SongbookState
  /**
   * False on the reading pages, where the round trip is spent on the song itself.
   *
   * A song page asks the server for its own content, because words and chords that
   * disagree with the database are the bug this layer exists to prevent. Which
   * songbook the song sits in is a different matter: the header would then name
   * a songbook whose songs the arrows still step through as they were at build
   * time, so one strip of the page would contradict the pages it links to.
   *
   * A write refreshes anyway — including a save that moves the song — because then
   * there is something new to learn.
   */
  refreshOnMount?: boolean
  children: ReactNode
}) {
  const [state, setState] = useState<SongbookState>(initial)
  const online = useOnline()

  useLayoutEffect(() => {
    if (navigator.onLine) return
    const cached = readSongbookCache()
    if (cached !== null) setState(cached)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const fresh = await loadSongbooks()
      if (fresh !== null) {
        setState(fresh)
        writeSongbookCache(fresh)
      }
    } catch {
      // Offline or signed out: the cache and the baked snapshot still stand.
    }
  }, [])

  useEffect(() => {
    if (refreshOnMount) void refresh()
  }, [refresh, refreshOnMount])

  /**
   * Writes go to the server and the whole layer is re-read afterwards, rather
   * than patched locally. There is no offline queue here on purpose: this is
   * shared structure, where a last-write-wins between devices is not as harmless
   * as it is on one reader's transposition.
   */
  const afterWrite = useCallback(
    // Generic so a create can carry its new slug or id back out through here.
    async <T extends WriteResult | CreateResult | CreateSectionResult>(result: T): Promise<T> => {
      if (result.ok) await refresh()
      return result
    },
    [refresh],
  )

  const value = useMemo<SongbookContextValue>(
    () => ({
      ...state,
      online,
      refresh,
      create: async (name) => afterWrite(await createSongbook(name)),
      addSample: async () => afterWrite(await addSampleSongbook()),
      rename: async (slug, name) => afterWrite(await renameSongbook(slug, name)),
      remove: async (slug, moveTo) => afterWrite(await removeSongbook(slug, moveTo)),
      purge: async (slug) => afterWrite(await purgeSongbook(slug)),
      move: async (songSlug, sectionId) => afterWrite(await moveSong(songSlug, sectionId)),
      arrangeSongbooks: async (slugs) => afterWrite(await arrangeSongbooks(slugs)),

      addSection: async (songbookSlug, name) =>
        afterWrite(await createSection(songbookSlug, name)),
      renameSection: async (id, name) => afterWrite(await renameSection(id, name)),
      removeSection: async (id, moveTo) => afterWrite(await removeSection(id, moveTo)),
      purgeSection: async (id) => afterWrite(await purgeSection(id)),
      arrange: async (songbookSlug, groups) =>
        afterWrite(await arrangeSongbook(songbookSlug, groups)),

      nameOf: (slug) =>
        slug == null ? null : (state.songbooks.find((entry) => entry.slug === slug)?.name ?? null),
      divisionsOf: (songbookSlug) => sectionsOf(state, songbookSlug),
      homeOf: (songSlug) => songbookOf(state, songSlug),
    }),
    [state, online, refresh, afterWrite],
  )

  return <SongbookContext.Provider value={value}>{children}</SongbookContext.Provider>
}

export function useSongbooks(): SongbookContextValue {
  const context = useContext(SongbookContext)
  if (context === null) {
    throw new Error('useSongbooks must be used inside a SongbookProvider')
  }
  return context
}
