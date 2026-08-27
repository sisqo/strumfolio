'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { Notation } from '@/lib/music/chord'
import type { Instrument } from '@/lib/music/shapes'
import { loadPrefs, recordSongOpened, saveGlobalPrefs, saveSongPrefs } from '@/lib/prefs/actions'
import { prefsQueue } from '@/lib/prefs/queue'
import {
  readGlobalPrefs,
  readSongPrefs,
  writeGlobalPrefs,
  writeSongPrefs,
} from '@/lib/prefs/store'
import {
  DEFAULT_GLOBAL_PREFS,
  DEFAULT_SONG_PREFS,
  type ChordDisplay,
  type GlobalPrefs,
  type SongPrefs,
  clampCapo,
  clampSemitones,
  clampSpeed,
  clampZoom,
} from '@/lib/prefs/types'

interface PrefsContextValue {
  global: GlobalPrefs
  song: SongPrefs
  /** Number of changes not yet saved to the server. */
  pending: number
  setZoomStep: (step: number) => void
  setNotation: (notation: Notation) => void
  setInstrument: (instrument: Instrument) => void
  setChordDisplay: (chordDisplay: ChordDisplay) => void
  setSemitones: (semitones: number) => void
  setScrollSpeed: (step: number) => void
  setCapo: (fret: number) => void
  setNote: (note: string) => void
}

const PrefsContext = createContext<PrefsContextValue | null>(null)

/**
 * Holds the reader's preferences for the page.
 *
 * Three layers, in the order they run:
 *
 * 1. The local cache is read in a layout effect — before paint, so the sheet
 *    never appears in the wrong key, and not during render, which would make the
 *    server and client markup differ and trip a hydration error.
 * 2. The server's values arrive after mount and win, because the database is the
 *    source of truth — except where a change is still queued, which would
 *    otherwise be silently overwritten by the older stored value.
 * 3. Changes are written to the cache and queued for the server.
 */
export function PrefsProvider({
  songSlug,
  persist = true,
  children,
}: {
  /** Null on pages that show no single song, such as the index. */
  songSlug: string | null
  /**
   * False for Strum Together's guest view: a reader with no account of their own,
   * remounted fresh for every song it follows. There is nothing of theirs to load and
   * nothing to remember between songs — and, if the browser showing the link happens to
   * also be signed in, nothing that may end up saved under that real account instead.
   * State lives only in memory, gone the moment this provider unmounts.
   */
  persist?: boolean
  children: ReactNode
}) {
  const [global, setGlobal] = useState<GlobalPrefs>(DEFAULT_GLOBAL_PREFS)
  const [song, setSong] = useState<SongPrefs>(DEFAULT_SONG_PREFS)
  const [pending, setPending] = useState(0)

  /*
   * `song` state alone cannot tell `updateSong` what the *other* fields should be
   * when two of its callers fire in the same effect flush — Strum Together's guest view
   * does exactly that, pushing a new semitones value and resetting capo/scroll speed as
   * two separate effects reacting to the same song change. Both would otherwise read the
   * same pre-flush `song` closure and the second call's spread would erase the first's
   * write. Keeping this ref in lockstep with every `setSong` call, including inside
   * `updateSong` itself, means each call merges against what the *previous* call in the
   * same flush just decided, not what render last saw.
   */
  const songRef = useRef(song)

  useLayoutEffect(() => {
    if (!persist) return
    setGlobal(readGlobalPrefs())
    const nextSong = songSlug === null ? DEFAULT_SONG_PREFS : readSongPrefs(songSlug)
    songRef.current = nextSong
    setSong(nextSong)
  }, [songSlug, persist])

  useEffect(() => {
    if (!persist) return
    prefsQueue.setHandlers({ saveGlobal: saveGlobalPrefs, saveSong: saveSongPrefs })
    prefsQueue.watchConnection()
    return prefsQueue.subscribe(setPending)
  }, [persist])

  useEffect(() => {
    if (!persist) return
    let cancelled = false

    loadPrefs(songSlug)
      .then((stored) => {
        if (cancelled) return

        if (stored.global !== null && !prefsQueue.hasPending('global')) {
          setGlobal(stored.global)
          writeGlobalPrefs(stored.global)
        }
        if (stored.song !== null && songSlug !== null && !prefsQueue.hasPending(`song:${songSlug}`)) {
          songRef.current = stored.song
          setSong(stored.song)
          writeSongPrefs(songSlug, stored.song)
        }
      })
      .catch(() => {
        // Offline or signed out: the cache already gave us something to read.
      })

    // Fire-and-forget, and deliberately not awaited alongside the read above: a
    // slow or failing write here must never delay the sheet showing the right key.
    // `recordSongOpened` already catches its own errors, so there is nothing to
    // catch here — only a promise this effect does not need to wait for.
    if (songSlug !== null) void recordSongOpened(songSlug)

    return () => {
      cancelled = true
    }
  }, [songSlug, persist])

  /*
   * Setting a preference to the value it already has is not a change, and saying so
   * here rather than at each call site is what keeps the queue honest: it would
   * otherwise send the server a write it does not need and light the unsaved dot for
   * nothing.
   *
   * Reachable since the reading panel replaced the notation toggle with a pair of
   * buttons. A toggle could only ever be called with the other value; "Do" can be
   * pressed while the notation is already Do.
   */
  const updateGlobal = useCallback(
    (next: GlobalPrefs) => {
      if (
        next.zoomStep === global.zoomStep &&
        next.notation === global.notation &&
        next.instrument === global.instrument &&
        next.chordDisplay === global.chordDisplay
      ) {
        return
      }

      setGlobal(next)
      if (!persist) return
      writeGlobalPrefs(next)
      prefsQueue.enqueueGlobal(next)
    },
    [global, persist],
  )

  const updateSong = useCallback(
    (patch: SongPrefs | ((prev: SongPrefs) => SongPrefs)) => {
      const prev = songRef.current
      const next = typeof patch === 'function' ? patch(prev) : patch

      if (
        next.semitones === prev.semitones &&
        next.scrollSpeed === prev.scrollSpeed &&
        next.capo === prev.capo &&
        next.note === prev.note
      ) {
        return
      }

      songRef.current = next
      setSong(next)
      if (!persist || songSlug === null) return
      writeSongPrefs(songSlug, next)
      prefsQueue.enqueueSong(songSlug, next)
    },
    [songSlug, persist],
  )

  const value = useMemo<PrefsContextValue>(
    () => ({
      global,
      song,
      pending,
      setZoomStep: (step) => updateGlobal({ ...global, zoomStep: clampZoom(step) }),
      setNotation: (notation) => updateGlobal({ ...global, notation }),
      setInstrument: (instrument) => updateGlobal({ ...global, instrument }),
      setChordDisplay: (chordDisplay) => updateGlobal({ ...global, chordDisplay }),
      setSemitones: (semitones) =>
        updateSong((prev) => ({ ...prev, semitones: clampSemitones(semitones) })),
      setScrollSpeed: (step) => updateSong((prev) => ({ ...prev, scrollSpeed: clampSpeed(step) })),
      setCapo: (fret) => updateSong((prev) => ({ ...prev, capo: clampCapo(fret) })),
      setNote: (note) => updateSong((prev) => ({ ...prev, note })),
    }),
    [global, song, pending, updateGlobal, updateSong],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}

export function usePrefs(): PrefsContextValue {
  const context = useContext(PrefsContext)
  if (context === null) {
    throw new Error('usePrefs must be used inside a PrefsProvider')
  }
  return context
}
