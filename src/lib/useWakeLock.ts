'use client'

import { useCallback, useEffect, useRef } from 'react'

/** Minimal shape of the Wake Lock API, which is not in the bundled DOM types. */
interface WakeLockSentinel {
  released: boolean
  release(): Promise<void>
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}

/**
 * Keeps the screen awake for as long as `active` is true.
 *
 * It was `useAutoScroll`'s own, and it moved out here the moment a second thing on this
 * screen could be running with nobody touching the glass: a metronome beating through a
 * verse the reader is not scrolling is exactly the case where the display would otherwise
 * sleep mid-song, on stage, which is the one place this app gets used. Neither hook can be
 * the other's home for it — auto-scroll runs without the metronome as often as the
 * metronome runs without auto-scroll — so it belongs to neither and is called by both.
 *
 * Two sentinels held at once is fine and is what happens when both are running: the API is
 * counted, and the screen stays awake until the last holder releases.
 *
 * Where the API is missing — Safari before 16.4, and any page not served over HTTPS — it
 * degrades silently. Everything the caller does still works; the screen simply behaves as
 * the reader's own settings say.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  const release = useCallback(() => {
    const sentinel = sentinelRef.current
    sentinelRef.current = null
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => {})
  }, [])

  const request = useCallback(async () => {
    const wakeLock = (navigator as Navigator & WakeLockNavigator).wakeLock
    if (!wakeLock) return
    try {
      sentinelRef.current = await wakeLock.request('screen')
    } catch {
      // Denied, or unsupported in this context. Whatever asked for it still works.
    }
  }, [])

  useEffect(() => {
    if (!active) {
      release()
      return
    }

    void request()
    return release
  }, [active, release, request])

  /** Wake locks are dropped when the page is hidden, so take it back on return. */
  useEffect(() => {
    const onVisibility = () => {
      // The browser releases the held sentinel itself on hide, but only flips its own
      // `released` flag — nothing here observes that, so the ref still points at a
      // sentinel that is already spent. Checking for null alone would never re-request
      // past the first hide/show cycle.
      const sentinel = sentinelRef.current
      if (document.visibilityState === 'visible' && active && (sentinel === null || sentinel.released)) {
        void request()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [active, request])
}
